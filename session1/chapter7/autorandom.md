## 7.4 AutoRandom

AutoRandom 是 TiDB 4.0 提供的一种扩展语法，用于解决整数类型主键通过 AutoIncrement 属性隐式分配 ID 时的写热点问题。

### 7.4.1 AutoRandom 功能介绍

在前面的章节提到过，TiDB 的每一行数据都包含一个隐式的 `_tidb_rowid`。`_tidb_rowid` 会被编码到存储引擎的 Key 上，在 TiKV 中，这决定了数据在 TiKV 中的 Region 位置。

如果表的主键为整数类型，则 TiDB 会把表的主键映射为 `_tidb_rowid`，即使用“主键聚簇索引”。在这种情况下，如果表使用了 `AUTO_INCREMENT` 就会造成主键的热点问题，并无法使用 `SHARD_ROW_ID_BITS` 来打散热点。

针对上述热点问题，如果使用 `AUTO_INCREMENT` 仅仅只是用来保证主键唯一性（不需要连续或递增），那么我们可以将 `AUTO_INCREMENT` 改为 `AUTO_RANDOM`，插入数据时让 TiDB 自动为整型主键列分配一个值，消除行 ID 的连续性，从而达到打散热点的目的。

AutoRandom 提供以下的功能：

* 唯一性：TiDB 始终保持填充数据在表范围内的唯一性。
* 高性能：TiDB 能够以较高的吞吐分配数据，并保证数据的随机分布以配合 `PRE_SPLIT_REGION` 语法共同使用，避免大量写入时的写热点问题。
* 支持隐式分配和显式写入：类似列的 AutoIncrement 属性，列的值既可以由 TiDB Server 自动分配，也可以由客户端直接指定写入。该需求来自于使用 Binlog 进行集群间同步时，保证上下游数据始终一致。

### 7.4.2 AutoRandom 语法介绍

在建表时，`AUTO_RANDOM` 关键字可以作为列属性，指定在 TiDB 主键列上。TiDB 4.0 中，列属性语法定义被更新为：

```SQL
column_definition:
    data_type [NOT NULL | NULL] [DEFAULT default_value]
      [AUTO_INCREMENT | AUTO_RANDOM [(length)]]
      [UNIQUE [KEY] | [PRIMARY] KEY]
      [COMMENT 'string']
      [reference_definition]
```

注意，AutoRandom 仅支持主键列，唯一索引列尚不支持，目前也没有支持计划。`AUTO_RANDOM` 关键字后可以指定 Shard Bits 数量，默认为 5。

### 7.4.3 AutoRandom 使用示例

使用 AUTO_RANDOM 功能前，须在 TiDB 配置文件 `experimental` 部分设置 `allow-auto-random = true`。该参数详情可参见 [allow-auto-random](https://pingcap.com/docs-cn/dev/reference/configuration/tidb-server/configuration-file#allow-auto-random)。

以下面语句建立的表为例：

```SQL
tidb> create table t (a int primary key auto_random);
```

此时再执行形如 INSERT INTO t(b) values... 的 INSERT 语句，示例如下：

```SQL
tidb> insert into t values (), ();
Query OK, 2 rows affected (0.00 sec)
Records: 2  Duplicates: 0  Warnings: 0

tidb> select * from t;
+-----------+
| a         |
+-----------+
| 201326593 |
| 201326594 |
+-----------+
2 rows in set (0.00 sec)

tidb> insert into t values (), ();
Query OK, 2 rows affected (0.01 sec)
Records: 2  Duplicates: 0  Warnings: 0

tidb> select * from t;
+------------+
| a          |
+------------+
|  201326593 |
|  201326594 |
| 2080374787 |
| 2080374788 |
+------------+
4 rows in set (0.00 sec)

tidb> select last_insert_id();
+------------------+
| last_insert_id() |
+------------------+
|       2080374787 |
+------------------+
1 row in set (0.00 sec)
```

注意：

* 如果该 INSERT 语句没有指定整型主键列（a 列）的值，TiDB 会为该列自动分配值。该值不保证自增，不保证连续，只保证唯一，避免了连续的行 ID 带来的热点问题。
* 如果该 INSERT 语句显式指定了整型主键列的值，和 AutoIncrement 属性类似，TiDB 会保存该值。
* 若在单条 INSERT 语句中写入多个值，AutoRandom 属性会保证分配 ID 的连续性，同时 `LAST_INSERT_ID()` 返回第一个分配的值，这使得可以通过 `LAST_INSERT_ID()` 结果推断出所有被分配的 ID。 

### 7.4.5 AutoRandom 与其它方案的比较

与 AutoRandom 相比，TiDB 还可以通过其他的方式避免主键自动分配时的写热点问题：

* 使用 [alter-primary-key 配置选项](https://pingcap.com/docs-cn/dev/reference/configuration/tidb-server/configuration-file/#alter-primary-key)关闭主键聚簇索引，使用 AutoIncrement + `SHARD_ROW_ID_BITS`。

  在这种方式下，主键索引被当做普通的唯一索引处理，使得数据的写入可以由 `SHARD_ROW_ID_BITS` 语法打散避免热点，但缺点在于，主键仍然存在索引写入的热点，同时在查询时，由于关闭了聚簇索引，针对主键的查询需要进行一次额外的回表。

* 在主键指定 `UUID()` 函数。

  这种做法同样可以为主键自动分配随机的默认值，保证数据和主键不存在写热点问题。但缺点在于 `UUID()` 分配的是字符串类型。TiDB 不支持字符串类型主键的聚簇索引，同样带来主键查询的额外回表。

参考文献：

参阅 [`AUTO_RANDOM` 的详细说明](https://github.com/pingcap/docs/blob/master/reference/sql/attributes/auto-random.md)
