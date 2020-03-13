# 6.1.5 使用 Hint 绑定执行计划
当优化器选择了不当的执行计划的时候，需要使用 hint 进行执行计划的绑定。TiDB 兼容了mysql 的 use index，force index，ignore index 语法，同时开发了 TiDB 自身的 Optimizer Hints 语法，它基于 MySQL 5.7 中介绍的类似 comment 的语法，例如 /*+ TIDB_XX(t1, t2) */ 。TiDB目前支持的hint 语法列表：

| Hint   | 功能说明   | 
|:----|:----|
| USE INDEX   | Index Hint: Choose Index   | 
| FORCE INDEX   | Index Hint: Choose Index   | 
| IGNORE INDEX   | Index Hint: Ignore Index   | 
| /*+ TIDB_INLJ(t) */   | Join Hint: Nested Index Lookup Join   | 
| /*+ TIDB_HJ(t) */   | Join Hint: Hash Join   | 
| /*+ TIDB_SMJ(t) */   | Join Hint: Merge Join   | 
| /*+ MAX_EXECUTION_TIME(num) */   | Executiom Time Limit   | 


## 6.1.5.1 USE INDEX,FORCE INDEX,IGNORE INDEX
与 mysql 类似, 不合适的查询计划是慢查询的常见原因，这时就要用 USE INDEX 指定查询用的索引，例如


下面例子 use/force index 使得原本全表扫描的 SQL 变成了通过索引扫描。
```
mysql> explain select * from t;  
+-----------------------+---------+-----------+---------------------------+ 
| id                    | estRows | task      | operator info             |
+-----------------------+---------+-----------+---------------------------+  
| TableReader_5         | 8193.00 | root      | data:TableFullScan_4      |
|  | └─TableFullScan_4  | 8193.00 | cop[tikv] | table:t, keep order:false |  
+-----------------------+---------+-----------+---------------------------+  
2 rows in set (0.00 sec)   

mysql> explain select * from t use index(idx_1);  
+-------------------------------+---------+-----------+------------------------------------+  
| id                            | estRows | task      | operator info                      |  
+-------------------------------+---------+-----------+------------------------------------+  
| IndexLookUp_6                 | 8193.00 | root      |                                    |  
| ├─IndexFullScan_4(Build)      | 8193.00 | cop[tikv] | table:t, index:a, keep order:false |  
| └─TableRowIDScan_5(Probe)     | 8193.00 | cop[tikv] | table:t, keep order:false          |  
+-------------------------------+---------+-----------+------------------------------------+  
3 rows in set (0.00 sec)    
mysql> explain select * from t force index(idx_1);  
+-------------------------------+---------+-----------+------------------------------------+  
| id                            | estRows | task      | operator info                      |  
+-------------------------------+---------+-----------+------------------------------------+  
| IndexLookUp_6                 | 8193.00 | root      |                                    |  
| ├─IndexFullScan_4(Build)      | 8193.00 | cop[tikv] | table:t, index:a, keep order:false |  
| └─TableRowIDScan_5(Probe)     | 8193.00 | cop[tikv] | table:t, keep order:false          |  
+-------------------------------+---------+-----------+------------------------------------+  
3 rows in set (0.00 sec   
```

下面的例子 ignore index 使得原本走索引的 SQL  变成了全表扫描
```

mysql> explain select a from t where a=2;  
+------------------------+---------+-----------+-------------------------------------------------+  
| id                     | estRows | task      | operator info                                   |  
+------------------------+---------+-----------+-------------------------------------------------+  
| IndexReader_6          | 1.00    | root      | index:IndexRangeScan_5                          | 
| └─IndexRangeScan_5     | 1.00    | cop[tikv] | table:t, index:a, range:[2,2], keep order:false |  
+------------------------+---------+-----------+-------------------------------------------------+  
2 rows in set (0.00 sec)   

mysql> explain select a from t ignore index(idx_1) where a=2 ;
+-------------------------+---------+-----------+---------------------------+  
| id                      | estRows | task      | operator info             |
+-------------------------+---------+-----------+---------------------------+  
| TableReader_7           | 1.00    | root      | data:Selection_6          |  
| └─Selection_6           | 1.00    | cop[tikv] | eq(test.t.a, 2)           |  
|   └─TableFullScan_5     | 8193.00 | cop[tikv] | table:t, keep order:false |
+-------------------------+---------+-----------+---------------------------+  
3 rows in set (0.00 sec)   | 
```

和 mysql 不同的是, 目前 TiDB 并没有对 use index 和 force index 做区分

当表上有多个索引时，建议使用 use index 。tidb的表都比较大，analyze table 会对集群性能造成较大影响，因此无法频繁更新统计信息。这时就要用 use index 保证查询计划的正确性

## 6.1.5.2 MAX_EXECUTION_TIME(N)

在 SELECT 语句中可以使用 MAX_EXECUTION_TIME(N)，它会限制语句的执行时间不能超过 N 毫秒，否则服务器会终止这条语句的执行。

例如，下面例子设置了 1 秒超时
```
SELECT /*+ MAX_EXECUTION_TIME(1000) */  *  FROM t1
```
另外，环境变量 max_execution_time 也会对语句执行时间进行限制。


对于高可用和时间敏感的业务， 建议使用 MAX_EXECUTION_TIME， 以免错误的查询计划或 bug 影响整个 tidb 集群的性能甚至稳定性. OLTP 业务查询超时一般不超过 5 秒。

需要注意的是，mysql jdbc 的查询超时设置对 tidb 不起作用。其实现是客户端感知超时时，向数据库发送一个 KILL 命令， 但是由于 tidb 是负载均衡的， 为防止在错误的 TiDB 服务器上终止连接， tidb 不会执行这个 KILL。这时就要用 MAX_EXECUTION_TIME 保证查询超时的效果

## 6.1.5.3 JOIN HINT

TiDB 目前表 Join 的方式有 Sort Merge Join，Index Nested Loop Join，Hash Join，具体的每个 join 方式的实现细节可以参考 [TiDB源码阅读系列](https://pingcap.com/blog-cn/#TiDB-%E6%BA%90%E7%A0%81%E9%98%85%E8%AF%BB)

语法：


### 1. TIDB_SMJ(t1, t2)

```
SELECT /*+ TIDB_SMJ(t1, t2) */ * from t1，t2 where t1.id = t2.id;
```
提示优化器使用 Sort Merge Join 算法，简单来说，就是将 Join 的两个表，首先根据连接属性进行排序，然后进行一次扫描归并, 进而就可以得出最后的结果，这个算法通常会占用更少的内存，但执行时间会更久。 当数据量太大，或系统内存不足时，建议尝试使用。


### 2. TIDB_INLJ(t1, t2)

```
SELECT /*+ TIDB_INLJ(t1, t2) */ * from t1，t2 where t1.id = t2.id;
```
提示优化器使用 Index Nested Loop Join 算法，Index Look Up Join 会读取外表的数据，并对内表进行主键或索引键查询，这个算法可能会在某些场景更快，消耗更少系统资源，有的场景会更慢，消耗更多系统资源。对于外表经过 WHERE 条件过滤后结果集较小（小于 1 万行）的场景，可以尝试使用。TIDB_INLJ() 中的参数是建立查询计划时，内表的候选表。即 TIDB_INLJ(t1) 只会考虑使用 t1 作为内表构建查询计划


### 3. TIDB_HJ(t1, t2)

```
SELECT /*+ TIDB_HJ(t1, t2) */ * from t1，t2 where t1.id = t2.id;
```
提示优化器使用 Hash Join 算法，简单来说，t1 表和 t2 表的 Hash Join 需要我们选择一个 Inner 表来构造哈希表，然后对 Outer 表的每一行数据都去这个哈希表中查找是否有匹配的数据这个算法多线程并发执行，执行速度较快，但会消耗较多内存。

另外其他的 hint 语法也在开发中如 /*+ TIDB_STREAMAGG() */ ，/*+ TIDB_HASHAGG() */ 等。

使用 Hint 通常是在执行计划发生变化的时候，通过修改 SQL 语句调整执行计划行为，但有的时候需要在不修改 SQL 语句的情况下干预执行计划的选择。[执行计划绑定](https://pingcap.com/docs-cn/stable/reference/performance/execution-plan-bind/)提供了一系列功能使得可以在不修改 SQL 语句的情况下选择指定的执行计划。




# 

