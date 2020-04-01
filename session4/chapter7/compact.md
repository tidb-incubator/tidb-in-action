# 7.5 TiKV 磁盘空间占用与回收常见问题
        TiKV 作为 TiDB 的存储节点，用户通过 SQL 导入或更改的所有数据都存储在 TiKV。这里整理了一些关于 TiKV 空间占用的常见问题
        
## TiKV 的空间放大

* 监控上显示的 Number files at each levels 是什么含义？ 如果用户向 TiDB 中写入了 10G 数据，那么实际占用的物理空间是多大？

> TiKV 采用 LSM-Tree 架构的 RocksDB 作为底层存储引擎，最新写入的数据会在最上层，最老的数据在最底层。
如果用户只执行过 INSERT 而没有 UPDATE 和 DELETE 的话，那么按照默认配置 `max-bytes-for-level-multiplier`，每一层的大小是上一层的十倍。
RocksDB 相同层不会有重复的数据，因此 10GB 数据最多占据 512MB + 1GB + 10GB 的物理空间，由于 RocksDB 还采取了针对对 key 的前缀压缩，
以及针对 block 的 LZ4 或 ZSTD 压缩，因此最终占用的磁盘空间应该小于 11.5GB. (512MB 为L0 的 SST 文件大小。)

* 为什么我执行了 UPDATE SQL 之后，集群占用的空间在不停地增长？ UPDATE 的数据会占用额外的空间吗？
> 为了保证 Snapshot Isolation， TiDB 采取了多版本并发控制，对于 UPDATE 的数据不会立刻覆盖其原有的数据，而是为其新增一个版本，
因此会占用额外的物理空间。 TiDB 默认的 tikv_gc_life_time 为10分钟，因此 UPDATE 所覆盖的旧版本数据会在10分钟后才被删除。由于
TiKV 上的 GC 线程为单线程，因此目前的版本还存在 UPDATE 过快而导致旧版本来不及回收，数据大小膨胀的问题，我们会在将来逐步解决这个问题。
倘若 GC 及时的话，那么用户 UPDATE 后 TiKV 占用的实际空间为 "用户10分钟内更新的数据量+数据库有效数据量 * 1.12".（这里的 1.12 参考
上一条推断的空间放大系数）

* GC 删除数据所占据的物理空间能在 RocksDB 中被立刻回收吗？
> 参考上一条，GC 删除的数据会很快被 compact 到下一层。在 TiKV 的 CPU 资源充足，RocksDB compact 足够及时的情况下，由于相同层内不会有
重复数据，因此最多存在 12% 应该被删除的重复无效数据。


## 如何高效地回收磁盘空间

* 为什么我执行了 DELETE FROM table_xx; 后磁盘空间迟迟没有回收？（监控上显示的磁盘剩余空间并没有增大）
> 参考上一条，TiDB 删除数据也是为其增加一个特殊的新版本，旧版本要等待 10 分钟后才会真正从 RocksDB 中删除，而 RocksDB 回收物理空间还需要
更多的额外时间。因此我们建议用户如果要删除某个表的数据尽量使用 ``DROP TABLE table_xxx``，而不是 ``DELETE FROM table_xx``。前者
会在超过 GC 时间后，直接删除 RocksDB 上的物理文件。


## Dynamic Level 相关问题

* 为什么 TiKV 的监控上显示 level-1 和 level-2 都没有数据，但是 level-3 和 level-4 是有数据？
> 因为 TiKV 使用 RocksDB 开启了 [Dynamic Level Bytes](https://rocksdb.org/blog/2015/07/23/dynamic-level.html)，
所以数据文件会优先放更底层。计算规则：如果当前数据总大小低于 `max-bytes-for-level-base`（默认为 512MB），则所有数据都会在 level-6，
此时 level-6 实际上相当于 level-1。如果数据总大小超过 `max-bytes-for-level-base` ，但低于 `max-bytes-for-level-base * max-bytes-for-level-multiplier`
， 则 level-6 视作 level-2，level-5 视作 level-1。但是无论如何，除了 level-0 以外的各层数据比例都按照上层比下层 1：10 进行分布。

* 磁盘空间不够，如何提高 TiKV 的压缩效果？
> TiKV 提供 snappy，zlib，bzip2，lz4，lz4hc，zstd 等六种压缩算法。默认为 ``["no", "no", "lz4", "lz4", "lz4", "zstd", "zstd"]``
注意我们采取了 dynamic level，所以只有当数据量超过 500G 时 RocksDB 的层数才会超过 4， 超过 500G 部分的数据才会启动 ZSTD 压缩算法。
如果希望能够进一步提高压缩效果，可以将 defaultcf 以及 writecf 的配置 ``compression-per-level`` 设置为
``["no", "no", "lz4", "lz4", "zstd", "zstd", "zstd"]``, 这样的话，50G ～ 500G 之类的数据的也能按照 zstd 压缩。
