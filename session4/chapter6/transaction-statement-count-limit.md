在2.1及之前的 TiDB 版本中，对于事务的限制是和其他关系型数据库而言比较特殊的地方，很多用户在使用过程中总是会感觉比较困惑，本文针对事务限制做一些详细的说明，希望能够帮助大家理解。

# 官方定义
> 
>由于 TiDB 分布式两阶段提交的要求，修改数据的大事务可能会出现一些问题。因此，TiDB 特意对事务大小设置了一些限制以减少这种影响：
> 
>每个键值对不超过 6MB
> 
>键值对的总数不超过 300,000
> 
>键值对的总大小不超过 100MB
> 

*详见PingCAP 官方文档，*[https://pingcap.com/docs-cn/v2.1/reference/transactions/overview/#大事务](https://pingcap.com/docs-cn/v2.1/reference/transactions/overview/#大事务)

相信键值对应该比较容易理解，毕竟 TiDB 底层存储选用的是 rocksdb 引擎，一种基于 key-value 的存储结构。而每个键值对的大小和总大小限制分别是6MB 和100MB，这个应该也比较容易理解。关键在于每个事物包含键值对的总数不超过30W 这个经常会引起一些误解，下面做一些详细说明。

# 如何理解30W
很多人第一眼看上去，以为是一个事务涉及的行数不能超过30W，但其实不是这样的，首先需要了解 TiKV 对于结构化数据是如何转化为 key-value 结构存储的。

对于 key-value 结构的数据，可以认为结构如下

| key   | value   | flag   | 
|----|----|----|
 

当插入一条数据时，tikv 是如何记录这条数据呢，包含以下几个步骤：

1、插入数据本身

| key: pk + tso | value: fields | flag: put | 
|----|----|----|
  

2、插入唯一索引 

| key: index (uk) + tso | value: pk | flag: put | 
|----|----|----|
   

3、插入普通索引  

| key: index + pk + tso | value: null | flag: put | 
|----|----|----|
综上，当执行 insert 事务时，30W 限制需要除以所有索引的数量（包含主键和唯一索引）。

下面考虑当删除一条数据时，tikv 是如何处理的。首先需要明确，rocksdb 引擎所有的操作都是新增，所以删除也是插入，只是插入了一条 flag = del 的记录，具体情况如下：

1、插入数据本身的删除标记 

| key: pk + tso | value: null | flag: del | 
|----|----|----|
  

2、插入唯一索引的删除标记

| key: index (uk) + tso | value: null | flag: del | 
|----|----|----|
  

3、插入普通索引的删除标记

| key: index + pk + tso | value: null | flag: del | 
|----|----|----|
  

综上，当执行delete 事务时，30W 限制需要除以所有索引的数量（包含主键和唯一索引）。

更新比较复杂，放到最后来说明。首先来看，更新的是非主键且无索引字段的情况。

这种情况，只需要修改记录本身的内容即可，也就是下面一步：

1、插入数据本身即可

| key: pk + tso | value: fields | flag: put | 
|----|----|----|
综上，非主键且无索引字段更新，30W 限制就是30W。

其次，来看更新的是非主键，但包含索引的字段情况。

1、数据本身

| key: pk + tso | value: fields | flag: put | 
|----|----|----|
 

2、如果更新字段上有唯一索引

  

| key: index (uk) + tso | value: null | flag: del | 
|----|----|----|
 

| key: index (uk) + tso | value: pk | flag: put | 
|----|----|----|
 

3、如果更新字段上有普通索引  

| key: index + pk + tso | value: null | flag: del | 
|----|----|----|
 

| key: index + pk + tso | value: null | flag: put | 
|----|----|----|
  

综上，非主键但索引相关字段的更新，30W 限制需要除以（1 + 字段涉及索引数量 * 2）。

最后来看当更新的是主键字段的情况。从上面插入的描述中可以看出，无论是数据本身，还是索引，都包含了 pk，所以主键更新会触发所有的key 更新，具体如下：

1、数据本身

| key: pk + tso | value: null | flag: del | 
|----|----|----|
 

| key: pk + tso | value: fields | flag: put | 
|----|----|----|
  

2、所有的唯一索引

 

| key: index (uk) + tso | value: null | flag: del | 
|----|----|----|
| key: index (uk) + tso | value: pk | flag: put | 
|----|----|----|
  

3、所有的普通索引 

  

| key: index + pk + tso | value: null | flag: del | 
|----|----|----|
 

| key: index + pk + tso   | value: null   | flag: put   | 
|----|----|----|
  

综上，主键字段的更新，30W 限制需要除以  ((1+普通索引数量)*2 + 唯一索引数量) ，update 主键的时候，唯一索引当做 1 个 kv，普通索引和主键本身当做 2 个 kv（在对应的 key-value 中，key 是 uk 的值，update pk 的时候，key 值不变，所以 del + put 当做一次 kv-entry 操作；其他的，比如普通索引，key 里面就存了 pk 的值，这样update 的时候记录的 del 是一个 kv，put 是一个新的 kv，所以当做两次处理）。

# 30W 键值对的转换
总结如下：

| insert | 30W/idx_count | 
|:----:|:----:|
| delete | 30W/idx_count | 
| update_on_pk | 30W/((1+non_uk)*2 + uk * 1)   | 
| update_non_pk | 30W/(1+involved_idx_count*2) | 

  

具体案例：

CREATE TABLE `t1` (

  `id` int(11) NOT NULL AUTO_INCREMENT,

  `name` char(10) CHARSET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,

  `age` int(11) DEFAULT NULL,

  PRIMARY KEY (`id`),

  KEY `idx_name` (`name`)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin

以上面的简单表结构为例，该表有自增主键，外加1个普通索引，那么上面的事务限制对应的记录数为 

| insert | 30W/idx_count | 15W | 
|:----:|:----:|:----:|
| delete | 30W/idx_count | 15W | 
| update_on_id | 30W/((1+1)*2 + 0)   | 7.5W | 
| update_on_name | 30W/(1+involved_idx_count*2) | 10W | 
| update_on_age | 30W/(1+involved_idx_count*2) | 30W | 

 

对于TiDB来说，有一个特殊之处，就是当主键是非int类型时，会有一个隐藏int类型主键，同时，本身顶一的这个主键变成了唯一索引。所以，修改下上面表定义为如下：

CREATE TABLE `t1` (

  `id` varchar(11) NOT NULL,

  `name` char(10) CHARSET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,

  `age` int(11) DEFAULT NULL,

  PRIMARY KEY (`id`),

  KEY `idx_name` (`name`)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin

那么，该表有一个隐藏主键，外加1个唯一索引(用户定义的主键)，外加1个普通索引，那么上面的事务限制对应的记录数为

| insert   | 30W/idx_count   | 10W   | 
|:----|:----|:----|
| delete   | 30W/idx_count   | 10W   | 
| update_on_id   | 30W/(1+involved_idx_count*2)   | 10W   | 
| update_on_name   | 30W/(1+involved_idx_count*2)   | 10W   | 
| update_on_age   | 30W/(1+involved_idx_count*2) | 30W | 

# 事务的其他限制
除了上面 rocksdb 层的限制意外，tidb 中对于事务还有另外一个限制

1、参数 stmt-count-limit，默认值是5000。

>StmtCountLimit limits the max count of statement inside a transaction.

也就是一个事务里面，默认最多包含5000条 SQL statement，在不超过上面 rocksdb 层的几个限制的前提下，这个参数可以修改 tidb 的配置文件进行调整。

2、另外在某些场景下，例如执行insert into  select 的时候，可能会遇到下面的报错

>ERROR 1105 (HY000): BatchInsert failed with error: [try again later]: con:3877 **txn takes too much time**, start: 405023027269206017, commit: 405023312534306817    

这个主要是有一个隐藏参数，max-txn-time-use，默认值是 gc_life_time - 10s，也就是590

具体参考 PingCAP GitHub 上的文档：[https://github.com/pingcap/tidb/blob/master/config/config.toml.example#L240](https://github.com/pingcap/tidb/blob/master/config/config.toml.example#L240)

># The max time a Txn may use (in seconds) from its startTS to commitTS.# We use it to guarantee GC worker will not influence any active txn. Please make sure that this# value is less than gc_life_time - 10s.

所以我们要尽量保证一个事务在这个gc_life_time - 10s 的时间内完成，也可以通过调整 gc 时间 + 修改这个参数来避免这个问题，可能 tidb 的配置文件中没有放出这个参数，可以手动编辑，加入这个值。当然了，更好的办法应该是开启 tidb_batch_insert 参数来规避单个事务过大的问题。

# 如何绕开大事务的限制
官方提供内部 batch 的方法，来绕过大事务的限制，分别由三个参数来控制：

tidb_batch_insert

>作用域: SESSION默认值: 0这个变量用来设置是否自动切分插入数据。仅在 autocommit 开启时有效。 当插入大量数据时，可以将其设置为 true，这样插入数据会被自动切分为多个 batch，每个 batch 使用一个单独的事务进行插入。

tidb_batch_delete

>作用域: SESSION默认值: 0这个变量用来设置是否自动切分待删除的数据。仅在 autocommit 开启时有效。 当删除大量数据时，可以将其设置为 true，这样待删除数据会被自动切分为多个 batch，每个 batch 使用一个单独的事务进行删除。

tidb_dml_batch_size

>作用域: SESSION默认值: 20000这个变量用来设置自动切分插入/待删除数据的的 batch 大小。仅在 tidb_batch_insert 或 tidb_batch_delete 开启时有效。 需要注意的是，当单行总数据大小很大时，20k 行总数据量数据会超过单个事务大小限制。因此在这种情况下，用户应当将其设置为一个较小的值。

针对 update 场景，官方还是建议通过 limit 的方式来循环操作，目前并未提供内部 batch update 的参数开关。

需要注意的是，开启了 batch 功能之后，大事务的完整性就没法保证了，只能保证每个批次的事务完整性。当然，数据库的最佳实践依然是由程序或 DBA 来控制事务的大小，尤其是针对分布式数据库，建议每个batch 控制在100条左右，高并发的写入，同时避免热点现象，才能发挥TiDB  分布式的优势。


