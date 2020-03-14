# 2.2.1 TiDB Lightning 简介
TiDB Lightning 是一个将全量数据高速导入到 TiDB 集群的工具，速度可达到传统执行 SQL 导入方式的 3 倍以上、大约每小时 300 GB。Lightning 有以下两个主要的使用场景：一是大量新数据的快速导入、二是全量数据的备份恢复。目前，Lightning 支持 Mydumper 或 CSV 输出格式的数据源。

## 1. 整体架构

### 架构组件

![架构图](/res/session2/chapter2/lightning-internal/1.png)

TiDB Lightning 主要包含两个部分：

* **TiDB Lightning**（“前端”）：主要完成适配工作，通过读取数据源，在下游 TiDB 集群建表、将数据转换成键值对发送到 tikv-importer、检查数据完整性等。
* **tikv-importer**（“后端”）：主要完成将数据导入 TiKV 集群的工作，对 TiDB Lightning 写入的键值对进行缓存、排序、切分操作并导入到 TiKV 集群。

### 整体工作原理

![导入流程图](/res/session2/chapter2/lightning-internal/2.png)

1. 在导数据之前，TiDB Lightning 会自动将 TiKV 集群切换为“导入模式”（import mode），优化写入效率。
2. TiDB Lightning 会在目标数据库建立库和表，并获取其元数据。
3. 每张表都会被分割为多个连续的批次，这样来自大表（200 GB+）的数据就可以平行导入。
4. TiDB Lightning 会通过 gRPC 让 tikv-importer 为每一个批次准备一个“引擎文件（engine file）”来处理键值对。TiDB Lightning 会并发读取 SQL dump，将数据源转换成与 TiDB 相同编码的键值对，然后发送到 tikv-importer 里对应的引擎文件。
5. 当一个引擎文件数据写入完毕时，tikv-importer 便开始对目标 TiKV 集群数据进行分裂和调度，然后导入数据到 TiKV 集群。引擎文件包含两种：数据引擎与索引引擎，各自又对应两种键值对：行数据和次级索引。通常行数据在数据源里是完全有序的，而次级索引是无序的。因此，数据引擎文件在对应区块写入完成后会被立即上传，而所有的索引引擎文件只有在整张表所有区块编码完成后才会执行导入。
6. 整张表相关联的所有引擎文件完成导入后，TiDB Lightning 会对比本地数据源及下游集群的校验和（checksum），确保导入的数据无损，然后让 TiDB 分析（ANALYZE）这些新增的数据，以优化日后的操作。同时，TiDB Lightning 调整 AUTO_INCREMENT 值防止之后新增数据时发生冲突。表的自增 ID 是通过行数的上界估计值得到的，与表的数据文件总大小成正比。因此，最后的自增 ID 通常比实际行数大得多。这属于正常现象，因为在 TiDB 中自增 ID 不一定是连续分配的。
7. 在所有步骤完毕后，TiDB Lightning 自动将 TiKV 切换回“普通模式”（normal mode），此后 TiDB 集群可以正常对外提供服务。

### 导入模式

Lightning 在导入阶段需要单独使用集群，设置集群来提高速度。在开始阶段切换“导入模式”，在此模式下，

* TiKV 的后台任务数会增加，以并行接收更多的 SST 文件。
* write stall triggers 会被移除，使写速度优先于读速度。

在导入数据完成后，Lightning 会自动切换集群回“普通模式”。

## 2. Lightning 架构

![Lightning 架构图](/res/session2/chapter2/lightning-internal/3.png)

### 工作原理

首先，Lightning 会扫描 SQL 备份，区分出结构文件（包含 CREATE TABLE 语句）和数据文件（包含 INSERT 语句）。结构文件的内容会直接发送到 TiDB，用以建立数据库构型。

然后 Lightning 就会并发处理每一张表的数据。这里我们只集中看一张表的流程。每个数据文件的内容都是规律的 INSERT 语句，像是：

```sql
INSERT INTO `tbl` VALUES (1, 2, 3), (4, 5, 6), (7, 8, 9);
INSERT INTO `tbl` VALUES (10, 11, 12), (13, 14, 15), (16, 17, 18);
INSERT INTO `tbl` VALUES (19, 20, 21), (22, 23, 24), (25, 26, 27);
```

Lightning 会作初步分析，找出每行在文件的位置并分配一个行号，使得没有主键的表可以唯一的区分每一行。Lightning 会直接使用 TiDB 实例来把 SQL 转换为键值对，称为“键值编码器”（KV encoder）。与外部的 TiDB 集群不同，KV 编码器是寄存在 Lightning 进程内的，而且使用内存存储，所以每执行完一个 INSERT 之后，Lightning 可以直接读取内存获取转换后的键值对（这些键值对包含数据及索引），得到键值对之后便可以发送到 Importer。

### 并发设置

Lightning 把数据源分成多个能并发的小任务。这些并发度有几个可以调整的设置

![4.png](/res/session2/chapter2/lightning-internal/4.png)

* `batch-size`：对于很大的单表，比如 5 TB+，如果一次过导入到一个引擎文件，可能会因为 Importer 磁盘空间不足，最终导致该表导入失败，所以 Lightning 会按照 `batch-size` 的配置大小对一个大表进行切分，导入过程中，一个批次使用一个引擎文件；`batch-size` 不应该小于 100 GiB，太小的 `batch-size` 会使region balance 和 leader balance 很高，导致 region 在 TiKV 之间频繁调度，占用网络资源；

* `table-concurrency`：控制多少个批次同时进行导入，每个表里面会按照 `batch-size` 配置切分成多个批次；

* `index-concurrency`：控制同时有多少个索引引擎。`table-concurrency` + `index-concurrency` 的总和必须小于 Importer 的 `max-open-engines` 配置；

* `io-concurrency`：多个 IO 并发访问磁盘，随着并发度提高，磁盘内部缓存容量有限，会导致频繁 cache miss，导致 IO 的延迟加大，不建议调整太大；

* `block-size`：Lightning 会一次性读取一个 block-size 的大小，然后进行编码。默认为 64 KiB；

* `region-concurrency`：每个批次内部线程数，每个线程要进行读文件 → 编码 → 发送到 Importer 的步骤；

读文件这步需要使用 I/O，使用 `io-concurrency` 控制并发读取。

编码需要使用 CPU，主要跟 `region-conconcurrency` 配置有关，例如，若编码一次耗时 50 ms，那么每秒只能进行编码 20 次，若 `block-size` 为 64 KiB，则单核每秒只能编码 1.28 MB 的数据，若 `region-concurrency = 60`，那编码的总速度大约为 75 MB/s。

## 3. Importer 架构

### 工作原理

![Importer架构图](/res/session2/chapter2/lightning-internal/5.png)

因异步操作的缘故，Importer 得到的原始键值对注定是无序的。所以，Importer 要做的第一件事就是要排序。这需要给每个表划定准备排序的储存空间，我们称之为引擎文件。

对大数据排序是个解决了很多遍的问题，我们在此使用现有的答案：直接使用 RocksDB。一个引擎文件就相等于本地的 RocksDB，并设置为优化大量写入操作。而「排序」就相等于将键值对全写入到引擎文件里，RocksDB 就会帮我们合并、排序，并得到 SST 格式的文件。

这个 SST 文件包含整个表的数据和索引，比起 TiKV 的储存单位 Regions 实在太大了。所以接下来就是要切分成合适的大小（默认为 96 MiB）。Importer 会根据要导入的数据范围预先把 Region 分裂好，然后让 PD 把这些分裂出来的 Region 分散调度到不同的 TiKV 实例上。

最后，Importer 将 SST 上传到对应 Region 的每个副本上。然后通过 Leader 发起 Ingest 命令，把这个 SST 文件导入到 Raft group 里，完成一个 Region 的导入过程。

### 并发设置

![6.png](/res/session2/chapter2/lightning-internal/6.png)

* `max-open-engines`：表示 Lightning 可以在 Importer 同时打开引擎文件的数量，如果是单个 Lightning 实例，这个配置需要不小于 Lightning 中 `index-concurrency` + `table-concurreny` 的大小，如果是多个 Lightning 实例，则不能小于所有实例的 `index-concurrency` + `table-concurreny` 总和。引擎文件会消耗磁盘空间，数据引擎的磁盘空间大小为 Lightning 中 `batch-size` 的大小，索引引擎的大小参考下面第 7 段的估算方式，需要根据 Importer 机器的磁盘容量来合理配置本参数；
* `num-import-jobs`: 一个 Lightning `batch-size` 的数据写入到一个引擎文件之后，会使用 Import 过程导入到 TiKV，这个参数控制同时进行导入的线程数量，通常使用默认配置即可；
* `region-split-size`: 一个引擎文件会很大（如 100 GiB），不能一次性导入到 TiKV，所以会把引擎文件切分成多个更小的 SST 文件，SST 文件不会超过这个大小，不建议低于 96 MiB。SST 切分过小，会导致 Ingest 的吞吐量小。

## 4. 校验检查

![7.png](/res/session2/chapter2/lightning-internal/7.png)

我们传输大量数据时，需要自动检查数据完整，避免忽略掉错误。Lightning 会在整个表的 Region 全部导入后，对比传送到 Importer 之前这个表的 Checksum，以及在 TiKV 集群里面时的 Checksum。如果两者一样，我们就有信心说这个表的数据没有问题。

一个表的 Checksum 是透过计算键值对的哈希值（Hash）产生的。因为键值对分布在不同的 TiKV 实例上，这个 Checksum 函数应该具备结合性；另外，Lightning 传送键值对之前它们是无序的，所以 Checksum 也不应该考虑顺序，即服从交换律。也就是说 Checksum 不是简单的把整个 SST 文件计算 SHA-256 这样就了事。

我们的解决办法是这样的：先计算每个键值对的 CRC64，然后用 XOR 结合在一起，得出一个 64 位元的校验数字。为减低 Checksum 值冲突的概率，我们同时会计算键值对的数量和大小。在下面两个地方分别计算来比对表中 3 个指标的和：

  * 一次是在Lightning encode后
  * 一次是在TiDB执行SQL命令：
    * ADMIN CHECKSUM TABLE `xxxx`;

## 5. 分析与更新自增值

Lightning 在检查数据完整后会进行重新计算表的统计信息，支持查询计划优化，及更新表的自增值，即执行：

```sql
ANALYZE TABLE `xxxx`;
ALTER TABLE `xxxx` AUTO_INCREMENT=123456;
```

## 6. 使用限制

Lightning 只适用于初次全量导入，导入开始前，请确保一下两点：

* 导入前相关的表需要清空
* 导入过程中的表不能有其他业务写入

一个表只能一个 Lightning 实例导入，不能多个 Lightning 实例导入同一张表；同一个数据源可以使用多个 Lightning 实例并行导入，具体方式是通过白名单配置，导入不同的表；

## 7. 机器配置要求

* Lightning 和 Importer 均需要配备万兆网卡；对于万兆网卡，即使 Importer 网卡打满，因为 TiKV 三个副本需要上传，所以实际导入速度只有 ~300 MB/s，如果是千兆网卡只有 ~30 MB/s；
* Lightning 对本地磁盘没有硬性要求，如果长时间运行，需要保证磁盘空间能保存日志即可；
* Importer 磁盘有一定要求，比如有 20 张表，其中有一张 5 TB 的大表，因为这张表的索引键值对会在 Importer 上进行全排序，再上传到 TiKV 中，所以需要保证 Importer 的机器至少可以保存这个索引引擎文件。引擎文件在磁盘的大小主要由表结构中索引数量定，一个大致的参考值：一个包含 5 个索引大小为 4 TB 的单表，索引引擎文件大小约为 ~2 TB，如果索引中的字段是整数类型，索引引擎可能比较小；
* TiKV 集群容量比较保守的估算可以按照 (数据源大小 × 4) 来配置，比如 5 TB 的 SQL 文件，可以要求集群至少 20 TB，但是这个值有一定弹性范围，如果表内的重复数据比较多，最终 TiKV 的压缩比会比较大，容量要求也相对比较小，如果客户的确有需要使用 Lightning，但是没有那么高的配置条件，可以做一些估算后进行尝试。

## 8. 量化指标

* `io-concurrency` 不要太大，否则会导致磁盘内部缓存大量 cache miss，影响顺序读的效果
* 如果整个 Lightning → Importer 过程是没有阻塞的，有下面的一些资源使用计算公式

  * 万兆网卡 10 Gb/s，如果编码速度达到 300 MB/s，就会占用整个 Importer 的带宽。这也是 Lightning 导入速度的上限。

    ```
    max speed = bandwidth (1.2 GB/s) / replicas (3)
    ```

  * Lightning 内存占用很低，几乎可以忽略；Importer 占用跟引擎和导入线程数有关，

    ```
    ram usage = (max-open-engines (8) × write-buffer-size (1 GB) × 2)
              + (num-import-jobs (24) × region-split-size (512 MB) × 2)
    ```

  * Importer 硬盘占用 ≈ 最大的 N 个表, 其中 `N = max(index-concurrency, table-concurrency)`。实际占用量与索引数量和类型相关。
