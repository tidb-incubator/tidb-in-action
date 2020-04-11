# 2.1 4.0 增量数据订阅 CDC

TiCDC (TiDB Change Data Capture) 是 TiDB 4.0 新推出通过拉取 TiKV 的 `kv change log` 来实现的 TiDB 增量数据同步工具。TiCDC 提供开放数据协议，可以轻松实现支持其他系统订阅数据变更，支持缓存更新、数据实时分析等业务场景。TiCDC 还可以同步 TiDB 集群数据到其他 TiDB 集群或者 MySQL 中。

