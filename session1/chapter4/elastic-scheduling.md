## 4.2 弹性调度
***弹性调度（Elastic Schedule）*** 是 TiDB 在 4.0 的新特性，与云环境结合提供的一系列调度策略，可以让 TiDB 具备***自适用能力（Adaptive Capacity）***，即 TiDB 能根据用户的 workload 模式自动调节形态以达到资源的最大利用率。自适用能力是 TiDB 能够提供 DBaaS 服务的一项关键能力。

### 4.2.1 需求背景
在云环境中的弹性调度可极大节省机器资源，节约成本。传统上，将 TiDB 集群部署在 IDC 环境中，即将集群部署在相同或不同机房，在这种环境下，通常希望各台机器的资源利率用比较平均，并且需要预留足够的机器资源以应对高峰期，如下图（红色为已用资源，绿色为未用资源）：


![host_utilization_avg.png](/res/session1/chapter4/elastic-scheduling/host_utilization_avg.png)

但大部分时间业务流量比较低且平均，机器的利用率相对于高峰期处在一个比较低的水平，这样会造成机器资源的浪费。而在云环境下，机器资源可以按需分配，并且云厂商能够支持秒级或分钟级交付，那么在平常的大部分时间，就不需要让每台机器预留资源，而是尽可能地利用每台机器资源，如下图：

![host_utilization_max.png](/res/session1/chapter4/elastic-scheduling/host_utilization_max.png)

当遇到资源利用高峰期时，可以临时扩容机器并且将一部分负载调度到新机器上，进而分散集群压力，保证性能稳定。

如何在云上来实现弹性调度，这不仅需要让 TiDB 内核更具灵活的处理方式，还需要结合 TiDB Operator 来让它在云上对业务进行自适用。目前 4.0 已经初步具备以下两个方面。

### 4.2.2 自动伸缩
自动伸缩（Auto-Scale）包含两方面的内容，一是弹性扩缩容节点，二是在扩缩容节点后自动均衡集群负载。

和 [Aurora](https://www.youtube.com/watch?v=mali0B4wus0) 做法类似，弹性伸缩节点可通过对指标或者某种资源的利用率来设置一个阈值，比如 CPU 利用率（TiDB Server 或 TiKV Server）、QPS（TiKV Server）等，当集群在平衡状态下目标指标等于或者超过阈值一段时间以后，就会自动触发水平的弹性伸缩。

TiDB 借助 TiDB Operator 和 PD 来实现 Auto-Scale。目前由 TiDB Operator 组件定期获取 TiDB / TiKV 的 metrics 信息后，通过 API 的方式暴露出期望的 TiDB / TiKV numbers，然后由 TiDB Operator 定期拉取 PD API 信息，通过内部的 Auto-Scaling 算法对 TidbCluster.Spec.Replicas 进行调整，从而实现 Auto-Scaling。在 TiDB Operator 中，新增了 Autoscaler API 和 Autoscaler Controller，下面是一个 Autoscaler API 的例子：

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

当集群的资源发生了变化之后，还需要进行快速的负载均衡。对于 TiDB 的负载均衡，需要客户端或者 LB 层具备自动重新调整长连接的能力，使建立到 TiDB 上的连接能够均衡。而对于 TiKV，弹性节点的目的主要是快速地分摊压力，因此调度主要是 PD 来发起对热点 Region 的调度，这样能以最小的调度代价来提高弹性伸缩的速度。

### 4.2.3 动态调度
在上面也提到了 TiDB Operator 通过扩缩容节点后，弹性节点需要尽快的分担压力，而这一环节主要的工作在于存储层 TiKV 数据的调度。前面已经讲过对于 TiKV 的负载均衡主要是通过热点调度，因此如何能处理热点的调度是需要 PD 来考虑的。一般来说分为以下几种情况：

1. 请求分布相对平均，区域广
2. 请求分布相对平均，区域小
3. 请求分布不平均，集中在多个点
4. 请求分布不平均，集中在单个点

对于第一种情况，相当于没有热点的情况，访问平均分布在集群的大部分 Region 中，这种情况一般不会出现突然的业务流量爆发，目前调度不会对其做相关的特殊处理，建议根据情况进行扩容。对于第三种情况，现有的热点调度器已经能够识别并且对其进行调度。下面来介绍下对于第 2 种和第 4 种情况如何去做动态调整：

1. 根据负载动态分裂 ( Load Base Splitting)
对于上述第二种情况，会出现小区域的热点问题。特别是在 TiDB 实践中经常遇到的热点小表问题，热点数据集中在几个 Region 中，造成无法利用多台机器的资源。 4.0 中引入了根据负载动态分裂特性，即根据负载自动拆分 Region。其主要的思路借鉴了 CRDB 的[实现](https://www.cockroachlabs.com/docs/stable/load-based-splitting.html)，会根据设定的 QPS 阈值来进行自动的分裂。其主要原理是，若对该  Region 的请求 QPS 超过阈值则进行采样，对采样的请求分布进行判断。采样的方法是通过蓄水池采样出请求中的 20 个 key，然后统计请求在这些 key 的左右区域的分布来进行判断，如果分布比较平均并能找到合适的 key 进行分裂，则自动地对该 Region 进行分裂。

2. 热点隔离 (Isolate Frequently Access Region）
由于 TiKV 的分区是按 Range 切分的，在 TiDB 的实践中自增主建、递增的索引的写入等都会造成单一的热点情况，另外用户没有对 workload 没有进行分区，且访问是 non-uniform 的，也就会造成单一的热点问题。这些都是上述的第四种情况。根据过去的最佳实践经验，往往需要用户调整表结构，采用分区表，使用 shard_bits 等方式来使得单一的分区变成一个多分区的情况，才能进行负载均衡。而在云上，这又使得 TiDB 有另外一个方式，可以帮助用户不用调整 workload 或者调整表结构。通过在云上面弹性一个高性能的机器，PD 通过识别自动将这个单一的热点调度到高性能机器上，进行隔离。该方法也特别适用于时事、新闻等突然出现爆发式业务热点的情况。

### 4.2.4 总结
TiDB 的 4.0 是一个更加成熟，易用的版本，并且随着 TiDB Operator 的成熟以及 DBaaS 的推出， TiDB 4.0 是一个开始拥抱云的版本。在云上，调度关注的视角也发生了改变，这使得让 TiDB 自适用 workload 去调整数据库形态变成了可能。后续弹性调度这一块， TiDB 还将有更多的玩法，比如 Follower Read 与多数据中心场景的结合，以及 TiFlash 大家族的加入。未来的 TIDB，除了是一个 HTAP 的数据库，也会变成一个“智能”的数据库。
