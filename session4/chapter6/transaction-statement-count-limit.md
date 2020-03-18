## 4.6 TiDB 中事务限制及应对方案

在 2.1 及之前的 TiDB 版本中，对于事务的限制是和其他关系型数据库而言比较特殊的地方，很多用户在使用过程中总是会感觉比较困惑，本文针对事务限制做一些详细的说明，希望能够帮助大家理解。

### 4.6.1 官方定义
>
> 由于 TiDB 分布式两阶段提交的要求，修改数据的大事务可能会出现一些问题。因此，TiDB 特意对事务大小设置了一些限制以减少这种影响：
>
> 每个键值对不超过 6MB
>
> 键值对的总数不超过 300,000
>
> 键值对的总大小不超过 100MB
>
> 单个事务包含的 SQL 语句不超过 5000 条（默认）

**详见 [PingCAP 官方文档 - 大事务](https://pingcap.com/docs-cn/v2.1/reference/transactions/overview/#大事务)**

键值对应该比较容易理解，毕竟 TiDB 底层存储选用的是 RocksDB 引擎，一种基于 Key-Value 的存储结构。而每个键值对的大小和总大小限制分别是 6MB 和 100MB，这个应该也比较容易理解。关键在于每个事物包含键值对的总数不超过 30W，这个经常会引起一些误解，下面做一些详细说明。

### 4.6.2 如何理解 30W

很多人第一眼看上去，以为是一个事务涉及的行数不能超过 30W，但其实不是这样的，首先需要了解 TiKV 是如何将结构化数据转化为 Key-Value 结构存储的。

对于 Key-Value 结构的数据，结构如下：

| Key   | Value   | Flag   |
|----|----|----|

当插入一条数据时，TiKV 记录该数据包含以下几个步骤：

(1) 插入数据本身

| Key: PK + TSO | Value: Fields | Flag: Put |
|----|----|----|

(2) 插入唯一索引

| Key: Index (UK) + TSO | Value: PK | Flag: Put |
|----|----|----|

(3) 插入普通索引

| Key: Index + PK + TSO | Value: Null | Flag: Put |
|----|----|----|

综上，当执行 Insert 事务时，30W 限制需要除以所有索引的数量 (包含主键和唯一索引)。

下面考虑当删除一条数据时，TiKV 是如何处理的。首先需要明确，RocksDB 引擎所有的操作都是新增，所以删除也是插入，相当于插入了一条 Flag = Del 的记录。具体步骤如下：

(1) 插入数据本身的删除标记

| Key: PK + TSO | Value: Null | Flag: Del |
|----|----|----|

(2) 插入唯一索引的删除标记

| Key: Index (UK) + TSO | Value: Null | Flag: Del |
|----|----|----|

(3) 插入普通索引的删除标记

| Key: Index + PK + TSO | Value: Null | Flag: Del |
|----|----|----|

综上，当执行 Delete 事务时，30W 限制需要除以所有索引的数量 (包含主键和唯一索引)。

更新比较复杂，放到最后说明。

首先，更新的是非主键且无索引字段的情况。这种情况，只需要修改记录本身的内容即可，也就是下面一步：

(1) 插入数据本身即可

| Key: PK + TSO | Value: Fields | Flag: Put |
|----|----|----|

综上，非主键且无索引字段更新，30W 限制就是 30W。

其次，来看更新的是非主键，但包含索引的字段情况。

(1) 数据本身

| Key: PK + TSO | Value: Fields | Flag: Put |
|----|----|----|

(2) 如果更新字段上有唯一索引

| Key: Index (UK) + TSO | Value: Null | Flag: Del |
|----|----|----|

| Key: Index (UK) + TSO | Value: PK | Flag: Put |
|----|----|----|

(3) 如果更新字段上有普通索引

| Key: Index + PK + TSO | Value: Null | Flag: Del |
|----|----|----|

| Key: Index + PK + TSO | Value: Null | Flag: Put |
|----|----|----|

综上，非主键但索引相关字段的更新，30W 限制需要除以 (1 + 字段涉及索引数量 * 2)。

最后来看当更新的是主键字段的情况。

从上面的插入描述中可以看出，无论是数据本身，还是索引，都包含了 PK ，所以主键更新会触发所有的 Key 更新，具体如下：

(1) 数据本身

| Key: PK + TSO | Value: Null | Flag: Del |
|----|----|----|

| Key: PK + TSO | Value: Fields | Flag: Put |
|----|----|----|

(2) 所有的唯一索引

| Key: Index (UK) + TSO | Value: Null | Flag: Del |
|----|----|----|

| Key: Index (UK) + TSO | Value: PK | Flag: Put |
|----|----|----|

(3) 所有的普通索引

| Key: Index + PK + TSO | Value: Null | Flag: Del |
|----|----|----|

| Key: Index + PK + TSO   | Value: Null   | Flag: Put   |
|----|----|----|

综上，主键字段的更新，30W 限制需要除以  ((1 + 普通索引数量)*2 + 唯一索引数量) ，Update 主键的时候，唯一索引当做 1 个 KV，普通索引和主键本身当做 2 个 KV（在对应的 Key-Value 中，Key 是 UK 的值，Update PK 的时候，Key 值不变，所以 Del + Put 当做一次 kv-Entry 操作；其他的，比如普通索引，Key 里面就存了 PK 的值，这样 Update 的时候记录的 Del 是一个 kv，Put 是一个新的 kv，所以当做两次处理）。

### 4.6.3 30W 键值对的转换

总结如下：
|操作|键值对转换公式|
|:----:|:----:|
| Insert | 30W/Idx_Count |
| Delete | 30W/Idx_Count |
| Update_On_PK | 30W/((1+Non_UK)\*2+UK\*1)   |
| Update_non_PK | 30W/(1+Involved_Idx_Count*2) |

具体案例：

CREATE TABLE `t1` (

  `id` int(11) NOT Null AUTO_INCREMENT,

  `name` char(10) CHARSET utf8mb4 COLLATE utf8mb4_bin DEFAULT Null,

  `age` int(11) DEFAULT Null,

  PRIMARY Key (`id`),

  Key `idx_name` (`name`)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin

以上面的简单表结构为例，该表有自增主键，外加 1 个普通索引，那么上面的事务限制对应的记录数为 ：

|操作|键值对转换公式|最大操作行数|
|:----:|:----:|:----:|
| Insert | 30W/Idx_Count | 15W |
| Delete | 30W/Idx_Count | 15W |
| Update_On_id | 30W/((1+1)*2 + 0)   | 7.5W |
| Update_On_name | 30W/(1+Involved_Idx_Count*2) | 10W |
| Update_On_age | 30W/(1+Involved_Idx_Count*2) | 30W |

对于 TiDB 来说，有一个特殊之处，就是当主键是非 int 类型时，会有一个隐藏 int 类型主键，同时，本身顶一的这个主键变成了唯一索引。所以，修改下上面表定义为如下：

CREATE TABLE `t1` (

  `id` varchar(11) NOT Null,

  `name` char(10) CHARSET utf8mb4 COLLATE utf8mb4_bin DEFAULT Null,

  `age` int(11) DEFAULT Null,

  PRIMARY Key (`id`),

  Key `idx_name` (`name`)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin

那么，该表有一个隐藏主键，外加 1 个唯一索引 (用户定义的主键)，外加 1 个普通索引，那么上面的事务限制对应的记录数为：

|操作|键值对转换公式|最大操作行数|
|:----|:----|:----|
| Insert   | 30W/Idx_Count   | 10W   |
| Delete   | 30W/Idx_Count   | 10W   |
| Update_On_id   | 30W/(1+Involved_Idx_Count*2)   | 10W   |
| Update_On_name   | 30W/(1+Involved_Idx_Count*2)   | 10W   |
| Update_On_age   | 30W/(1+Involved_Idx_Count*2) | 30W |

### 4.6.4 事务的其他限制

除了上面 RocksDB 层的限制意外，TiDB 中对于事务还有另外一个限制

(1) 参数 stmt-count-limit，默认值是 5000。

>StmtCountLimit limits the max count of statement inside a transaction.

也就是一个事务里面，默认最多包含 5000 条 SQL statement，在不超过上面 RocksDB 层的几个限制的前提下，这个参数可以修改 TiDB 的配置文件进行调整。

(2) 另外在某些场景下，例如执行 Insert Into Select 的时候，可能会遇到下面的报错

>ERROR 1105 (HY000): BatchInsert failed with error: [try again later]: con:3877 **txn takes too much time**, start: 405023027269206017, commit: 405023312534306817

这个主要是有一个隐藏参数，max-txn-time-use，默认值是 gc_life_time - 10s，也就是 590。

具体参考 PingCAP GitHub 上的文档：[https://github.com/pingcap/TiDB/blob/master/config/config.toml.example#L240](https://github.com/pingcap/TiDB/blob/master/config/config.toml.example#L240)

>\# The max time a Txn may use (in seconds) from its startTS to commitTS.
>\# We use it to guarantee GC worker will not influence any active txn. Please make sure that this# Value is less than gc_life_time - 10s.

所以我们要尽量保证一个事务在这个 gc_life_time - 10s 的时间内完成，也可以通过调整 gc 时间 + 修改这个参数来避免这个问题，可能 TiDB 的配置文件中没有放出这个参数，可以手动编辑加入这个值。当然，更好的办法应该是开启 tidb_batch_insert 参数来规避单个事务过大的问题。

### 4.6.5 如何绕开大事务的限制

官方提供内部 Batch 的方法来绕过大事务的限制，分别由三个参数来控制：

tidb_batch_insert

> 作用域: SESSION 默认值: 0 这个变量用来设置是否自动切分插入数据。仅在 Autocommit 开启时有效。 当插入大量数据时，可以将其设置为 True，这样插入数据会被自动切分为多个 Batch，每个 Batch 使用一个单独的事务进行插入。

tidb_batch_delete

> 作用域: SESSION 默认值: 0 这个变量用来设置是否自动切分待删除的数据。仅在 Autocommit 开启时有效。 当删除大量数据时，可以将其设置为 True，这样待删除数据会被自动切分为多个 Batch，每个 Batch 使用一个单独的事务进行删除。

tidb_dml_batch_size

> 作用域: SESSION 默认值: 20000 这个变量用来设置自动切分插入 / 待删除数据的的 Batch 大小。仅在 tidb_batch_insert 或 tidb_batch_delete 开启时有效。 需要注意的是，当单行总数据大小很大时，20k 行总数据量数据会超过单个事务大小限制。因此在这种情况下，用户应当将其设置为一个较小的值。

针对 Update 场景，官方还是建议通过 limit 的方式来循环操作，目前并未提供内部 Batch Update 的参数开关。

需要注意的是，开启了 Batch 功能之后，大事务的完整性就没法保证，只能保证每个批次的事务完整性。当然，数据库的最佳实践依然是由程序或 DBA 来控制事务的大小，尤其是针对分布式数据库，建议每个 Batch 控制在 100 条左右，高并发的写入，同时避免热点现象，才能发挥 TiDB 分布式的优势。
