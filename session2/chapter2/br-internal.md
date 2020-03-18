## 2.3 4.0 分布式备份恢复工具 BR

BR(https://github.com/pingcap/br) 是分布式备份恢复工具，分布式意味着可以通过 BR 可以驱动集群中所有 TiKV 节点进行备份恢复工作，相比起 SQL dump 形式，这种分布式备份恢复的效率会有极大的提升。本章节会详细介绍下 BR 的工作原理，会分别介绍备份和恢复的具体实现。

### 2.3.1 BR 工作原理

#### 2.3.1.1 备份流程
备份过程由主要由两个组件参与（BR 和 TiKV），整体的基本流程如下：

	* BR 根据用户指定备份范围下发备份命令到 TiKV。
	* TiKV 接受备份请求后交由 region leader 处理，并使用一个特殊的 iterator 读取数据
	* TiKV 读取的数据会被组织成 SST 文件。这里需要控制 IO 和内存使用。
	* TiKV 会把 SST 文件写到外部存储，比如 http，s3 等。
	* TIKV 把执行信息汇报给 BR。

BR 侧备份详细流程：
	* 下推备份请求到所有 TiKV。
	* 接受 TiKV Streaming 发过来的备份结果。
	* 聚合检查是否有范围没有备份到或者发生错误。
	* 如果有范围错误或者没有备份到则重试。
	* 重试需要精细化，查询 PD 对应的 leader 然后下发。
	* 除了备份的数据外，还需要备份 schema。
TiKV 侧备份原理：
由于 TiDB/TiKV 的事务模型是 percolator，数据的存储需要使用 3 个 CF，分别是 default，lock，write，所以如果 TiKV 想把数据保存在 SST 中，那么起码 TiKV 需要扫出 write 和 default 的数据。

在全量备份中，TiKV 需要根据一个 ts（称为 backup_ts）扫出 write 和 default 的 key-value。

在增量备份中，TiKV 需要扫出**一段时间**的增量数据，一段时间具体来说：

(backup_ts, current_ts]

由于备份的保证是 SI，所有增量数据可以直接通过扫 write CF 中的记录即可得到。需要吐出的记录有：

* Put，新增的数据。
* Delete，删除的数据。

不需要吐出的记录有：

* Lock，select for update 写的记录，实际上没有任何数据变更。
* Rollback，清理由提交失败造成的垃圾数据。

通过以上信息我们可以总结出备份方案的特点：

1. 分布式导出数据，数据由各个 region 的 leader 生成，理论上备份的吞吐能达到集群极限。
2. 数据是形式是 SST，SST 格式有优点在于能快速恢复，同时可以直接用 rocksdb 自带一些功能比如，数据压缩/加密。
3. 数据直接保存第三方存储，比如 S3，HTTP 等。
4. 备份的一致性保证：SI，需要保证能恢复到 point-in-time 的状态。

#### 2.3.1.1 备份中注意事项

1. 性能
性能是 KV Scan 方案最头疼的问题之一，因为全表扫描势必会对线上业务造成影响。增量的实现也是全表扫，同样有性能问题，这个和传统数据库的增量不一样。

2. 外部存储
备份存储设计了一个接口，下层可以有不同的实现，比如本地磁盘，s3 等。由于外部存储不一定是真正的磁盘，所以 TiKV 在生成 SST 的时候，不会直接把数据写到本地磁盘上，而是先缓存在内存中，生成完毕后直接写到外部存储中，这样能避免 IO，提高整个备份的吞吐，当然这里需要内存控制。

3. 异常处理
备份期间的异常和 select * 一样，可分为两种可恢复和不可恢复，所有的异常都可以直接复用 TiDB 现有的机制。

可恢复异常一般包含：

* RegionError，一般由 region split/merge，not leader 造成。
* KeyLocked，一般由事务冲突造成。
* Server is busy，一般由于 TiKV 太忙造成。

当发生这些异常时，备份的进度不会被打断。

除了以上的其他错误都是不可恢复异常，发生后，它们会打断备份的进度。

4. 超出 GC 时间
超出 GC 时间是说，需要备份的数据已经被 GC，这情况一般发生在增量备份上，会导致增量不完整。在发生这个错的时候，BR 需要重新来一个全量备份。所以我们推荐在 BR 启动前手动调整 GC 时间。由现在默认的 GC 时间是 10 分钟，根据适当场景延长时间。

#### 2.3.1.2 恢复
恢复所需的工作有以下几个：

* 创建需要恢复的 database 和 table
* 根据 table 和 SST 文件元信息，进行 Split & Scatter Region
* 将备份下来的 SST 文件按需读取到 TiKV 各节点
* 根据新 table 的 ID 对 SST 进行 Key Rewrite
* 将处理好的 SST 文件 Ingest 到 TiKV

恢复原理相对备份原理理解起来复杂一些，要想理解恢复原理需要先理解三个核心处理，Key Rewrite，Split & Scatter Region, Ingest SST，下面将逐一介绍

1. Key Rewrite
由于 TiDB 的数据在 TiKV 那保存的形式是

| Key: tablePrefix{tableID}_recordPrefixSep{rowID}  Value: [col1, col2, col3, col4]Key: tablePrefix{tableID}_indexPrefixSep{indexID}_indexedColumnsValue  Value: rowID   | 
|----|

在 Key 中编码了 tableID，所以我们不能直接把备份下来的 SST 文件不经任何处理恢复到 TiKV 中，否则就有可能因为 tableID 对不上而导致数据错乱。

为了解决该问题，我们必须在恢复前对 SST 文件进行 key 的改写，将原有的 tableID 替换为新创建的 tableID，同样的 indexID 也需要相同的处理。

2. Split & Scatter
TiKV 对 Region 的大小是有限制的，默认为 96MB，超出该阈值则需要分裂（Split）。集群刚启动时，只有少量的 Region 的，我们在恢复的时候不能把所有数据都恢复到这些少量的 Region 中，所以需要提前将 Region 分裂并打散（Scatter）。

由于备份 SST 文件是按照 Region 生成的，天然就有合适的大小和对应的数据范围，所以我们可以在根据各个 SST 文件中的范围对集群中的 Region 进行分裂。分裂完成后还需要打散新分裂出来的 Region，防止发生数据倾斜。

3. Ingest SST
Ingest SST 复用了现有的 sst_importer 模块，可以将处理好的 SST 文件通过 Raft 命令安全地在所有副本上 Ingest，从而保证副本间数据一致性。

我们对比备份原理发现，恢复原理有几个特殊之处：

	* 备份只备份 region leader 的数据，恢复时会把 leader 的数据恢复到所有包含这个 region 的 TiKV 节点上。所以 恢复的数据量＝备份数据量 ＊ 副本数 。
	* 恢复时在 Key Rewrite 情况下，会多出一些 IO 操作，使得恢复总时间增加。

所以恢复耗时要高于备份耗时。

了解以上原理后，可以阅读下一章节，亲手实践 BR 。

