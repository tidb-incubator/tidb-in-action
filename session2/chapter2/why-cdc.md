## 2.1 4.0 增量数据订阅 CDC

TiCDC (TiDB Change Data Capture) 是 TiDB 4.0 新推出通过拉取 TiKV 的 kv change log 来实现的 TiDB 增量数据同步工具。TiCDC 提供开放数据协议，可以轻松实现支持其他系统订阅数据变更，通过 TiCDC 可以实现缓存更新、数据实时分析等业务场景。TiCDC 还可以同步 TiDB 集群数据到其他 TiDB 集群或者 MySQL 中。

### 2.1.1 CDC 解决什么问题
在 TiCDC 工具出现之前，这样的功能是由 TiDB-Tools 工具中的 TiDB-Binlog 来实现的，TiDB-Binlog 通过收集各个 TiDB 实例产生的 binlog，并按照事务提交的时间排序后同步到下游，TiCDC 则是通过 TiKV 的 kv change log，在数据同步过程中的处理上两者有本质的区别。

### 1. 从易用性来看：
+ TiCDC 更易使用
	+ TiCDC 部署只需一个二进制文件，非常简洁
	+ TiCDC 可以全部使用 SQL 管理，不需要另外组件，自带 admin UI


### 2. 从性能上来看：
+ TiCDC 性能更好
	+ TiCDC 提供更良好的扩展性，可以应对超大规模 TiDB 集群的使用场景，在这一点 TiDB-Binlog 要弱于 TiCDC，Pump 集群具有一定的扩展性，但是 Drainer 是单节点归并排序，无法应对超大规模 TiDB 集群
	+ TiDB-Binlog 极端情况下 ( 丢失 Commit binlog ) ，需要反查 TiKV 事务状态，同步延迟可达到 10min。TiCDC 则一般具有 ms 级别的低延迟
    + 目前版本 TiDB-Binlog 的实现强依赖于 TiDB transaction 模型，会阻扰已知的下面的优化
		+ big transaction 功能
		+ 不从 PD 获取 commit ts
		+ 1 pc

### 3. 从可用性来看：
+ TiCDC 可用性更好
	+ TiCDC 多个结点写下游不会有单点瓶颈，直接在 watch KV 层变更，有天然数据安全性保证的，TiCDC 各节点无状态，通过 PD 的 etcd 保存元数据信息，因此可以很方便实现数据高可用及服务高可用
	+ TiDB-Binlog 需要单独解决数据安全和服务高可用问题，实现代价很高（目前都未实现）
