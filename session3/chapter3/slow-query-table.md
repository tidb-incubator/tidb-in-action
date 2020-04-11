# 3.5 SQL 慢查询内存表

TiDB 默认会启用慢查询日志，并将执行时间超过 `slow-threshold`（默认值为 300 毫秒）的语句记录到慢查询日志文件中。慢查询日志常用于定位慢查询语句，分析和解决 SQL 执行的性能问题。关于慢查询日志格式和字段含义，请参阅 TiDB 文档。

通过 `INFORMATION_SCHEMA.SLOW_QUERY` 表可以查询当前 TiDB 节点的慢查询日志，表中内容和慢查询日志字段一一对应。TiDB 4.0 新增了系统表 `CLUSTER_SLOW_QUERY`，可以用来查询全部 TiDB 节点的慢查询，使用上和 `SLOW_QUERY` 表一直。

TiDB 4.0 中的 `SLOW_QUERY` 已经支持查询任意时间段的慢日志，即支持查询已经被 rotate 的慢日志文件的数据。用户查询时只需要指定 TIME 时间范围即可定位需要解析的慢日志文件。如果查询不指定时间范围，则和 4.0 版本之前行为一致，只解析当前的慢日志文件。

> 注意：
> 每次查询 SLOW_QUERY 表时，TiDB 都会去读取和解析一次当前节点的慢查询日志。

## 4. 查询 SLOW_QUERY 示例

### (1) 搜索 Top N 的慢查询

查询 Top 2 的慢查询。`is_internal=false` 表示排除 TiDB 内部的慢查询：

```sql
select query_time, query
from information_schema.slow_query
where is_internal = false  -- 排除 TiDB 内部的慢查询 SQL
order by query_time desc
limit 2;
```

输出样例：

```
+--------------+------------------------------------------------------------------+
| query_time   | query                                                            |
+--------------+------------------------------------------------------------------+
| 12.77583857  | select * from t_slim, t_wide where t_slim.c0=t_wide.c0;          |
|  0.734982725 | select t0.c0, t1.c1 from t_slim t0, t_wide t1 where t0.c0=t1.c0; |
+--------------+------------------------------------------------------------------+
```

### (2) 搜索某个用户的 Top N 慢查询

下面例子中搜索 test 用户执行的慢查询 SQL，且按执行消耗时间逆序排序显式前 2 条：

```sql
select query_time, query, user
from information_schema.cluster_slow_query
where is_internal = false  -- 排除 TiDB 内部的慢查询 SQL
  and user = "test"        -- 查找的用户名
order by query_time desc
limit 2;
```

输出样例：

```
+-------------+------------------------------------------------------------------+----------------+
| Query_time  | query                                                            | user           |
+-------------+------------------------------------------------------------------+----------------+
| 0.676408014 | select t0.c0, t1.c1 from t_slim t0, t_wide t1 where t0.c0=t1.c1; | test           |
+-------------+------------------------------------------------------------------+----------------+
```

### (3) 根据 SQL 指纹搜索同类慢查询

在得到 Top N 的慢查询 SQL 后，可通过 SQL 指纹继续搜索同类慢查询 SQL。
先获取 Top N 的慢查询和对应的 SQL 指纹：

```sql
select query_time, query, digest
from information_schema.cluster_slow_query
where is_internal = false
order by query_time desc
limit 1;
```

输出样例：

```
+-------------+-----------------------------+------------------------------------------------------------------+
| query_time  | query                       | digest                                                           |
+-------------+-----------------------------+------------------------------------------------------------------+
| 0.302558006 | select * from t1 where a=1; | 4751cb6008fda383e22dacb601fde85425dc8f8cf669338d55d944bafb46a6fa |
+-------------+-----------------------------+------------------------------------------------------------------+
```

再根据 SQL 指纹搜索同类慢查询：

```sql
select query, query_time
from information_schema.cluster_slow_query
where digest = "4751cb6008fda383e22dacb601fde85425dc8f8cf669338d55d944bafb46a6fa";
```

输出样例：

```
+-----------------------------+-------------+
| query                       | query_time  |
+-----------------------------+-------------+
| select * from t1 where a=1; | 0.302558006 |
| select * from t1 where a=2; | 0.401313532 |
+-----------------------------+-------------+
```

### (4) 搜索统计信息为 pseudo 的慢查询 SQL 语句

```sql
select query, query_time, stats
from information_schema.cluster_slow_query
where is_internal = false
  and stats like '%pseudo%';
```

输出样例：

```
+-----------------------------+-------------+---------------------------------+
| query                       | query_time  | stats                           |
+-----------------------------+-------------+---------------------------------+
| select * from t1 where a=1; | 0.302558006 | t1:pseudo                       |
| select * from t1 where a=2; | 0.401313532 | t1:pseudo                       |
| select * from t1 where a>2; | 0.602011247 | t1:pseudo                       |
| select * from t1 where a>3; | 0.50077719  | t1:pseudo                       |
| select * from t1 join t2;   | 0.931260518 | t1:407872303825682445,t2:pseudo |
+-----------------------------+-------------+---------------------------------+
```

### (5) 查询执行计划发生变化的慢查询

由于统计信息不准可能导致同类型 SQL 的执行计划发生改变导致执行变慢，可以用以下 SQL 查询哪些 SQL 具有不用的执行计划：

```sql
select count(distinct plan_digest) as count, digest,min(query) 
from cluster_slow_query 
group by digest 
having count>1 limit 3\G
```

输出样例：

```
***************************[ 1. row ]***************************
count      | 2
digest     | 17b4518fde82e32021877878bec2bb309619d384fca944106fcaf9c93b536e94
min(query) | SELECT DISTINCT c FROM sbtest25 WHERE id BETWEEN ? AND ? ORDER BY c [arguments: (291638, 291737)];
***************************[ 2. row ]***************************
count      | 2
digest     | 9337865f3e2ee71c1c2e740e773b6dd85f23ad00f8fa1f11a795e62e15fc9b23
min(query) | SELECT DISTINCT c FROM sbtest22 WHERE id BETWEEN ? AND ? ORDER BY c [arguments: (215420, 215519)];
***************************[ 3. row ]***************************
count      | 2
digest     | db705c89ca2dfc1d39d10e0f30f285cbbadec7e24da4f15af461b148d8ffb020
min(query) | SELECT DISTINCT c FROM sbtest11 WHERE id BETWEEN ? AND ? ORDER BY c [arguments: (303359, 303458)];
```

然后可以用查询结果中的 SQL 指纹进一步查询不同的 plan

```sql
select min(plan),plan_digest 
from cluster_slow_query where digest='17b4518fde82e32021877878bec2bb309619d384fca944106fcaf9c93b536e94' 
group by plan_digest\G
```

输出样例：

```
*************************** 1. row ***************************
  min(plan):    Sort_6                  root    100.00131380758702      sbtest.sbtest25.c:asc
        └─HashAgg_10            root    100.00131380758702      group by:sbtest.sbtest25.c, funcs:firstrow(sbtest.sbtest25.c)->sbtest.sbtest25.c
          └─TableReader_15      root    100.00131380758702      data:TableRangeScan_14
            └─TableScan_14      cop     100.00131380758702      table:sbtest25, range:[502791,502890], keep order:false
plan_digest: 6afbbd21f60ca6c6fdf3d3cd94f7c7a49dd93c00fcf8774646da492e50e204ee
*************************** 2. row ***************************
  min(plan):    Sort_6                  root    1                       sbtest.sbtest25.c:asc
        └─HashAgg_12            root    1                       group by:sbtest.sbtest25.c, funcs:firstrow(sbtest.sbtest25.c)->sbtest.sbtest25.c
          └─TableReader_13      root    1                       data:HashAgg_8
            └─HashAgg_8         cop     1                       group by:sbtest.sbtest25.c,
              └─TableScan_11    cop     1.2440069558121831      table:sbtest25, range:[472745,472844], keep order:false
```

### (6) 查询集群各个 TIDB 节点的慢查询数量

```sql
select instance, count(*) from information_schema.cluster_slow_query where time >= "2020-03-06 00:00:00" and time < now() group by instance;
```

输出样例：

```
+---------------+----------+
| instance      | count(*) |
+---------------+----------+
| 0.0.0.0:10081 | 124      |
| 0.0.0.0:10080 | 119771   |
+---------------+----------+
```

### (7) 查询仅出现在异常时间段的慢日志

假如发现 `2020-03-10 13:24:00` ~ `2020-03-10 13:27:00` 的 QPS 降低或者延迟上升等问题，可能是由于突然出现大查询导致的，可以用下面 SQL 查询仅出现在异常时间段的慢日志，其中 `2020-03-10 13:20:00` ~ `2020-03-10 13:23:00` 为正常时间段。

```sql
SELECT * FROM
    (SELECT /*+ AGG_TO_COP(), HASH_AGG() */ count(*),
         min(time),
         sum(query_time) AS sum_query_time,
         sum(Process_time) AS sum_process_time,
         sum(Wait_time) AS sum_wait_time,
         sum(Commit_time),
         sum(Request_count),
         sum(process_keys),
         sum(Write_keys),
         max(Cop_proc_max),
         min(query),min(prev_stmt),
         digest
    FROM information_schema.CLUSTER_SLOW_QUERY
    WHERE time >= '2020-03-10 13:24:00'
            AND time < '2020-03-10 13:27:00'
            AND Is_internal = false
    GROUP BY  digest) AS t1
WHERE t1.digest NOT IN
    (SELECT /*+ AGG_TO_COP(), HASH_AGG() */ digest
    FROM information_schema.CLUSTER_SLOW_QUERY
    WHERE time >= '2020-03-10 13:20:00'
            AND time < '2020-03-10 13:23:00'
    GROUP BY  digest)
ORDER BY  t1.sum_query_time DESC limit 10\G
```

输出样例：

```
***************************[ 1. row ]***************************
count(*)           | 200
min(time)          | 2020-03-10 13:24:27.216186
sum_query_time     | 50.114126194
sum_process_time   | 268.351
sum_wait_time      | 8.476
sum(Commit_time)   | 1.044304306
sum(Request_count) | 6077
sum(process_keys)  | 202871950
sum(Write_keys)    | 319500
max(Cop_proc_max)  | 0.263
min(query)         | delete from test.tcs2 limit 5000;
min(prev_stmt)     |
digest             | 24bd6d8a9b238086c9b8c3d240ad4ef32f79ce94cf5a468c0b8fe1eb5f8d03df
```

## 5. 解析其他的 TiDB 慢日志文件

在 TiDB 4.0 之前，由于只支持解析 当前的慢日志文件，如果需要解析其他的慢日志文件，可以通过设置 session 变量 `tidb_slow_query_file` 控制查询 `INFORMATION_SCHEMA.SLOW_QUERY` 时要读取和解析的文件，示例如下：

```
set tidb_slow_query_file = "/path-to-log/tidb-slow.log"
```

由于 TiDB 4.0 已经支持解析任意时间段的慢日志，所以几乎不需要上面的 session 变量了。

## 6. 用 pt-query-digest 工具分析 TiDB 慢日志

可以用 pt-query-digest 工具分析 TiDB 慢日志。

> **注意：**
> 建议使用 pt-query-digest 3.0.13 及以上版本。

示例如下：

```
pt-query-digest --report tidb-slow.log
```

输出样例：

```
# 320ms user time, 20ms system time, 27.00M rss, 221.32M vsz
# Current date: Mon Mar 18 13:18:51 2019
# Hostname: localhost.localdomain
# Files: tidb-slow.log
# Overall: 1.02k total, 21 unique, 0 QPS, 0x concurrency _________________
# Time range: 2019-03-18-12:22:16 to 2019-03-18-13:08:52
# Attribute          total     min     max     avg     95%  stddev  median
# ============     ======= ======= ======= ======= ======= ======= =======
# Exec time           218s    10ms     13s   213ms    30ms      1s    19ms
# Query size       175.37k       9   2.01k  175.89  158.58  122.36  158.58
# Commit time         46ms     2ms     7ms     3ms     7ms     1ms     3ms
# Conn ID               71       1      16    8.88   15.25    4.06    9.83
# Process keys     581.87k       2 103.15k  596.43  400.73   3.91k  400.73
# Process time         31s     1ms     10s    32ms    19ms   334ms    16ms
# Request coun       1.97k       1      10    2.02    1.96    0.33    1.96
# Total keys       636.43k       2 103.16k  652.35  793.42   3.97k  400.73
# Txn start ts     374.38E       0  16.00E 375.48P   1.25P  89.05T   1.25P
# Wait time          943ms     1ms    19ms     1ms     2ms     1ms   972us
```

- 定位问题语句的方法

`SLOW_QUERY` 中的语句并不是都是有问题的。造成集群整体压力增大的是那些 `process_time` 很大的语句。如果 `wait_time` 很大，但 `process_time` 很小的语句通常不是问题语句，而是因为被问题语句阻塞，在执行队列等待造成的响应时间过长。

## 7. admin show slow 命令

除了基于TiDB 日志，还有一种定位慢查询的方式是通过 `admin show slow` SQL 命令：

> 注意:
> 此命令仅显示当前TiDB节点的慢查询

```sql
admin show slow recent N;
admin show slow top [internal | all] N;
```

recent N 会显示最近的 N 条慢查询记录，例如：

```sql
admin show slow recent 10;
```

top N 则显示最近一段时间（大约几天）内，最慢的查询记录。如果指定 `internal` 选项，则返回查询系统内部 SQL 的慢查询记录；如果指定 `all` 选项，返回包含系统内部的所有 SQL 汇总以后的慢查询记录；默认只返回非系统内部的 SQL 中的慢查询记录。

>说明：
>N的最大值是 30，显示时间范围为最近 7 天

例如显示最慢的 3 条SQL：

```sql
admin show slow top 3;
```

输出样例：

```
+---------------------------------------------------------------------------------------------------------------------------------------------+----------------------------+----------+--------------------------------------+------+---------+--------------------+----------------+--------------------+-----------------------+-----------+----------+------------------------------------------------------------------+
| SQL                                                                                                                                         | START                      | DURATION | DETAILS                              | SUCC | CONN_ID | TRANSACTION_TS     | USER           | DB                 | TABLE_IDS             | INDEX_IDS | INTERNAL | DIGEST                                                           |
+---------------------------------------------------------------------------------------------------------------------------------------------+----------------------------+----------+--------------------------------------+------+---------+--------------------+----------------+--------------------+-----------------------+-----------+----------+------------------------------------------------------------------+
| select instance, count(*) from `CLUSTER_SLOW_QUERY` where time >= "2020-03-05 20:55:00" and time < "2020-03-05 20:57:00" group by instance  | 2020-03-07 18:14:48.815964 | 0:00:03  | Backoff_time: 0.077 Request_count: 2 | 1    | 4       | 415124970215833601 | root@127.0.0.1 | information_schema | [4611686018427387951] |           | 0        | 9b4f3ab5d876d60b89d74a0023850a09f35689014a29ef2b5a83f79cfaba8137 |
| select instance, count(*) from information_schema.cluster_slow_query where time >= "2020-03-06 00:00:00" and time < now() group by instance | 2020-03-07 18:21:27.653822 | 0:00:02  | Request_count: 2                     | 1    | 4       | 415125074771968002 | root@127.0.0.1 | information_schema | [4611686018427387951] |           | 0        | de3ef2894becb6f562cfaf6234339c86573688637686b45c4a0262be3b8095c8 |
| select instance, count(*) from `CLUSTER_SLOW_QUERY` where time >= "2020-03-06 00:00:00" and time < now() group by instance                  | 2020-03-07 18:19:28.689143 | 0:00:02  | Request_count: 2                     | 1    | 4       | 415125043590987777 | root@127.0.0.1 | information_schema | [4611686018427387951] |           | 0        | 5cfb4b56d41e12ce3674ef069c568deb7dbedf14a2d5745055f66f63d40c72cb |
+---------------------------------------------------------------------------------------------------------------------------------------------+----------------------------+----------+--------------------------------------+------+---------+--------------------+----------------+--------------------+-----------------------+-----------+----------+------------------------------------------------------------------+
```

由于内存限制，保留的慢查询记录的条数是有限的。当命令查询的 N 大于记录条数时，返回的结果记录条数会小于 N。

输出内容详细说明，如下：

| 列名           | 描述                                   |
| :------------- | :------------------------------------- |
| start          | SQL 语句执行开始时间                   |
| duration       | SQL 语句执行持续时间                   |
| details        | 执行语句的详细信息                     |
| succ           | SQL 语句执行是否成功，1: 成功，0: 失败 |
| conn_id        | session 连接 ID                        |
| transcation_ts | 事务提交的 commit ts                   |
| user           | 执行该语句的用户名                     |
| db             | 执行该 SQL 涉及到 database             |
| table_ids      | 执行该 SQL 涉及到表的 ID               |
| index_ids      | 执行该 SQL 涉及到索引 ID               |
| internal       | 表示为 TiDB 内部的 SQL 语句            |
| digest         | 表示 SQL 语句的指纹                    |
| sql            | 执行的 SQL 语句                        |
