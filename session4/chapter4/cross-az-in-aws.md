
## 4.4 AWS 跨 AZ 部署 TiDB
本节介绍了在 AWS 上的单一区域 (region)、跨三个可用区（Availability Zones，以下简称 AZ）部署 TiDB 过程中，遇到的问题和相应的变通方案。

### 4.4.1 比本地机房部署更高的故障率
根据我们的经验，每月平均至少有一个部署 TiDB 分布式数据库的 EC2 实例发生故障。在 AWS 上部署 TiDB 的这半年里，我们还经历过一次 AZ 不稳定的问题。下面提供了一些建议，帮助你时刻准备好应对各种类型的故障。

#### 1. 副本数
对于非关键性业务，考虑部署奇数个 PD 实例，并且建议接近选用的 AWS 区域的可用 AZ 数。TiKV region 副本数也是如此。例如，你选用的 AWS 区域提供了三个 AZ，那么建议你：


* 部署三个 PD 实例：每个 AZ 上部署一个 PD 实例
* 设置 max-replicas 为 3


这样即使单个 AZ 出现故障，也能最大程度的确保可用性。 建议使用奇数个数的 PD 和 region 副本数以避免脑裂问题。 如果你选用的 AWS 区域有三个以上的 AZ（例如 Northern Virginia 有六个 AZ），则可以考虑部署三副本或五副本。
对于任何关键性业务，考虑使用五副本或更多副本。 在我们的案例中，虽然我们选用的 AWS 区域只提供了三个 AZ，但我们仍然：

* 部署了五个 PD 实例：分布在三个 AZ 上 (2:2:1)
* 设置 max-replicas 为 5

与 max-replicas=3 相比，该设置不会在 AZ 故障期间提高可用性，但会减少由于 EC2 实例的偶然故障而导致集群服务中断的可能性。


#### 2. 位置标签 (location labels)


配置完正确的副本数后，记得给 TiKV 设置适当的位置标签。否则，你的集群将无法承受预期的故障。 设置标签的基本原则是：


* 每台主机都有唯一的标签
* 每个机架（如果有）都有唯一的标签
* 放置每个副本的每个逻辑组 (logical group) 都有唯一的标签
* 每个 AZ 都有唯一的标签


以实际情况为例（10 个 TiKV 实例分布在三个 AZ 上，实例数量：1a:1b:1c=2:4;4；max-replicas=5），则恰当的标签为：


* PD：location-labels = ["az","zone","host"]
* TiKV：

| az      |  zone    | host        |   
| :----   |:----     |:----        |
| az=1a   | zone=1   | host=1a_1   | 
| az=1a   | zone=1   | host=1a_2   | 
| az=1b   | zone=2   | host=1b_1   | 
| az=1b   | zone=2   | host=1b_2   | 
| az=1b   | zone=3   | host=1b_3   | 
| az=1b   | zone=3   | host=1b_4   | 
| az=1c   | zone=4   | host=1c_1   | 
| az=1c   | zone=4   | host=1c_2   | 
| az=1c   | zone=5   | host=1c_3   | 
| az=1c   | zone=5   | host=1c_4   | 



需要注意的是 zone 是一个逻辑的标签，PD 在调度时首先会尝试将 Region 的 Peer 放置在不同的 AZ，此时无法满足(3 个 AZ ,5 个副本)，下一步保证放置在不同的 az.zone 中( 此时 5 个 zone，5 个副本，满足要求 )。这样确保了在正常情况下，使用 az.zone 将每个副本（即 Region peer）放置在每个逻辑组（即 zone）中。 如果可用 az.zone 的数量少于 5，比如 zone 或 AZ 级别的故障出现时，将使用 az.zone.host 标签来均匀调度五个 Region peers，以保持最大可用性。

#### 3. 置放群组 (placement groups)

如果你想减少相关的硬件故障，可以考虑使用 [Placement Groups](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/placement-groups.html)。在不同的场景下，
Partition Placement Groups 和 Spread Placement Groups 各有用处。记住要额外配置位置标签（例如机架的标签）以充分利用 placement groups。


### 4. 备份
理想情况下，为了防止 AWS 上的单一区域不可用，一般首选某种形式的多区域部署方式进行部署。但如果你的部署被限制在单个区域（比如数据必须与服务位于同一国家），建议将数据备份到另一个位置，以保证业务可用性。

在另一位置进行每日全量和增量备份，能帮助你在该区域恢复可用时恢复业务。请注意，与多区域部署相比，这种部署方式的恢复时间目标 (Recovery Time Objective, RTO) 将更高。


## 4.4.2 更高延迟的 AZ

AWS 区域中的 AZ 可能带有不对称的延迟。例如，与其他两个 AZ（延迟均小于 1 毫秒）相比，同一区域的另一个 AZ 具有更高的延迟（2～3 毫秒）。

以下示例中，假设我们有三个 AZ (1a, 1b, 1c)，并且其中一个 AZ (1a) 的延迟比其他两个 AZ 的延迟高。

### Reject region leaders  


在正确设置了位置标签后，你可以配置标签的属性以阻止在特定 AZ 中选举 region leader。
```
$ pd-ctl --pd="http://pd-url:2379"

» config set label-property reject-leader az 1a

» config show label-property

{
  "reject-leader": [
    {
      "key": "az",
      "value": "1a"
    }
  ]
}
```

###  1. 设置 PD leader 选举的优先级

对于延迟较高的 AZ，我们可以降低其中 PD 实例选举 leader 的优先级，这样能让其他延迟低的 AZ 优先选举 PD leader。在以下示例中，对于 1a 中的 PD，我们将 leader_priority 设置为 3；对于 1b 和 1c 中的 PD，我们将 leader_priority 设置为 5。 leader_priority 的值越大，优先级越高。
```
» member leader_priority pd_1a_1 3
Success!

» member leader_priority pd_1c_1 5
Success!

» member leader_priority pd_1b_1 5
Success!


» member
{
...
  "members": [
    {
      "name": "pd_1a_1",
...
      "leader_priority": 3
    },
    {
      "name": "pd_1b_1",
...
      "leader_priority": 5
    },
...
    {
      "name": "pd_1c_1",
...
      "leader_priority": 5
    }
  ],
  "leader": {
...
  },
  "etcd_leader": {
...
  }
}
```

### 2. 重新放置 TiDB server 服务器
考虑将 TiDB server 服务器从较高延迟的 AZ 移到其他 AZ。例如，如果每个 AZ 中有两台 TiDB 服务器（1a、1b 和 1c 中各放两台），则可以将 1a 中的两台 TiDB 服务器分别移至 1b 和 1c（1b 和 1c 中各放三台）。 请注意，该操作牺牲了性能的高可用性——如果放置 TiDB 服务器的其中一个 AZ 发生故障，对工作负载的影响会更大。

## 4.4.3 性能波动
### 1. 报警

Adjust the alerts if you know for sure that triggered alerts are false alarms due to AWS hardware. For our deployment on AWS, alerts related to disk latency had to be adjusted in 2 ways:

* Increase “for” duration from 1m to 5m so that intermittent performance degradations for short period are ignored
* Increase the threshold so that lower hardware performance compared to the on-prem deployment is accounted for

如果你确定触发的报警是由于 AWS 硬件引起的错误报警，建议调整报警项。对于我们在 AWS 上的部署，与磁盘延迟有关的报警项必须通过两种方式进行调整：


* 在报警规则里将 “for” 部分设置的等待时间从 1m 增加到 5m，从而可以忽略短期的，间歇性的性能下降
* 增加阈值，以便解决与本地部署相比较低的硬件性能
### 2. 硬件选择

在相同实例类型的 EC2 实例中，我们观察到性能差异高达 20％。 因此，建议考虑以下做法：

* 在最初部署 TiDB 集群时，进行基准测试并选择性能更好的实例。
* 定期替换 EC2 实例，从而将性能不佳的实例淘汰，替换为性能更好的实例。这也是一个很好的演习机会——练习如何轻松地从 TiDB 集群中删除节点或向其中添加节点。




