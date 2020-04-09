# 8.2 TiKV 常见配置优化

本章节用于描述如何根据机器配置情况来调整 TiKV 的参数，使 TiKV 的性能达到最优。

TiKV 最底层使用的是 RocksDB 做为持久化存储，所以 TiKV 的很多性能相关的参数都是与 RocksDB 相关的。TiKV 使用了两个 RocksDB 实例，默认 RocksDB 实例存储 KV 数据，Raft RocksDB 实例（简称 RaftDB）存储 Raft 数据。

TiKV 使用了 RocksDB 的 `Column Families` (CF) 特性。

- 默认 RocksDB 实例将 KV 数据存储在内部的 `default`、`write` 和 `lock` 3 个 CF 内。

    - `default` CF 存储的是真正的数据，与其对应的参数位于 `[rocksdb.defaultcf]` 项中；
    - `write` CF 存储的是数据的版本信息 (MVCC) 以及索引相关的数据，相关的参数位于 `[rocksdb.writecf]` 项中；
    - `lock` CF 存储的是锁信息，系统使用默认参数。

- Raft RocksDB 实例存储 Raft log。

    - `default` CF 主要存储的是 Raft log，与其对应的参数位于 `[raftdb.defaultcf]` 项中。

所有的 CF 默认共同使用一个 block cache 实例。通过在 `[storage.block-cache]` 下设置 `capacity` 参数，可以配置该 block cache 的大小。block cache 越大，能够缓存的热点数据越多，读取数据越容易，同时占用的系统内存也越多。如果要为每个 CF 使用单独的 block cache 实例，需要在 `[storage.block-cache]` 下设置 `shared=false`，并为每个 CF 配置单独的 block cache 大小。例如，可以在 `[rocksdb.writecf]` 下设置 `block-cache-size` 参数来配置 `write` CF 的大小。

每个 CF 有各自的 `write-buffer`，大小通过 `write-buffer-size` 控制。

## TiKV 内存使用情况

除了以上列出的 `block-cache` 以及 `write-buffer` 会占用系统内存外：

1. 需预留一些内存作为系统的 page cache
2. TiKV 在处理大的查询的时候（例如 `select * from ...`）会读取数据然后在内存中生成对应的数据结构返回给 TiDB，这个过程中 TiKV 会占用一部分内存

## TiKV 机器配置推荐

1. 生产环境中，不建议将 TiKV 部署在 CPU 核数小于 8 或内存低于 32GB 的机器上
2. 如果对写入吞吐要求比较高，建议使用吞吐能力比较好的磁盘
3. 如果对读写的延迟要求非常高，建议使用 IOPS 比较高的 SSD 盘


具备上述基础知识后，本章节将详细介绍 TiKV 线程池优化，海量 Region 集群调优化，以及其他常见优化设置，希望可以帮助读者了解如何根据业务场景需要配置 TiKV。