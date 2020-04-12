# 2.2.1 Lightning 工作原理
TiDB Lightning 工具支持高速导入 Mydumper 和 CSV 文件格式的数据文件到 TiDB 集群，导入速度可达每小时 300 GB，是传统 SQL 导入方式的 3 倍多。它有两个主要的目标使用场景：大量新数据的快速导入，以及全量数据恢复。

本节将介绍 TiDB Lightning 工具的工作原理。

## 1. 整体架构

### 组件概览

![架构图](/res/session2/chapter2/lightning-internal/1.png)

如上图所示，TiDB Lightning 工具主要包含两个组件：
* **tidb-lightning**（前端）：负责导入过程的管理和适配工作。读取数据文件，在目标 TiDB 集群上建表，并将数据文件转换成键值对发送到 tikv-importer，最后执行数据完整性检查等收尾工作。
* **tikv-importer**（后端）：负责将数据导入到目标 TiKV 集群。对 tidb-lightning 写入的键值对执行缓存、排序和切分等操作，最终导入 TiKV 集群。

### 数据导入过程

![导入流程图](/res/session2/chapter2/lightning-internal/2.png)

1. 导入数据之前，tidb-lightning 会自动将 TiKV 集群切换为“导入模式”（import mode）以优化写入效率。
2. tidb-lightning 会在目标 TiDB 集群上建立空数据库和表，并获取其元数据。
3. 每张表都会被分割为多个连续的批次，这样来自大表（200 GB 以上）的数据就可以并行导入。
4. tidb-lightning 会通过 gRPC 通知 tikv-importer 为每一个批次准备一个“引擎文件”（engine file）来处理键值对。tidb-lightning 会并发读取数据文件，转换成与目标 TiDB 集群相同编码的键值对，然后发送到 tikv-importer 里对应的引擎文件。
5. 当一个引擎文件数据写入完毕，tikv-importer 便开始对目标 TiKV 集群数据进行 Region 分裂和调度，然后导入数据到 TiKV 集群。引擎文件包含两种：数据引擎与索引引擎，分别对应两种键值对：行数据和次级索引。通常行数据在数据文件里是完全有序的，而次级索引则是无序的。因此，数据引擎文件在对应 Region 写入完成后会被立即上传，而索引引擎文件只有在整张表所有 Region 编码完成后才会执行导入。
6. 整张表的所有引擎文件完成导入后，tidb-lightning 会对比本地数据文件及目标 TiDB 集群的校验和（checksum），确保导入的数据无损；然后让 TiDB 分析（ANALYZE）这些新增的数据，以优化日后的操作。同时，tidb-lightning 会调整表的 AUTO_INCREMENT 值防止后续新增数据时发生冲突。表的自增 ID 是通过行数的上界估计值得到的，与表的数据文件总大小成正比。因此，最后的自增 ID 通常比实际行数大得多。这属于正常现象，因为在 TiDB 中自增 ID 不一定是连续分配的。
7. 在所有步骤完毕后，tidb-lightning 会自动将 TiKV 切换回“普通模式”（normal mode），此后 TiDB 集群才可以正常对外提供服务。

### 导入模式

一旦目标 TiKV 集群切换到导入模式，整个数据导入阶段该集群将被 tidb-lightning 独占，无法对外提供正常服务。tidb-lightning 会修改集群配置以提高数据导入效率：

* TiKV 的后台任务数会增加，以并行接收更多的 SST 文件。
* `write stall triggers` 被移除，使写速度优先于读速度。

数据导入完成后，tidb-lightning 会自动把 TiKV 集群切换回“普通模式”。

## 2. tidb-lightning 架构

![Lightning 架构图](/res/session2/chapter2/lightning-internal/3.png)

### 工作原理

首先，tidb-lightning 会扫描数据文件，区分出结构文件（包含 `CREATE TABLE` 语句）和数据文件（包含 `INSERT` 语句）。结构文件的内容会直接发送到 TiDB，用于建立数据库和表。然后，tidb-lightning 会并发处理每一张表的数据。这里，我们来看一张表的导入处理过程。

每个数据文件的内容都是规律的 `INSERT` 语句，如下所示：

``` sql
INSERT INTO `tbl` VALUES (1, 2, 3), (4, 5, 6), (7, 8, 9);
INSERT INTO `tbl` VALUES (10, 11, 12), (13, 14, 15), (16, 17, 18);
INSERT INTO `tbl` VALUES (19, 20, 21), (22, 23, 24), (25, 26, 27);
```

tidb-lightning 会分析数据文件，找出每一行的位置并分配一个行号，这样即使没有定义主键的表也能够区分每一行。tidb-lightning 会直接借助 TiDB 实例把 SQL 转换为键值对，称为“键值编码器”（KV encoder）。与外部的 TiDB 集群不同，键值编码器是寄存在 tidb-lightning 进程内的，并使用内存存储；每执行完一个 INSERT 之后，tidb-lightning 可以直接读取内存获取转换后的键值对（这些键值对包含数据及索引），得到键值对之后便可以发送到 tikv-importer。

### 并发设置

tidb-lightning 把数据文件拆分成多个能并发执行的小任务。下面的配置选项可以帮助调节这些任务的并发度：

![4.png](/res/session2/chapter2/lightning-internal/4.png)

* `batch-size`：对于很大的表，比如超过 5 TB 的表，如果一次性导入到整个引擎文件，可能会因为 tikv-importer 磁盘空间不足导致失败。tidb-lightning 会按照 `batch-size` 的配置对一个大表进行切分，导入过程中每个批次使用单独的引擎文件。`batch-size` 不应该小于 100 GB，太小的话会使 region balance 和 leader balance 值升高，导致 Region 在 TiKV 之间频繁调度，浪费网络资源。

* `table-concurrency`：同时导入的批次个数。如上所述，每个表会按照 `batch-size` 切分成多个批次。

* `index-concurrency`：并行的索引引擎文件个数。`table-concurrency` + `index-concurrency` 的总和必须小于 tikv-importer 的 `max-open-engines` 配置。

* `io-concurrency`：并发访问磁盘的 I/O 线程数。由于磁盘内部缓存容量有限，过高的并发度容易引发频繁的 cache miss，导致 I/O 延迟加大。因此，不建议将该

* `block-size`：默认值为 64 KB。tidb-lightning 会一次性读取一个 `block-size` 大小的数据文件，然后进行编码。

* `region-concurrency`：每个批次的内部线程数。每个线程要执行读文件、编码和发送到 tikv-importer 等步骤。
    * 读文件会消耗 I/O 资源，需要调节 `io-concurrency` 控制并发读取。
    * 编码过程的瓶颈主要在 CPU，需要适当调整 `region-conconcurrency` 配置。
    * 举例来说，若一次编码处理耗时 50 毫秒，那么每秒只能进行 20 次编码。若 `block-size` 为 64 KB，则单一 CPU 核每秒最多完成 1.28 MB 数据的编码处理。若 `region-concurrency` 设置为 60，则整体编码处理的极限速度约为每秒 75 MB。

## 3. tikv-importer 架构

### 工作原理

![Importer架构图](/res/session2/chapter2/lightning-internal/5.png)

因异步操作的缘故，tikv-importer 得到的原始键值对注定是无序的。所以，tikv-importer 要做的第一件事就是要排序。这需要给每个表划定准备排序的储存空间，我们称之为引擎文件。

对大数据排序是个解决了很多遍的问题，我们在此使用现有的答案：直接使用 RocksDB。一个引擎文件就相等于本地的 RocksDB，并设置为优化大量写入操作。排序相当于将键值对全写入到引擎文件里，RocksDB 就会帮我们合并、排序，并得到 SST 格式的文件。

这个 SST 文件包含整个表的数据和索引，比起 TiKV 的储存单位 Regions 实在太大了。所以接下来就是要切分成合适的大小（默认为 96 MiB）。tikv-importer 会根据要导入的数据范围预先把 Region 分裂好，然后让 PD 把这些分裂出来的 Region 分散调度到不同的 TiKV 实例上。

最后，tikv-importer 将 SST 上传到对应 Region 的每个副本上。然后通过 Leader 发起 Ingest 命令，把这个 SST 文件导入到 Raft group 里，完成一个 Region 的导入过程。

### 并发设置

![6.png](/res/session2/chapter2/lightning-internal/6.png)

* `max-open-engines`：表示 Lightning 可以在 tikv-importer 同时打开引擎文件的数量，如果是单个 Lightning 实例，这个配置需要不小于 Lightning 中 `index-concurrency` + `table-concurreny` 的大小，如果是多个 Lightning 实例，则不能小于所有实例的 `index-concurrency` + `table-concurreny` 总和。引擎文件会消耗磁盘空间，数据引擎的磁盘空间大小为 Lightning 中 `batch-size` 的大小，索引引擎的大小参考下面第 7 段的估算方式，需要根据 Importer 机器的磁盘容量来合理配置本参数；
* `num-import-jobs`: 一个 Lightning `batch-size` 的数据写入到一个引擎文件之后，会使用 Import 过程导入到 TiKV，这个参数控制同时进行导入的线程数量，通常使用默认配置即可；
* `region-split-size`: 一个引擎文件会很大（如 100 GiB），不能一次性导入到 TiKV，所以会把引擎文件切分成多个更小的 SST 文件，SST 文件不会超过这个大小，不建议低于 96 MiB。SST 切分过小，会导致 Ingest 的吞吐量小。

## 4. 校验检查

![7.png](/res/session2/chapter2/lightning-internal/7.png)

我们传输大量数据时，需要自动检查数据完整，避免忽略掉错误。tidb-lightning 会在整个表的 Region 全部导入后，对比传送到 tikv-importer 之前这个表的 Checksum，以及在 TiKV 集群里面时的 Checksum。如果两者一样，我们就有信心说这个表的数据没有问题。

一个表的 Checksum 是透过计算键值对的哈希值（Hash）产生的。因为键值对分布在不同的 TiKV 实例上，这个 Checksum 函数应该具备结合性；另外，tidb-lightning 传送键值对之前它们是无序的，所以 Checksum 也不应该考虑顺序，即服从交换律。也就是说 Checksum 不是简单的把整个 SST 文件计算 SHA-256 这样就了事。

我们的解决办法是这样的：先计算每个键值对的 CRC64，然后用 XOR 结合在一起，得出一个 64 位元的校验数字。为减低 Checksum 值冲突的概率，我们同时会计算键值对的数量和大小。在下面两个地方分别计算来比对表中 3 个指标的和：

  * 一次是在 tidb-lightning encode 后
  * 一次是在TiDB执行SQL命令：
    * ADMIN CHECKSUM TABLE `xxxx`;

## 5. 分析与更新自增值

tidb-lightning 在检查数据完整后会进行重新计算表的统计信息，支持查询计划优化，及更新表的自增值，即执行：

```sql
ANALYZE TABLE `xxxx`;
ALTER TABLE `xxxx` AUTO_INCREMENT=123456;
```

## 6. 使用限制

只适用于初次全量导入，导入开始前，请确保一下两点：

* 导入前相关的表需要清空
* 导入过程中的表不能有其他业务写入

一个表只能一个 Lightning 实例导入，不能多个 Lightning 实例导入同一张表；同一个数据源可以使用多个 Lightning 实例并行导入，具体方式是通过白名单配置，导入不同的表；

## 7. 机器配置要求

* tidb-lightning 和 tikv-importer 均须配备万兆网卡。
* tidb-lightning 对本地磁盘空间大小没有硬性要求。为保证长时间运行数据导入处理，须保证磁盘空间足够保存日志文件。
* tikv-importer 对磁盘空间大小有一定要求。假定有 20 张表，其中有一张 5 TB 的大表。考虑到该表的索引键值对需要在 tikv-importer 上先进行全量排序后再上传到 TiKV 中，所以需要保证 tikv-importer 的本地磁盘空间至少可以保存对应的索引引擎文件。索引引擎文件在磁盘上的大小主要由表结构里的索引数量决定；如果索引中的字段以整数类型为主，则索引引擎文件会更小一些。这里提供一个经验值：一个包含 5 个索引、体积为 4 TB 的单表，索引引擎文件体积约为 2 TB。
* TiKV 集群容量可以按照数据文件体积的 4 倍来估算。例如，数据文件体积为 5 TB，则目标 TiKV 集群至少要预留 20 TB 可用空间。但是，该估算值有一定误差范围：如果单表内重复数据较多，最终 TiKV 的压缩比也会较大，则相应地容量要求也会降低。

## 8. 量化指标

* `io-concurrency` 不要设置太的值，否则容易导致磁盘内部缓存失效出现大量 cache miss，影响顺序读的效率。
* 下面给出的一些公式可以帮助我们计算数据导入过程中的资源使用量。 这里，我们假定 tidb-lightning 和 tikv-importer 之间的交互过程不是性能瓶颈。

  * 假定 tikv-importer 节点使用万兆网卡 （理论带宽上限为 10 gbps），则编码速度最高达到每秒 300 MB 时就会耗尽全部带宽。这就是 TiDB Lightning 工具数据导入速度的理论上限。

    ```
    max-speed = bandwidth (1.2 GB/s) / replicas (3)
    ```

  * tidb-lightning 的内存占用很低，几乎可以忽略；tikv-importer 的内存占用取决于引擎文件个数和导入线程数。

    ```
    ram-usage = (max-open-engines (8) × write-buffer-size (1 GB) × 2)
              + (num-import-jobs (24) × region-split-size (512 MB) × 2)
    ```

  * tikv-importer 的磁盘空间使用量基本上取决于最大的 N 个表, 其中 `N = max(index-concurrency, table-concurrency)`。实际的磁盘空间使用量与索引数量和索引字段构成相关。
