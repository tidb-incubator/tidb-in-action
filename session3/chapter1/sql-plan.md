# 执行计划概览

一条查询 `SQL` 在真正开始执行之前，还要先经过优化器的处理。优化器是在表里面由多个索引时候，决定使用哪个索引；或者在一个语句有多表关联（JOIN）的时候，决定各个表的链接顺序。在 `TiDB` 中，优化器会根据当前数据表的实际情况来选择最优的执行计划，执行计划由一系列的算子构成。`TiDB` 通过 `EXPLAIN` 语句返回结果提供了 `TiDB` 执行 `SQL` 查询执行计划信息。

## EXPLAIN 输出格式

目前 `TiDB` 的 `EXPLAIN` 会输出 4 列，分别是：`id`，`estRows`，`task`，`operator info`。执行计划中每个算子都由这 4 列属性来描述，EXPLAIN 结果中每一行描述一个算子。每个属性的具体含义如下：

| 属性名          | 含义 |
|:----------------|:----------------------------------------------------------------------------------------------------------|
| id            | 算子的 ID，在整个执行计划中唯一的标识一个算子。在 TiDB 2.1 中，id 会格式化显示算子的树状结构。数据从 child 流向 parent，每个 算子的 parent 有且仅有一个。                                                                                       |
| estRows       | 预计当前算子将会输出的数据条数，基于统计信息以及算子的执行逻辑估算而来。在 4.0 之前叫 count。 |
| task          | 当前这个算子属于什么 task。目前的执行计划分成为两种 task，一种叫 **root** task，在 tidb-server 上执行，一种叫 **cop** task，并行的在 TiKV 上执行。当前的执行计划在 task 级别的拓扑关系是一个 root task 后面可以跟许多 cop task，root task 使用 cop task 的输出结果作为输入。cop task 中执行的也即是 TiDB 下推到 TiKV 上的任务，每个 cop task 分散在 TiKV 集群中，由多个进程共同执行。 |
| operator info | 每个算子的详细信息。各个算子的 operator info 各有不同，可参考下面的示例解读。                   |

## EXPLAIN ANALYZE 输出格式

作为 `EXPLAIN` 语句的扩展，`EXPLAIN ANALYZE` 语句执行查询相比 `EXPLAIN` 语句增加了 `actRows`, `execution info`,`memory`,`disk`。

| 属性名          | 含义 |
|:----------------|:--------------------------------- |
| estRows       | 当前算子实际输出的数据条数。 |
| execution info  | time 显示从进入算子到离开算子的全部 wall time，包括所有子算子操作的全部执行时间。如果该算子被父算子多次调用 (loops)，这个时间就是累积的时间。loops 是当前算子被父算子调用的次数。 rows 是当前算子返回的行的总数。 |
| memory  |  当前算子占用内存大小  |
| disk  |  当前算子占用磁盘大小 |

```
mysql> explain analyze select * from t where a < 10;
+-------------------------------+---------+---------+-----------+-----------------------------------------------------+--------------------------------------------------------------------------------+---------------+------+
| id                            | estRows | actRows | task      | operator info                                       | execution info                                                                 | memory        | disk |
+-------------------------------+---------+---------+-----------+-----------------------------------------------------+--------------------------------------------------------------------------------+---------------+------+
| IndexLookUp_10                | 9.00    | 9       | root      |                                                     | time:641.245µs, loops:2, rows:9, rpc num: 1, rpc time:242.648µs, proc keys:0   | 9.23046875 KB | N/A  |
| ├─IndexRangeScan_8(Build)     | 9.00    | 9       | cop[tikv] | table:t, index:a, range:[-inf,10), keep order:false | time:142.94µs, loops:10, rows:9                                                | N/A           | N/A  |
| └─TableRowIDScan_9(Probe)     | 9.00    | 9       | cop[tikv] | table:t, keep order:false                           | time:141.128µs, loops:10, rows:9                                               | N/A           | N/A  |
+-------------------------------+---------+---------+-----------+-----------------------------------------------------+--------------------------------------------------------------------------------+---------------+------+
3 rows in set (0.00 sec)
```

## 如何阅读算子的执行顺序

`TiDB` 执行计划总的来说是一个树形结构，树中每个节点即是算子。考虑到每个算子内多线程并发执行的情况，在一条 `SQL` 执行的过程中，如果能够有一个手术刀把这棵树切开看看，大家可能会发现所有的算子都正在消耗 `CPU` 和内存处理数据，从这个角度来看，算子是没有执行顺序的。

但是如果从一行数据先后被哪些算子处理的角度来看，一条数据在算子上的执行是有顺序的。这个顺序可以通过下面这个规则简单总结出来：

"`Build`总是先于 `Probe` 执行，并且 `Build` 总是出现 `Probe` 前面"

这个原则的前半句是说：如果一个算子有多个孩子结点，孩子结点 `ID` 后面有 `Build` 关键字的算子总是先于有 `Probe` 关键字的算子执行。后半句是说：`TiDB` 在展现执行计划的时候，`Build` 端总是第一个出现，接着才是 `Probe` 端。

一些例子：

```
TiDB(root@127.0.0.1:test) > explain select * from t use index(idx_a) where a = 1;
+-------------------------------+---------+-----------+---------------------------------------------------------------+
| id                            | estRows | task      | operator info                                                 |
+-------------------------------+---------+-----------+---------------------------------------------------------------+
| IndexLookUp_7                 | 10.00   | root      |                                                               |
| ├─IndexRangeScan_5(Build)     | 10.00   | cop[tikv] | table:t, index:a, range:[1,1], keep order:false, stats:pseudo |
| └─TableRowIDScan_6(Probe)     | 10.00   | cop[tikv] | table:t, keep order:false, stats:pseudo                       |
+-------------------------------+---------+-----------+---------------------------------------------------------------+
3 rows in set (0.00 sec)
```

这里 `IndexLookUp_7` 算子有两个孩子结点：`IndexRangeScan_5(Build)` 和 `TableRowIDScan_6(Probe)`。可以看到，`IndexRangeScan_5(Build)` 是第一个出现的，并且基于上面这条规则，要得到一条数据，需要先执行它得到一个 RowID 以后再由 `TableRowIDScan_6(Probe)` 根据前者读上来的 RowID 去获取完整的一行数据。

这种规则隐含的另一个信息是：出现在最前面的算子可能是最先被执行的，而出现在最末尾的算子可能是最后被执行的。比如下面这个例子：

```
TiDB(root@127.0.0.1:test) > explain select * from t t1 use index(idx_a) join t t2 use index() where t1.a = t2.a;
+----------------------------------+----------+-----------+------------------------------------------------------------------+
| id                               | estRows  | task      | operator info                                                    |
+----------------------------------+----------+-----------+------------------------------------------------------------------+
| HashLeftJoin_22                  | 12487.50 | root      | inner join, inner:TableReader_26, equal:[eq(test.t.a, test.t.a)] |
| ├─TableReader_26(Build)          | 9990.00  | root      | data:Selection_25                                                |
| │ └─Selection_25                 | 9990.00  | cop[tikv] | not(isnull(test.t.a))                                            |
| │   └─TableFullScan_24           | 10000.00 | cop[tikv] | table:t2, keep order:false, stats:pseudo                         |
| └─IndexLookUp_29(Probe)          | 9990.00  | root      |                                                                  |
|   ├─IndexFullScan_27(Build)      | 9990.00  | cop[tikv] | table:t1, index:a, keep order:false, stats:pseudo                |
|   └─TableRowIDScan_28(Probe)     | 9990.00  | cop[tikv] | table:t1, keep order:false, stats:pseudo                         |
+----------------------------------+----------+-----------+------------------------------------------------------------------+
7 rows in set (0.00 sec)
```

要完成 `HashLeftJoin_22`，需要先执行 `TableReader_26(Build)` 再执行 `IndexLookUp_29(Probe)`。而在执行 `IndexLookUp_29(Probe)` 的时候，又需要先执行 `IndexFullScan_27(Build)` 再执行 `TableRowIDScan_28(Probe)`。所以从整条执行链路来看，`TableRowIDScan_28(Probe)` 是最后被唤起执行的。

## 如何阅读扫表的执行计划

在 TiDB 中，扫表的算子有：

- **Index Reader：**表示直接从索引中读取索引列，适用于 SQL 语句中仅引用了该索引相关的列或主键。
- **Table Reader/Scan：**TableReader 表示在 TiDB 端从 TiKV 端读取，TableScan 表示在 KV 端对表数据进行扫描，属于同一功能的两个算子。
- **Index Lookup Reader：**表示从索引中进行范围扫描数据，仅返回这些数据的 RowID，通过 RowID 再次查询数据。
- **Index Merge Reader：**表示从多个索引中进行范围扫描数据。

**Index Reader 示例：**

```
mysql> explain select * from t use index(idx_a);
+-------------------------------+----------+-----------+--------------------------------------------------+
| id                            | estRows  | task      | operator info                                    |
+-------------------------------+----------+-----------+--------------------------------------------------+
| IndexLookUp_6                 | 10000.00 | root      |                                                  |
| ├─IndexFullScan_4(Build)      | 10000.00 | cop[tikv] | table:t, index:a, keep order:false, stats:pseudo |
| └─TableRowIDScan_5(Probe)     | 10000.00 | cop[tikv] | table:t, keep order:false, stats:pseudo          |
+-------------------------------+----------+-----------+--------------------------------------------------+
3 rows in set (0.00 sec)
```

这里 `IndexLookUp_6` 算子有两个孩子结点：`IndexFullScan_4(Build)` 和 `TableRowIDScan_5(Probe)`。可以看到，`IndexFullScan_4(Build)` 执行索引全表扫描得到符合条件的数据，获取到 RowID 后再由 `TableRowIDScan_5(Probe)` 获取完整的数据。

**Table Reader 示例：**

```
mysql> explain select * from t where a > 1 or b >100;
+-------------------------+----------+-----------+-----------------------------------------+
| id                      | estRows  | task      | operator info                           |
+-------------------------+----------+-----------+-----------------------------------------+
| TableReader_7           | 8000.00  | root      | data:Selection_6                        |
| └─Selection_6           | 8000.00  | cop[tikv] | or(gt(test.t.a, 1), gt(test.t.b, 100))  |
|   └─TableFullScan_5     | 10000.00 | cop[tikv] | table:t, keep order:false, stats:pseudo |
+-------------------------+----------+-----------+-----------------------------------------+
3 rows in set (0.00 sec)
```

在上面例子中 `TableReader_7` 算子的两个孩子结点：`Selection_6` 和 `TableFullScan_5`。`Selection` 表示 SQL 语句中的选择条件，通常出现在 WHERE/HAVING/ON 子句中。`TableFullScan_5` 计算逻辑下推推送了 TiKV 的 Coprocessor 上，TiDB 根据表 `t` 的统计信息估算出 `TableFullScan_5` 的输出结果行数为 10000.00，满足条件 `a > 1 or b >100` 的有 8000.00 条。

**Index Lookup Reader 示例：**

```
mysql> explain select * from t use index(idx_a) where a between 1 and 1000;
+-------------------------------+---------+-----------+------------------------------------------------------------------+
| id                            | estRows | task      | operator info                                                    |
+-------------------------------+---------+-----------+------------------------------------------------------------------+
| IndexLookUp_7                 | 250.00  | root      |                                                                  |
| ├─IndexRangeScan_5(Build)     | 250.00  | cop[tikv] | table:t, index:a, range:[1,1000], keep order:false, stats:pseudo |
| └─TableRowIDScan_6(Probe)     | 250.00  | cop[tikv] | table:t, keep order:false, stats:pseudo                          |
+-------------------------------+---------+-----------+------------------------------------------------------------------+
3 rows in set (0.00 sec)
```

在上面例子中，`IndexLookUp_7` 下的 `IndexRangeScan_5(Build)` 和 `TableRowIDScan_6(Probe)` 被下推送到 TiKV 中的算子，命中索引 `a` 进行范围扫描。

**Index Merge Reader 示例：**

```
mysql> explain select * from t use index(idx_a, idx_b) where a > 1 or b > 1;
+-------------------------+---------+-----------+------------------------------------------------------------------+
| id                      | estRows | task      | operator info                                                    |
+-------------------------+---------+-----------+------------------------------------------------------------------+
| IndexMerge_16           | 6666.67 | root      |                                                                  |
| ├─IndexRangeScan_13     | 3333.33 | cop[tikv] | table:t, index:a, range:(1,+inf], keep order:false, stats:pseudo |
| ├─IndexRangeScan_14     | 3333.33 | cop[tikv] | table:t, index:b, range:(1,+inf], keep order:false, stats:pseudo |
| └─TableRowIDScan_15     | 6666.67 | cop[tikv] | table:t, keep order:false, stats:pseudo                          |
+-------------------------+---------+-----------+------------------------------------------------------------------+
4 rows in set (0.00 sec)
```

在 TiDB 中，Index Merge Reader 用于多个索引查询语句。这里 `IndexMerge_16` 算子的三个孩子结点中 `IndexRangeScan_13`，`IndexRangeScan_14` 根据范围扫描得到符合条件的数据，再由 `TableRowIDScan_15` 算子读取完整的数据。

> **注意：**
>
> `tidb_enable_index_merge` 特性在 4.0 的 RC 版本中会默认关闭，期待能在 GA 版本中打开。同时 4.0 中的 `index merge` 的一个限制：只有析取范式（`or` 连接的表达式）能够使用 index merge。
> 执行该语句即可开启：`set @@tidb_enable_index_merge = 1;`

## 如何阅读聚合的执行计划

**Hash Aggregate 示例：**

HASH_AGG() 提示优化器使用 Hash Aggregation 算法。这个算法多线程并发执行，执行速度较快，但会消耗较多内存。例如：

```
mysql> explain select /*+ HASH_AGG() */ count(*) from t1,t2 where t1.a > 10 group by t1.id;
+-------------------------------+-----------+-----------+--------------------------------------------------------------------+
| id                            | estRows   | task      | operator info                                                      |
+-------------------------------+-----------+-----------+--------------------------------------------------------------------+
| HashAgg_11                    | 26.67     | root      | group by:test.t1.id, funcs:count(1)->Column#7                      |
| └─HashRightJoin_13            | 333333.33 | root      | CARTESIAN inner join, inner:IndexReader_15                         |
|   ├─IndexReader_15(Build)     | 33.33     | root      | index:IndexRangeScan_14                                            |
|   │ └─IndexRangeScan_14       | 33.33     | cop[tikv] | table:t1, index:a, range:(10,+inf], keep order:false, stats:pseudo |
|   └─TableReader_17(Probe)     | 10000.00  | root      | data:TableFullScan_16                                              |
|     └─TableFullScan_16        | 10000.00  | cop[tikv] | table:t2, keep order:false                                         |
+-------------------------------+-----------+-----------+--------------------------------------------------------------------+
6 rows in set (0.00 sec)
```

**Stream Aggregate 示例：**

STREAM_AGG() 提示优化器使用 Stream Aggregation 算法。这个算法通常会占用更少的内存，但执行时间会更久。数据量太大，或系统内存不足时，建议尝试使用。例如：

```
mysql> explain select /*+ STREAM_AGG() */ count(*) from t1,t2 where t1.a > 10 group by t1.id;
+---------------------------------+-----------+-----------+--------------------------------------------------------------------+
| id                              | estRows   | task      | operator info                                                      |
+---------------------------------+-----------+-----------+--------------------------------------------------------------------+
| StreamAgg_16                    | 26.67     | root      | group by:test.t1.id, funcs:count(1)->Column#7                      |
| └─Sort_28                       | 333333.33 | root      | test.t1.id:asc                                                     |
|   └─HashRightJoin_18            | 333333.33 | root      | CARTESIAN inner join, inner:IndexReader_20                         |
|     ├─IndexReader_20(Build)     | 33.33     | root      | index:IndexRangeScan_19                                            |
|     │ └─IndexRangeScan_19       | 33.33     | cop[tikv] | table:t1, index:a, range:(10,+inf], keep order:false, stats:pseudo |
|     └─TableReader_22(Probe)     | 10000.00  | root      | data:TableFullScan_21                                              |
|       └─TableFullScan_21        | 10000.00  | cop[tikv] | table:t2, keep order:false                                         |
+---------------------------------+-----------+-----------+--------------------------------------------------------------------+
7 rows in set (0.00 sec)
```

## 如何阅读 Join 的执行计划

**Hash Join 示例：**

HASH_JOIN(t1_name [, tl_name ...]) 提示优化器对指定表使用 Hash Join 算法。这个算法多线程并发执行，执行速度较快，但会消耗较多内存。例如：

```
mysql> explain select /*+ HASH_JOIN(t1, t2) */ * from t t1 join t2 on t1.a = t2.a;
+------------------------------+----------+-----------+-------------------------------------------------------------------+
| id                           | estRows  | task      | operator info                                                     |
+------------------------------+----------+-----------+-------------------------------------------------------------------+
| HashLeftJoin_33              | 10000.00 | root      | inner join, inner:TableReader_43, equal:[eq(test.t.a, test.t2.a)] |
| ├─TableReader_43(Build)      | 10000.00 | root      | data:Selection_42                                                 |
| │ └─Selection_42             | 10000.00 | cop[tikv] | not(isnull(test.t2.a))                                            |
| │   └─TableFullScan_41       | 10000.00 | cop[tikv] | table:t2, keep order:false                                        |
| └─TableReader_37(Probe)      | 10000.00 | root      | data:Selection_36                                                 |
|   └─Selection_36             | 10000.00 | cop[tikv] | not(isnull(test.t.a))                                             |
|     └─TableFullScan_35       | 10000.00 | cop[tikv] | table:t1, keep order:false                                        |
+------------------------------+----------+-----------+-------------------------------------------------------------------+
7 rows in set (0.00 sec)
```

> 注意：
>
> HASH_JOIN 的别名是 TIDB_HJ，在 3.0.x 及之前版本仅支持使用该别名；之后的版本同时支持使用这两种名称。

**Merge Join 示例：**

SM_JOIN(t1_name [, tl_name ...]) 提示优化器对指定表使用 Sort Merge Join 算法。这个算法通常会占用更少的内存，但执行时间会更久。当数据量太大，或系统内存不足时，建议尝试使用。例如：

```
mysql> explain select /*+ SM_JOIN(t1) */ * from t t1 join t t2 on t1.a = t2.a;
+------------------------------------+----------+-----------+---------------------------------------------------+
| id                                 | estRows  | task      | operator info                                     |
+------------------------------------+----------+-----------+---------------------------------------------------+
| MergeJoin_6                        | 10000.00 | root      | inner join, left key:test.t.a, right key:test.t.a |
| ├─IndexLookUp_13(Build)            | 10000.00 | root      |                                                   |
| │ ├─IndexFullScan_11(Build)        | 10000.00 | cop[tikv] | table:t2, index:a, keep order:true                |
| │ └─TableRowIDScan_12(Probe)       | 10000.00 | cop[tikv] | table:t2, keep order:false                        |
| └─IndexLookUp_10(Probe)            | 10000.00 | root      |                                                   |
|   ├─IndexFullScan_8(Build)         | 10000.00 | cop[tikv] | table:t1, index:a, keep order:true                |
|   └─TableRowIDScan_9(Probe)        | 10000.00 | cop[tikv] | table:t1, keep order:false                        |
+------------------------------------+----------+-----------+---------------------------------------------------+
7 rows in set (0.00 sec)
```

> 注意：
>
> SM_JOIN 的别名是 TIDB_SMJ，在 3.0.x 及之前版本仅支持使用该别名；之后的版本同时支持使用这两种名称。

**Index Hash Join 示例：**

INL_HASH_JOIN(t1_name [, tl_name]) 提示优化器使用 Index Nested Loop Hash Join 算法。该算法与 Index Nested Loop Join 使用条件完全一样，但在某些场景下会更为节省内存资源。

```
mysql> explain select /*+ INL_HASH_JOIN(t1) */ * from t t1 join t t2 on t1.a = t2.a;
+----------------------------------+----------+-----------+---------------------------------------------------------------------------------+
| id                               | estRows  | task      | operator info                                                                   |
+----------------------------------+----------+-----------+---------------------------------------------------------------------------------+
| IndexHashJoin_32                 | 10000.00 | root      | inner join, inner:IndexLookUp_23, outer key:test.t.a, inner key:test.t.a        |
| ├─TableReader_35(Build)          | 10000.00 | root      | data:Selection_34                                                               |
| │ └─Selection_34                 | 10000.00 | cop[tikv] | not(isnull(test.t.a))                                                           |
| │   └─TableFullScan_33           | 10000.00 | cop[tikv] | table:t2, keep order:false                                                      |
| └─IndexLookUp_23(Probe)          | 1.00     | root      |                                                                                 |
|   ├─Selection_22(Build)          | 1.00     | cop[tikv] | not(isnull(test.t.a))                                                           |
|   │ └─IndexRangeScan_20          | 1.00     | cop[tikv] | table:t1, index:a, range: decided by [eq(test.t.a, test.t.a)], keep order:false |
|   └─TableRowIDScan_21(Probe)     | 1.00     | cop[tikv] | table:t1, keep order:false                                                      |
+----------------------------------+----------+-----------+---------------------------------------------------------------------------------+
8 rows in set (0.00 sec)
```

**Index Merge Join 示例：**

INL_MERGE_JOIN(t1_name [, tl_name]) 提示优化器使用 Index Nested Loop Merge Join 算法。该算法相比于 INL_JOIN 会更节省内存。该算法使用条件包含 INL_JOIN 的所有使用条件，但还需要添加一条：join keys 中的内表列集合是内表使用的 index 的前缀，或内表使用的 index 是 join keys 中的内表列集合的前缀。

```
mysql> explain select /*+ INL_MERGE_JOIN(t1) */ * from t t1 where  t1.a  in ( select t2.a from t2 where t2.b < t1.b);
+------------------------------+----------+-----------+------------------------------------------------------------------------------------------------------+
| id                           | estRows  | task      | operator info                                                                                        |
+------------------------------+----------+-----------+------------------------------------------------------------------------------------------------------+
| HashLeftJoin_26              | 8000.00  | root      | semi join, inner:TableReader_49, equal:[eq(test.t.a, test.t2.a)], other cond:lt(test.t2.b, test.t.b) |
| ├─TableReader_49(Build)      | 10000.00 | root      | data:Selection_48                                                                                    |
| │ └─Selection_48             | 10000.00 | cop[tikv] | not(isnull(test.t2.a)), not(isnull(test.t2.b))                                                       |
| │   └─TableFullScan_47       | 10000.00 | cop[tikv] | table:t2, keep order:false                                                                           |
| └─TableReader_38(Probe)      | 10000.00 | root      | data:Selection_37                                                                                    |
|   └─Selection_37             | 10000.00 | cop[tikv] | not(isnull(test.t.a)), not(isnull(test.t.b))                                                         |
|     └─TableFullScan_36       | 10000.00 | cop[tikv] | table:t1, keep order:false                                                                           |
+------------------------------+----------+-----------+------------------------------------------------------------------------------------------------------+
7 rows in set, 1 warning (0.01 sec)
```

**Nested Loop Apply 示例：**

```
mysql> explain select /*+ INL_MERGE_JOIN(t1) */ * from t t1 where  t1.a  in ( select avg(t2.a) from t2 where t2.b < t1.b);
+----------------------------------+----------+-----------+-------------------------------------------------------------------------------+
| id                               | estRows  | task      | operator info                                                                 |
+----------------------------------+----------+-----------+-------------------------------------------------------------------------------+
| Projection_10                    | 10000.00 | root      | test.t.id, test.t.a, test.t.b                                                 |
| └─Apply_12                       | 10000.00 | root      | semi join, inner:StreamAgg_30, equal:[eq(Column#8, Column#7)]                 |
|   ├─Projection_13(Build)         | 10000.00 | root      | test.t.id, test.t.a, test.t.b, cast(test.t.a, decimal(20,0) BINARY)->Column#8 |
|   │ └─TableReader_15             | 10000.00 | root      | data:TableFullScan_14                                                         |
|   │   └─TableFullScan_14         | 10000.00 | cop[tikv] | table:t1, keep order:false                                                    |
|   └─StreamAgg_30(Probe)          | 1.00     | root      | funcs:avg(Column#12, Column#13)->Column#7                                     |
|     └─TableReader_31             | 1.00     | root      | data:StreamAgg_19                                                             |
|       └─StreamAgg_19             | 1.00     | cop[tikv] | funcs:count(test.t2.a)->Column#12, funcs:sum(test.t2.a)->Column#13            |
|         └─Selection_29           | 8000.00  | cop[tikv] | lt(test.t2.b, test.t.b)                                                       |
|           └─TableFullScan_28     | 10000.00 | cop[tikv] | table:t2, keep order:false                                                    |
+----------------------------------+----------+-----------+-------------------------------------------------------------------------------+
10 rows in set, 1 warning (0.00 sec)
```
