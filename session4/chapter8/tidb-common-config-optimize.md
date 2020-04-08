## 8.1 TiDB 常见配置优化
在前一章节，介绍了 TiDB 常见问题处理思路，本章节主要介绍一些 TiDB 常见的配置优化。
### 8.1.1 限制 SQL 内存使用和执行时间
对于关系型数据库来说，SQL 效率毋庸置疑至关重要。可以想象一下，假设在数据库内没有任何控制机制，某条或某几条 SQL 执行时间长且耗用内存高，那么只能依赖告警系统且人工去快速定位 SQL 然后 Kill，期间效率可想而知，而在 TiDB 存在参数能让我们能够很好的限制 SQL 内存使用和执行时间。

(1) **执行时间限制**

max_execution_time

* 作用域：GlOBAL | SESSION | SQL HINT
* 默认值：0
* 含义：该变量会限制语句的执行时间不能超过 N 毫秒，否则服务器会终止这条语句的执行，SQL Hint 方式具体示例如下：

SQL Hint:

```
mysql> SELECT /*+ MAX_EXECUTION_TIME(1000) */ * FROM t1 INNER JOIN t2 WHERE ...;
```
(2) **内存使用限制**

tidb_mem_quota_query

* 作用域：SESSION
* 默认值：32 GB
* 含义： 该变量是系统变量，用来设置一条查询语句的内存使用阈值。 如果一条查询语句执行过程中使用的内存空间超过该阈值，会触发 TiDB 启动配置文件中 OOMAction 项所指定的行为，配置文件 oom-action 默认值 log，表示打印超过内存阈值 SQL，可通过配置 cancel 实现 Kill SQL 语句，SQL设置具体示例如下：
```
--设置内存使用限制为10G
mysql> set @@session.tidb_mem_quota_query=10737418240;
Query OK, 0 rows affected (0.00 sec)
mysql> show variables like '%tidb_mem_quota_query%';
+----------------------+-------------+
| Variable_name        | Value       |
+----------------------+-------------+
| tidb_mem_quota_query | 10737418240 |
+----------------------+-------------+
1 row in set (0.00 sec)
```
mem-quota-query
* 作用域：GLOBAL
* 默认值：32GB
* 含义：该变量是 TiDB 全局 Global 配置，需在 TiDB 配置文件设置（可在 tidb-ansible conf/tidb.yaml 配置 mem-quota-query 滚更生效），如果一条查询语句执行过程中使用的内存空间超过该阈值，会触发 TiDB 启动配置文件中 OOMAction 项所指定的行为，配置文件 oom-action 默认值 log，表示打印超过内存阈值 SQL，可通过配置 cancel 实现 Kill SQL 语句，具体示例如下：

```
conf/tidb.yaml
---
# default configuration file for TiDB in yaml format
​
global:
  ...
  # Only print a log when out of memory quota.
  # Valid options: ["log", "cancel"]
  # oom-action: "log"
​
  # Set the memory quota for a query in bytes. Default: 32GB
  # mem-quota-query: 34359738368
```

### 8.1.2 事务重试设置
TiDB 数据库锁机制有别于传统数据库悲观锁，采用乐观锁，2PC 提交，此处不作具体展开，详情可查看 TiDB事务模型章节。针对事务冲突处理，可根据业务场景按需决定是否事务重试。

tidb_retry_limit

* 作用域：SESSION | GLOBAL
* 默认值：10
* 含义：该变量用来设置最大重试次数。一个事务执行中遇到可重试的错误（例如事务冲突、事务提交过慢或表结构变更）时，会根据该变量的设置进行重试。注意当 tidb_retry_limit = 0 时，也会禁用自动重试，SQL设置具体示例如下：

```
--设置SESSION作用域
mysql> set @@session.tidb_retry_limit=0;
Query OK, 0 rows affected (0.01 sec)

--设置GLOBAL作用域
mysql> set @@global.tidb_retry_limit=0;
Query OK, 0 rows affected (0.00 sec)

mysql> show variables like '%tidb_retry_limit%';
+------------------+-------+
| Variable_name    | Value |
+------------------+-------+
| tidb_retry_limit | 0     |
+------------------+-------+
```

tidb_disable_txn_auto_retry

* 作用域：SESSION | GLOBAL
* 默认值：on
* 含义：该变量用来设置是否禁用显式事务自动重试，若将变量值设置为 on 时，表示不会自动重试，遇到事务冲突需要在应用层重试。若将变量值设为 off，遇到事务冲突 TiDB 将会自动重试事务，这样在事务提交时遇到的错误更少。需要注意的是，这样可能会导致数据更新丢失。该变量不会影响自动提交的隐式事务和 TiDB 内部执行的事务，它们依旧会根据 tidb_retry_limit 的值来决定最大重试次数，SQL设置具体示例如下：

```
--设置SESSION作用域
mysql> set @@session.tidb_disable_txn_auto_retry=OFF;
Query OK, 0 rows affected (0.00 sec)

--设置GLOBAL作用域
mysql> set @@global.tidb_disable_txn_auto_retry=OFF;
Query OK, 0 rows affected (0.00 sec)

mysql> show variables like '%tidb_disable_txn_auto_retry%';
+-----------------------------+-------+
| Variable_name               | Value |
+-----------------------------+-------+
| tidb_disable_txn_auto_retry | OFF   |
+-----------------------------+-------+
1 row in set (0.01 sec)
```

### 8.1.3 Join 算子优化
TiDB 数据库 SQL 执行，Join 算子天然并发，当系统资源富余时，可根据数据库 TP | AP 应用可适当调整 Join 算子并发提高 SQL 执行效率，提升数据库系统性能。

tidb_distsql_scan_concurrency

* 作用域：SESSION | GLOBAL
* 默认值：15
* 含义：该变量用来设置 scan 操作的并发度，AP 类应用适合较大的值，TP 类应用适合较小的值。 对于 AP 类应用，最大值建议不要超过所有 TiKV 节点的 CPU 核数，SQL设置具体示例如下：

```
--设置SESSION作用域
mysql> set @@session.tidb_distsql_scan_concurrency=30;
Query OK, 0 rows affected (0.00 sec)

--设置GLOBAL作用域
mysql> set @@global.tidb_distsql_scan_concurrency=30;
Query OK, 0 rows affected (0.00 sec)

mysql> show variables like '%tidb_distsql_scan_concurrency%';
+-------------------------------+-------+
| Variable_name                 | Value |
+-------------------------------+-------+
| tidb_distsql_scan_concurrency | 30    |
+-------------------------------+-------+
1 row in set (0.01 sec)
```

tidb_index_lookup_size

* 作用域：SESSION | GLOBAL
* 默认值：20000
* 含义：该变量用来设置 index lookup 操作的 batch 大小，AP 类应用适合较大的值，TP 类应用适合较小的值，SQL设置具体示例如下：

```
--设置SESSION作用域
mysql> set @@session.tidb_index_lookup_size=40000;
Query OK, 0 rows affected (0.00 sec)

--设置GLOBAL作用域
mysql> set @@global.tidb_index_lookup_size=40000;
Query OK, 0 rows affected (0.01 sec)

mysql> show variables like '%tidb_index_lookup_size%';
+------------------------+-------+
| Variable_name          | Value |
+------------------------+-------+
| tidb_index_lookup_size | 40000 |
+------------------------+-------+
1 row in set (0.00 sec)
```

tidb_index_lookup_concurrency

* 作用域：SESSION | GLOBAL
* 默认值：4
* 含义：该变量用来设置 index lookup 操作的并发度，AP 类应用适合较大的值，TP 类应用适合较小的值，SQL设置具体示例如下：

```
--设置SESSION作用域
mysql> set @@session.tidb_index_lookup_concurrency=8;
Query OK, 0 rows affected (0.00 sec)

--设置GLOBAL作用域
mysql> set @@global.tidb_index_lookup_concurrency=8;
Query OK, 0 rows affected (0.00 sec)

mysql> show variables like '%tidb_index_lookup_concurrency%';
+-------------------------------+-------+
| Variable_name                 | Value |
+-------------------------------+-------+
| tidb_index_lookup_concurrency | 8     |
+-------------------------------+-------+
1 row in set (0.00 sec)
```

tidb_index_lookup_join_concurrency

* 作用域：SESSION | GLOBAL
* 默认值：4
* 含义：该变量用来设置 index lookup join 算法的并发度，SQL设置具体示例如下：

```
--设置SESSION作用域
mysql> set @@session.tidb_index_lookup_join_concurrency=8;
Query OK, 0 rows affected (0.00 sec)
--设置GLOBAL作用域
mysql> set @@global.tidb_index_lookup_join_concurrency=8;
Query OK, 0 rows affected (0.01 sec)
mysql> show variables like '%tidb_index_lookup_join_concurrency%';
+------------------------------------+-------+
| Variable_name                      | Value |
+------------------------------------+-------+
| tidb_index_lookup_join_concurrency | 8     |
+------------------------------------+-------+
1 row in set (0.00 sec)
```

tidb_hash_join_concurrency

* 作用域：SESSION | GLOBAL
* 默认值：5
* 含义：该变量用来设置 hash join 算法的并发度，SQL设置具体示例如下：

```
--设置SESSION作用域
mysql> set @@session.tidb_hash_join_concurrency=10;
Query OK, 0 rows affected (0.01 sec)

--设置GLOBAL作用域
mysql> set @@global.tidb_hash_join_concurrency=10;
Query OK, 0 rows affected (0.00 sec)

mysql> show variables like '%tidb_hash_join_concurrency%';
+----------------------------+-------+
| Variable_name              | Value |
+----------------------------+-------+
| tidb_hash_join_concurrency | 10    |
+----------------------------+-------+
1 row in set (0.01 sec)
```

tidb_index_serial_scan_concurrency

* 作用域：SESSION | GLOBAL
* 默认值：1
* 含义：该变量用来设置顺序 scan 操作的并发度，AP 类应用适合较大的值，TP 类应用适合较小的值，SQL设置具体示例如下：

```
--设置SESSION作用域
mysql> set @@session.tidb_index_serial_scan_concurrency=4;
Query OK, 0 rows affected (0.00 sec)

--设置GLOBAL作用域
mysql> set @@global.tidb_index_serial_scan_concurrency=4;
Query OK, 0 rows affected (0.01 sec)

mysql> show variables like '%tidb_index_serial_scan_concurrency%';
+------------------------------------+-------+
| Variable_name                      | Value |
+------------------------------------+-------+
| tidb_index_serial_scan_concurrency | 4     |
+------------------------------------+-------+
1 row in set (0.00 sec)
```

### 8.1.4 常见 Mysql 兼容问题
compatible-kill-query

* 默认值：false
* 含义：设置 Kill 语句的兼容性，TiDB 中 Kill sessionID 的行为和 MySQL 中的行为不相同。杀死一条查询，在 TiDB 里需要加上 TiDB 关键词，即 Kill TiDB sessionID。但如果把 compatible-kill-query 设置为 true，则不需要加上 TiDB 关键词。这种区别很重要，因为当用户按下 Ctrl+C 时，MySQL 命令行客户端的默认行为是：创建与后台的新连接，并在该新连接中执行 Kill 语句。如果负载均衡器或代理已将该新连接发送到与原始会话不同的 TiDB 服务器实例，则该错误会话可能被终止，从而导致使用 TiDB 集群的业务中断。只有当确定在 Kill 语句中引用的连接正好位于 Kill 语句发送到的服务器上时，才可以启用 compatible-kill-query ,具体示例如下(修改 tidb-ansible conf/tidb.yaml 配置再滚更)：

```
conf/tidb.yaml
---
# default configuration file for TiDB in yaml format
​
global:
  ...
  # Make "kill query" behavior compatible with MySQL. It's not recommend to
  # turn on this option when TiDB server is behind a proxy.
  compatible-kill-query: false
```

```
tidb_constraint_check_in_place
* 作用域：SESSION | GLOBAL
* 默认值：0
* 含义：TiDB 支持乐观事务模型，即在执行写入时，假设不存在冲突。冲突检查是在最后 commit 提交时才去检查。这里的检查指 unique key 检查。该变量用来控制是否每次写入一行时就执行一次唯一性检查。注意，开启该变量后，在大批量写入场景下，对性能会有影响。示例：
```

```
--默认关闭 tidb_constraint_check_in_place 参数行为
create table t (i int key);
insert into t values (1);
begin;
insert into t values (1);
Query OK, 1 row affected
commit;   --commit 时才去做检查，并报错重复主键
ERROR 1062 : Duplicate entry '1' for key 'PRIMARY'


--打开 tidb_constraint_check_in_place 参数行为
set @@tidb_constraint_check_in_place=1;
begin;
insert into t values (1);
ERROR 1062 : Duplicate entry '1' for key 'PRIMARY'
```

### 8.1.5 其他优化项
prepared-plan-cache 以及 txn_local_latches 两个参数主要是 TiDB 配置参数，需要在 TiDB 配置文件中设置，可在 tidb-ansible conf/tidb.yaml 设置，再滚更 tidb-server 节点。

```
conf/tidb.yaml
-- 执行计划缓存
prepared_plan_cache:
  enabled: true              -- 是否开启 prepare 语句的 plan cache,默认值 false
  capacity: 100              -- 缓存语句的数量
  memory-guard-ratio: 0.1    --用于防止超过 performance.max-memory, 超过 max-proc * (1 - prepared-plan-cache.memory-guard-ratio) 会剔除 LRU 中的元素,最小值为 0；最大值为 1,默认值 0.1
  
-- 事务内存锁相关配置，当本地事务冲突比较多时建议开启
txn_local_latches:
   enable：true               -- 是否开启事务内存锁相关配置,默认值 false
   capacity: 2048000          -- Hash 对应的 slot 数，会自动向上调整为 2 的指数倍。每个 slot 占 32 Bytes 内存。当写入数据的范围比较广时（如导数据），设置过小会导致变慢，性能下降。
```
