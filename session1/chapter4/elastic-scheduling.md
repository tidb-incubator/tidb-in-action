## 4.2 弹性调度
***弹性调度（Elastic Schedule）*** 是 TiDB 在 4.0 的新特性，通过与云环境结合后提供的一系列调度策略，可以让 TiDB 具备 ***自适应能力（Adaptive Capacity）*** ，即 TiDB 能根据用户的 workload 模式自动调节形态以达到资源的最大利用率。自适应能力是 TiDB 能够提供 DBaaS 服务的一项关键能力。

### 4.2.1 需求背景
传统上，我们一般将 TiDB 集群部署在 IDC 环境中，在这种情况下，用户通常希望各台机器的资源利率比较平均，并且各台机器需要预留足够的资源以应对高峰期，但大部分时间业务流量比较低且平均，机器的利用率相对于高峰期处在一个比较低的水平，造成了机器资源的浪费。而在云环境下，机器资源可以按需分配，并且云厂商能够支持秒级或分钟级交付，那么在平常的大部分时间里，就不需要让每台机器预留资源，而是应该尽可能地利用每台机器资源。当遇到资源利用高峰期时，可以临时扩容机器并且将一部分负载调度到新机器上，进而分散集群压力，保证性能稳定。

如何在云上来实现弹性调度，这不仅需要让 TiDB 内核具备更灵活的处理方式，还需要结合 TiDB Operator 来让它在云上对业务进行自适应调节。目前 4.0 已经初步具备以下两个方面的功能：
- 自动伸缩
- 动态调度

### 4.2.2 自动伸缩
自动伸缩（Auto-Scale）包含两方面的内容，一是弹性扩缩容节点，二是在扩缩容节点后自动均衡集群负载。

和 [Aurora](https://www.youtube.com/watch?v=mali0B4wus0) 做法类似，弹性伸缩节点可通过对一些系统指标设置一个阈值，比如 CPU 利用率（TiDB Server 或 TiKV Server）、QPS（TiKV Server）等，当集群在平衡状态下目标指标等于或者超过阈值一段时间以后，就会自动触发水平的弹性伸缩。

TiDB 借助 TiDB Operator 和 PD 来实现 Auto-Scale：
- TiDB Operator 通过 API 的方式暴露出期望的 TiDB / TiKV 节点数量
- TiDB Operator 定期获取 TiDB / TiKV 的 metrics 信息和 PD 上的集群状态信息
- TiDB Operator 通过内部的 Auto-Scaling 算法对 `TidbCluster.Spec.Replicas` 进行调整，从而实现 Auto-Scaling。

在 TiDB Operator 中，新增了 AutoScaler API 和 AutoScaler Controller，下面是一个 AutoScaler API 的例子：

```
apiVersion: pingcap.com/v1alpha1
kind: TidbClusterAutoScaler
metadata:
  name: autoscaler
  namespace: ela-demo
spec:
  cluster:
    name: ela-scheduling
    namespace: ela-demo
  metricsUrl: http://monitor-prometheus.ela-demo.svc:9090
  tidb:
    minReplicas: 8
    maxReplicas: 8
    scaleOutIntervalSeconds: 100
    scaleInIntervalSeconds: 100
    metricsTimeDuration: "1m"
    metrics:
      - type: "Resource"
        resource:
          name: "cpu"
          target:
            type: "Utilization"
            averageUtilization: 90
  tikv:
    minReplicas: 3
    maxReplicas: 5
    scaleOutIntervalSeconds: 100
    scaleInIntervalSeconds: 100
    metricsTimeDuration: "1m"
    metrics:
      - type: "Resource"
        resource:
          name: "cpu"
          target:
            type: "Utilization"
            averageUtilization: 70
```

其中：
* minReplicas：最小实例数
* maxReplicas：最大实例数
* scaleOutIntervalSeconds：每次触发 scale-out 的间隔时间
* scaleInIntervalSeconds： 每次触发 scale-in 的间隔时间

当集群扩缩容节点后，还需要进行快速的负载均衡。对于 TiDB 的负载均衡，需要客户端具备自动重新调整长连接的能力，使建立到 TiDB 上的连接能够重新均衡。而对于 TiKV，主要是通过 PD 发起对热点 Region 的动态调度，以达到快速分摊压力的目的，同时也能以最小的调度代价来提高弹性伸缩的速度。

### 4.2.3 动态调度
在上面提到了通过 TiDB Operator 扩缩容 TiKV 节点后，需要由 PD 来发起 Region 的热点调度，一般来说分为以下几种情况：

1. 请求分布相对平均，区域广
2. 请求分布相对平均，区域小
3. 请求分布不平均，集中在多个点
4. 请求分布不平均，集中在单个点

对于第一种情况，访问平均分布在集群的大部分 Region 中，目前调度不会对其做相关的特殊处理。对于第三种情况，现有的热点调度器已经能够识别并且对其进行调度。下面来介绍下对于第 2 种和第 4 种情况如何去做动态调整：

1. 根据负载动态分裂 ( Load Base Splitting)

对于上述第二种情况，会出现小区域的热点问题。特别是在 TiDB 实践中经常遇到的热点小表问题，热点数据集中在几个 Region 中，造成无法利用多台机器资源的情况。TiDB 4.0 中引入了根据负载动态分裂特性，即根据负载自动拆分 Region。其主要的思路借鉴了 CRDB 的[实现](https://www.cockroachlabs.com/docs/stable/load-based-splitting.html)，会根据设定的 QPS 阈值来进行自动的分裂。其主要原理是，若对该 Region 的请求 QPS 超过阈值则进行采样，对采样的请求分布进行判断。采样的方法是通过蓄水池采样出请求中的 20 个 key，然后统计请求在这些 key 的左右区域的分布来进行判断，如果分布比较平均并能找到合适的 key 进行分裂，则自动地对该 Region 进行分裂。

2. 热点隔离 (Isolate Frequently Access Region）

由于 TiKV 的分区是按 Range 切分的，在 TiDB 的实践中自增主建、递增的索引的写入等都会造成单一热点的情况，另外如果用户没有对 workload 进行分区，且访问是 non-uniform 的，也会造成单一热点问题。这些都是上述的第四种情况。根据过去的最佳实践经验，往往需要用户调整表结构，采用分区表，使用 shard_bits 等方式来使得单一分区变成多分区，才能进行负载均衡。而在云环境中，在用户不用调整 workload 或者表结构的情况下，TiDB 可以通过在云上弹性一个高性能的机器，并由 PD 通过识别自动将单一热点调度到该机器上，达到热点隔离的目的。该方法也特别适用于时事、新闻等突然出现爆发式业务热点的情况。

### 4.2.4 总结
TiDB 4.0 是一个更加成熟，易用的版本，并且随着 TiDB Operator 的成熟以及 DBaaS 的推出，TiDB 4.0 开始成为一个拥抱云的版本。在云上，调度关注的视角也发生了改变，这使得让 TiDB 自适应 workload 去调整数据库形态变成了可能。后续弹性调度这一块， TiDB 还将有更多的玩法，比如 Follower Read 与多数据中心场景的结合，以及 TiFlash 大家族的加入。未来的 TIDB，除了是一个 HTAP 的数据库，也会变成一个“智能”的数据库。
