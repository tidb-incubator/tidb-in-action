# 3.5 SQL 慢查询内存表

TiDB 默认会启用慢查询日志，并将执行时间超过 `slow-threshold`（默认值为 300 毫秒）的语句记录到慢查询日志文件中。慢查询日志常用于定位慢查询语句，分析和解决 SQL 执行的性能问题。关于慢查询日志格式和字段含义，请参阅 TiDB 文档。

通过 `INFORMATION_SCHEMA.SLOW_QUERY` 表可以查询当前 TiDB 节点的慢查询日志，表中内容和慢查询日志字段一一对应。TiDB 4.0 新增了系统表 `CLUSTER_SLOW_QUERY`，可以用来查询全部 TiDB 节点的慢查询，使用上和 `SLOW_QUERY` 表一直。

本节给出一些常见的查询示例。

### 搜索 Top N 的慢查询

查询 Top 2 的慢查询。`is_internal=false` 表示排除 TiDB 内部的慢查询：

```sql
> select query_time, query
    from information_schema.slow_query
   where is_internal = false  -- 排除 TiDB 内部的慢查询 SQL
  order by query_time desc
  limit 2;
+--------------+------------------------------------------------------------------+
| query_time   | query                                                            |
+--------------+------------------------------------------------------------------+
| 12.77583857  | select * from t_slim, t_wide where t_slim.c0=t_wide.c0;          |
|  0.734982725 | select t0.c0, t1.c1 from t_slim t0, t_wide t1 where t0.c0=t1.c0; |
+--------------+------------------------------------------------------------------+
```

### 搜索某个用户的 Top N 慢查询

下面例子中搜索 test 用户执行的慢查询 SQL，且按执行消耗时间逆序排序显式前 2 条：

```sql
> select query_time, query, user
    from information_schema.cluster_slow_query
  where is_internal = false  -- 排除 TiDB 内部的慢查询 SQL
    and user = "test"        -- 查找的用户名
  order by query_time desc
  limit 2;
+-------------+------------------------------------------------------------------+----------------+
| Query_time  | query                                                            | user           |
+-------------+------------------------------------------------------------------+----------------+
| 0.676408014 | select t0.c0, t1.c1 from t_slim t0, t_wide t1 where t0.c0=t1.c1; | test           |
+-------------+------------------------------------------------------------------+----------------+
```

### 根据 SQL 指纹搜索同类慢查询

在得到 Top N 的慢查询 SQL 后，可通过 SQL 指纹继续搜索同类慢查询 SQL。

```sql
# 先获取 Top N 的慢查询和对应的 SQL 指纹
> select query_time, query, digest
    from information_schema.cluster_slow_query
   where is_internal = false
  order by query_time desc
  limit 1;
+-------------+-----------------------------+------------------------------------------------------------------+
| query_time  | query                       | digest                                                           |
+-------------+-----------------------------+------------------------------------------------------------------+
| 0.302558006 | select * from t1 where a=1; | 4751cb6008fda383e22dacb601fde85425dc8f8cf669338d55d944bafb46a6fa |
+-------------+-----------------------------+------------------------------------------------------------------+

# 再根据 SQL 指纹搜索同类慢查询
> select query, query_time
    from information_schema.cluster_slow_query
   where digest = "4751cb6008fda383e22dacb601fde85425dc8f8cf669338d55d944bafb46a6fa";
+-----------------------------+-------------+
| query                       | query_time  |
+-----------------------------+-------------+
| select * from t1 where a=1; | 0.302558006 |
| select * from t1 where a=2; | 0.401313532 |
+-----------------------------+-------------+
```

### 搜索统计信息为 `pseudo` 的慢查询 SQL 语句

```sql
> select query, query_time, stats
    from information_schema.cluster_slow_query
  where is_internal = false
    and stats like '%pseudo%';
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

### 查询执行计划发生变化的慢查询

由于统计信息不准可能导致同类型 SQL 的执行计划发生改变导致执行变慢，可以用以下 SQL 查询哪些 SQL 具有不用的执行计划：

```sql
> select count(distinct plan_digest) as count, digest,min(query) 
    from cluster_slow_query 
  group by digest 
  having count>1 
  limit 3\G
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
> select min(plan),plan_digest 
    from cluster_slow_query 
  where digest='17b4518fde82e32021877878bec2bb309619d384fca944106fcaf9c93b536e94' 
  group by plan_digest\G
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

### 查询集群各个 TiDB 节点的慢查询数量

```sql
> select instance, count(*) 
    from information_schema.cluster_slow_query 
   where time >= "2020-03-06 00:00:00" 
     and time < now() 
  group by instance;
+---------------+----------+
| instance      | count(*) |
+---------------+----------+
| 0.0.0.0:10081 | 124      |
| 0.0.0.0:10080 | 119771   |
+---------------+----------+
```

### 查询仅出现在异常时间段的慢日志

假如发现 `2020-03-10 13:24:00` ~ `2020-03-10 13:27:00` 的 QPS 降低或者延迟上升等问题，可能是由于突然出现大查询导致的，可以用下面 SQL 查询仅出现在异常时间段的慢日志，其中 `2020-03-10 13:20:00` ~ `2020-03-10 13:23:00` 为正常时间段。

```sql
> SELECT * FROM
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
