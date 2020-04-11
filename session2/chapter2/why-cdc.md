## 2.1.1 CDC 解决什么问题

在 TiCDC 工具出现之前，数据同步功能是由 TiDB-Tools 工具中的 TiDB-Binlog 来实现的。TiDB-Binlog 通过收集各个 TiDB 实例产生的 binlog，并按照事务提交的时间排序后同步到下游。TiCDC 则是通过 TiKV 的 `KV Change Logs` 来实现的，在数据同步过程中的处理上，两者有本质的区别。

### 易用性

TiCDC 更易使用：
* TiCDC 部署只需一个二进制文件，非常简洁
* TiCDC 可以全部使用 SQL 管理，不需要另外组件，而且自带管理界面

### 性能

TiCDC 性能更好：
* TiCDC 提供更良好的扩展性，可以应对超大规模 TiDB 集群的使用场景，在这一点上 TiDB-Binlog 要弱于 TiCDC，Pump 集群虽然具有一定的扩展性，但是 Drainer 是单节点归并排序，无法应对超大规模 TiDB 集群
* TiDB-Binlog 在极端情况下可能会丢失 Commit Binlog，需要反查 TiKV 事务状态，同步延迟可达到 10 分钟，而 TiCDC 的同步延迟通常在毫秒级别
* 目前版本 TiDB-Binlog 的实现强依赖于 TiDB Transaction 模型，会阻扰已知的一些优化，比如 Big Transaction 功能、不从 PD 获取 Commit Timestamp 等

### 可用性

TiCDC 可用性更好：
* TiCDC 多个节点写下游不会有单点瓶颈，直接在 watch KV 层变更，有天然数据安全性保证
* TiCDC 各节点无状态，通过 PD 的 etcd 保存元数据信息，因此可以很方便实现数据高可用及服务高可用
* TiDB-Binlog 需要单独解决数据安全和服务高可用问题，实现代价很高，且目前都未实现

