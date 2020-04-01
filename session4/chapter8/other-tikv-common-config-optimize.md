## 8.2.3 其他常见优化设置

1. Block-cache 
TiKV 使用了 RocksDB 的 Column Family (CF) 特性，KV 数据最终存储在默认 RocksDB 内部的 default、write、lock 3 个 CF 内。

* default CF 存储的是真正的数据，与其对应的参数位于 [rocksdb.defaultcf] 项中。
* write CF 存储的是数据的版本信息（MVCC）、索引、小表相关的数据，相关的参数位于 [rocksdb.writecf] 项中。
* lock CF 存储的是锁信息，系统使用默认参数。
* Raft RocksDB 实例存储 Raft log。default CF 主要存储的是 Raft log，与其对应的参数位于 [raftdb.defaultcf] 项中。
* TiDB 3.0 版本及以上所有 CF 共享一个 Block-cache，用于缓存数据块，加速 RocksDB 的读取速度，TiDB 2.1 版本及以下通过参数 block-cache-size 控制每个 CF Block-cache 大小，Block-cache 越大，能够缓存的热点数据越多，对读取操作越有利，同时占用的系统内存也会越多。
* 每个 CF 有各自的 Write-buffer，大小通过 write-buffer-size 控制。

TiDB 3.0 版本及以上部署 TiKV 多实例情况下，需要修改 conf/tikv.yml 中 block-cache-size 下面的 capacity 参数：

```
storage:
  block-cache:
    capacity: "1GB"
```
>注意：
>TiKV 实例数量指每个服务器上 TiKV 的进程数量。
>推荐设置：capacity = MEM_TOTAL * 0.5 / TiKV 实例数量


## Sync-log 
通过使用 [Raft 一致性算法](https://raft.github.io/)，数据在各 TiKV 节点间复制为多副本，以确保某个节点挂掉时数据的安全性。只有当数据已写入超过 50% 的副本时，应用才返回 ACK（三副本中的两副本）。但理论上两个节点也可能同时发生故障，所以除非是对性能要求高于数据安全的场景，一般都强烈推荐开启 sync-log。一般来说，开启 sync-log 会让性能损耗 30% 左右。

可以修改 conf/tikv.yml 中 raftstore 下面的 sync-log 参数：

```
[raftstore]
sync-log = true
```
