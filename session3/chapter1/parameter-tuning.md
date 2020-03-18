# 1.4 参数调优指南

## 1.4.1 优化器参数调优

TiDB 中所有的优化器参数可通过如下语句查看：

```sql
TiDB(root@127.0.0.1:test) > show variables like "%tidb%opt%";
+----------------------------------+-------+
| Variable_name                    | Value |
+----------------------------------+-------+
| tidb_opt_agg_push_down           | 0     |
| tidb_opt_concurrency_factor      | 3     |
| tidb_opt_copcpu_factor           | 3     |
| tidb_opt_correlation_exp_factor  | 1     |
| tidb_opt_correlation_threshold   | 0.9   |
| tidb_opt_cpu_factor              | 3     |
| tidb_opt_desc_factor             | 3     |
| tidb_opt_disk_factor             | 1.5   |
| tidb_opt_insubq_to_join_and_agg  | 1     |
| tidb_opt_join_reorder_threshold  | 0     |
| tidb_opt_memory_factor           | 0.001 |
| tidb_opt_network_factor          | 1     |
| tidb_opt_scan_factor             | 1.5   |
| tidb_opt_seek_factor             | 20    |
| tidb_opt_write_row_id            | 0     |
| tidb_optimizer_selectivity_level | 0     |
+----------------------------------+-------+
16 rows in set (0.01 sec)
```

接下来的小节将描述如何调整这些参数来控制优化器的行为。

## 1.4.2 控制优化器代价模型

以下 10 个参数用于控制优化器的代价模型：

```sql
TiDB(root@127.0.0.1:test) > show variables like "%tidb%factor%";
+---------------------------------+-------+
| Variable_name                   | Value |
+---------------------------------+-------+
| tidb_opt_concurrency_factor     | 3     |
| tidb_opt_copcpu_factor          | 3     |
| tidb_opt_correlation_exp_factor | 1     |
| tidb_opt_cpu_factor             | 3     |
| tidb_opt_desc_factor            | 3     |
| tidb_opt_disk_factor            | 1.5   |
| tidb_opt_memory_factor          | 0.001 |
| tidb_opt_network_factor         | 1     |
| tidb_opt_scan_factor            | 1.5   |
| tidb_opt_seek_factor            | 20    |
+---------------------------------+-------+
10 rows in set (0.01 sec)
```

假设要让优化器更加偏向先读再按照逆序排序而不是使用 TiKV 的逆序扫，可以调高 `tidb_opt_desc_factor`：

默认情况下按照索引逆序排序的执行计划:

```sql
TiDB(root@127.0.0.1:test) > desc select * from t order by a desc;
+----------------------------------+----------+-----------+-------------------------------------------------------+
| id                               | estRows  | task      | operator info                                         |
+----------------------------------+----------+-----------+-------------------------------------------------------+
| Projection_13                    | 10000.00 | root      | test.t.a, test.t.b                                    |
| └─IndexLookUp_12                 | 10000.00 | root      |                                                       |
|   ├─IndexFullScan_10(Build)      | 10000.00 | cop[tikv] | table:t, index:a, keep order:true, desc, stats:pseudo |
|   └─TableRowIDScan_11(Probe)     | 10000.00 | cop[tikv] | table:t, keep order:false, stats:pseudo               |
+----------------------------------+----------+-----------+-------------------------------------------------------+
4 rows in set (0.00 sec)
```

假设因为某种原因 TiKV 逆序扫的速度非常慢，可以通过调高该参数来摆脱逆序扫的性能问题：

```sql
TiDB(root@127.0.0.1:test) > set @@tidb_opt_desc_factor = 10;
Query OK, 0 rows affected (0.00 sec)

TiDB(root@127.0.0.1:test) > desc select * from t order by a desc;
+-------------------------+----------+-----------+-----------------------------------------+
| id                      | estRows  | task      | operator info                           |
+-------------------------+----------+-----------+-----------------------------------------+
| Sort_4                  | 10000.00 | root      | test.t.a:desc                           |
| └─TableReader_8         | 10000.00 | root      | data:TableFullScan_7                    |
|   └─TableFullScan_7     | 10000.00 | cop[tikv] | table:t, keep order:false, stats:pseudo |
+-------------------------+----------+-----------+-----------------------------------------+
3 rows in set (0.00 sec)
```

## 1.4.3 优化规则开关和黑名单

TiDB 有一个聚合下推的优化规则，因为不能确保所有场景下该优化规则都是合适的，所以目前默认关闭。这个优化规则会尽可能的把聚合算子下推到 Join 算子的下面，如果下推后能够大大减少 Join 的计算量，可以通过打开这个下推开关来提速 SQL 的执行。

一个默认情况下聚合没有下推到 Join 下面的例子：

```sql
TiDB(root@127.0.0.1:test) > desc select count(*) from t t1 join t t2 on t1.a = t2.a group by t1.a;
+-------------------------------+----------+-----------+---------------------------------------------------+
| id                            | estRows  | task      | operator info                                     |
+-------------------------------+----------+-----------+---------------------------------------------------+
| HashAgg_10                    | 7992.00  | root      | group by:test.t.a, funcs:count(1)->Column#7       |
| └─MergeJoin_13                | 12487.50 | root      | inner join, left key:test.t.a, right key:test.t.a |
|   ├─IndexReader_41(Build)     | 9990.00  | root      | index:IndexFullScan_40                            |
|   │ └─IndexFullScan_40        | 9990.00  | cop[tikv] | table:t2, index:a, keep order:true, stats:pseudo  |
|   └─IndexReader_39(Probe)     | 9990.00  | root      | index:IndexFullScan_38                            |
|     └─IndexFullScan_38        | 9990.00  | cop[tikv] | table:t1, index:a, keep order:true, stats:pseudo  |
+-------------------------------+----------+-----------+---------------------------------------------------+
6 rows in set (0.00 sec)
```

接下来可以通过打开开关 `tidb_opt_agg_push_down` 来把聚合下推到 Join 下面：

```sql
TiDB(root@127.0.0.1:test) > set tidb_opt_agg_push_down = 1;
Query OK, 0 rows affected (0.00 sec)

TiDB(root@127.0.0.1:test) > desc select count(*) from t t1 join t t2 on t1.a = t2.a group by t1.a;
+--------------------------------+---------+-----------+---------------------------------------------------------------------------------+
| id                             | estRows | task      | operator info                                                                   |
+--------------------------------+---------+-----------+---------------------------------------------------------------------------------+
| HashAgg_11                     | 7992.00 | root      | group by:test.t.a, funcs:count(Column#8)->Column#7                              |
| └─HashLeftJoin_24              | 9990.00 | root      | inner join, inner:HashAgg_37, equal:[eq(test.t.a, test.t.a)]                    |
|   ├─HashAgg_37(Build)          | 7992.00 | root      | group by:test.t.a, funcs:count(1)->Column#8, funcs:firstrow(test.t.a)->test.t.a |
|   │ └─IndexReader_44           | 9990.00 | root      | index:IndexFullScan_43                                                          |
|   │   └─IndexFullScan_43       | 9990.00 | cop[tikv] | table:t2, index:a, keep order:false, stats:pseudo                               |
|   └─IndexReader_48(Probe)      | 9990.00 | root      | index:IndexFullScan_47                                                          |
|     └─IndexFullScan_47         | 9990.00 | cop[tikv] | table:t1, index:a, keep order:false, stats:pseudo                               |
+--------------------------------+---------+-----------+---------------------------------------------------------------------------------+
7 rows in set (0.00 sec)
```

此外，TiDB 优化器使用 `mysql.opt_rule_blacklist` 来禁用出现在这个表中的逻辑优化规则。

```sql
TiDB(root@127.0.0.1:test) > desc select * from t where a > 10;
+-------------------------+----------+-----------+-----------------------------------------+
| id                      | estRows  | task      | operator info                           |
+-------------------------+----------+-----------+-----------------------------------------+
| TableReader_7           | 3333.33  | root      | data:Selection_6                        |
| └─Selection_6           | 3333.33  | cop[tikv] | gt(test.t.a, 10)                        |
|   └─TableFullScan_5     | 10000.00 | cop[tikv] | table:t, keep order:false, stats:pseudo |
+-------------------------+----------+-----------+-----------------------------------------+
3 rows in set (0.00 sec)
```

假设上面的表达式下推导致了性能回退，可以通过把 predicate_pushdown 添加到黑名单中来禁用：

```
TiDB(root@127.0.0.1:test) > insert into mysql.opt_rule_blacklist values("predicate_push_down");
Query OK, 1 row affected (0.00 sec)
```

要在当前 session 生效，需要执行 reload 语句：

```sql
TiDB(root@127.0.0.1:test) > admin reload opt_rule_blacklist;
Query OK, 0 rows affected (0.00 sec)
```

接着再查看执行计划，会发现该过滤条件没有下推到 TiKV 上执行了：

```sql
TiDB(root@127.0.0.1:test) > desc select * from t where a > 10;
+-------------------------+----------+-----------+-----------------------------------------+
| id                      | estRows  | task      | operator info                           |
+-------------------------+----------+-----------+-----------------------------------------+
| Selection_5             | 8000.00  | root      | gt(test.t.a, 10)                        |
| └─TableReader_7         | 10000.00 | root      | data:TableFullScan_6                    |
|   └─TableFullScan_6     | 10000.00 | cop[tikv] | table:t, keep order:false, stats:pseudo |
+-------------------------+----------+-----------+-----------------------------------------+
3 rows in set (0.00 sec)
```

## 1.4.4 表达式下推黑名单

当 TiDB 从 TiKV 中读取数据的时候，TiDB 会尽量下推一些表达式运算到 TiKV 中，从而减少数据传输量以及 TiDB 单一节点的计算压力。本文将介绍 TiDB 已支持下推的表达式，以及如何禁止下推特定表达式。

禁止特定表达式下推：当函数的计算过程由于下推而出现异常时，可通过黑名单功能禁止其下推来快速恢复业务。具体而言，用户可以将函数或运算符名加入黑名单 `mysql.expr_pushdown_blacklist` 中，以禁止特定表达式下推。

加入黑名单：执行以下步骤，可将一个或多个函数或运算符加入黑名单：

- 向 `mysql.expr_pushdown_blacklist` 插入对应的函数名或运算符名。
- 执行 `admin reload expr_pushdown_blacklist`。

移出黑名单：执行以下步骤，可将一个或多个函数及运算符移出黑名单：

- 从 `mysql.expr_pushdown_blacklist` 表中删除对应的函数名或运算符名。
- 执行 `admin reload expr_pushdown_blacklist`。

一个例子：

```sql
TiDB(root@127.0.0.1:test) > explain select * from t where a < 2;
+-------------------------+----------+-----------+-----------------------------------------+
| id                      | estRows  | task      | operator info                           |
+-------------------------+----------+-----------+-----------------------------------------+
| TableReader_7           | 3323.33  | root      | data:Selection_6                        |
| └─Selection_6           | 3323.33  | cop[tikv] | lt(test.t.a, 2)                         |
|   └─TableFullScan_5     | 10000.00 | cop[tikv] | table:t, keep order:false, stats:pseudo |
+-------------------------+----------+-----------+-----------------------------------------+
3 rows in set (0.00 sec)
```

将 `<` 加入黑名单：

```sql
TiDB(root@127.0.0.1:test) > insert into mysql.expr_pushdown_blacklist values('<');
Query OK, 1 row affected (0.00 sec)

TiDB(root@127.0.0.1:test) > admin reload expr_pushdown_blacklist;
Query OK, 0 rows affected (0.00 sec)
```

再次执行，就会发现这个 `<` 就没有被下推到 TiKV 了：

```sql
TiDB(root@127.0.0.1:test) > explain select * from t where a < 2;
+-------------------------+----------+-----------+-----------------------------------------+
| id                      | estRows  | task      | operator info                           |
+-------------------------+----------+-----------+-----------------------------------------+
| Selection_5             | 8000.00  | root      | lt(test.t.a, 2)                         |
| └─TableReader_7         | 10000.00 | root      | data:TableFullScan_6                    |
|   └─TableFullScan_6     | 10000.00 | cop[tikv] | table:t, keep order:false, stats:pseudo |
+-------------------------+----------+-----------+-----------------------------------------+
3 rows in set (0.00 sec)
```
