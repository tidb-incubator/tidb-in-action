# 监控表

TiDB 4.0 诊断系统添加了集群监控系统表，所有表都在 `metrics_schema` 中，可以通过 SQL 的方式查询监控，SQL 查询监控的好处在于可以对整个集群的所有监控进行关联查询，并对比不同时间段的结果，迅速找出性能瓶颈。

## 示例

下面是 `tidb_query_duration` 监控表的查询示例：

`tidb_query_duration` 的表结构如下，从表的 `COMMENT` 中可以看出，这个表的是用来查询 TIDB query 执行的百分位时间，如 P999，P99，P90 的查询耗时，单位是秒。

```sql
metrics_schema> show create table tidb_query_duration;
+---------------------+--------------------------------------------------------------------------------------------------------------------+
| Table               | Create Table                                                                                                       |
+---------------------+--------------------------------------------------------------------------------------------------------------------+
| tidb_query_duration | CREATE TABLE `tidb_query_duration` (                                                                               |
|                     |   `time` datetime unsigned DEFAULT NULL,                                                                           |
|                     |   `instance` varchar(512) DEFAULT NULL,                                                                            |
|                     |   `sql_type` varchar(512) DEFAULT NULL,                                                                            |
|                     |   `quantile` double unsigned DEFAULT NULL,                                                                         |
|                     |   `value` double unsigned DEFAULT NULL                                                                             |
|                     | ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='The quantile of TiDB query durations(second)' |
+---------------------+--------------------------------------------------------------------------------------------------------------------+
```

下面是查询当前时间的 P90 的 TiDB Query 耗时，可以看出，`Select` 类似的 Query 的 P90 耗时是 0.0384 秒，`internal` 类型的 P90 耗时是 0.00327。instance 字段是 TiDB 示例的地址。

```sql
metrics_schema> select * from tidb_query_duration where value is not null and time=now() and quantile=0.90;
+---------------------+-------------------+----------+----------+------------------+
| time                | instance          | sql_type | quantile | value            |
+---------------------+-------------------+----------+----------+------------------+
| 2020-03-08 13:34:40 | 172.16.5.40:10089 | Select   | 0.9      | 0.0384           |
| 2020-03-08 13:34:40 | 172.16.5.40:10089 | internal | 0.9      | 0.00327692307692 |
+---------------------+-------------------+----------+----------+------------------+
```
那么这个查询是怎么实现的呢？ TiDB 会根据 SQL 生成一条 `PromQL` 的查询，然后把查询请求发给 PD 查询监控信息。

我们来看下这个查询的执行计划，可以发现在 `MemTableScan` 中，有一个 `PromQL`，以及 `start_time` 和 `end_time`，表示查询监控的时间范围。`step` 是查询的分辨率步长，默认值是 1 分钟。这几个参数和 [prometheus 的 range query HTTP API](https://prometheus.io/docs/prometheus/latest/querying/api/#range-queries) 的参数是一样的。

```sql
metrics_schema> desc select * from tidb_query_duration where value is not null and time=now() and quantile=0.90;
+------------------+----------+------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| id               | estRows  | task | operator info                                                                                                                                                                                         |
+------------------+----------+------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| Selection_5      | 8000.00  | root | not(isnull(Column#5))                                                                                                                                                                                 |
| └─MemTableScan_6 | 10000.00 | root | PromQL:histogram_quantile(0.9, sum(rate(tidb_server_handle_query_duration_seconds_bucket{}[60s])) by (le,sql_type,instance)), start_time:2020-03-08 13:13:15, end_time:2020-03-08 13:13:15, step:1m0s |
+------------------+----------+------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
```

如果 SQL 的 `Where` 中没有 time 条件，默认会查询最近 10 分钟的监控数据。 

和监控表查询相关的 2 个 session 变量：

* `tidb_metric_query_step`：查询的分辨率步长。从 Promethues 的 query_range 数据时需要指定 start，end，step，其中 step 会使用该变量的值。
* `tidb_metric_query_range_duration`：生成 PormQL 语句时，会将 PROMQL 中的 $RANGE_DURATION 替换成该变量的值，默认值是 60 秒。

目前 PD 会将查询请求转发给 `prometheus`，后续 PD 会考虑内置监控组件，就不用再部署 `prometheus` 组件了。

下面是按照 `instance` 和 `sql_type` 聚合后，查询 `['2020-03-08 13:23:00', '2020-03-08 13:33:00')`  范围内的 P99 耗时的 avg, max, min 值。

```sql
metrics_schema> select instance,sql_type, avg(value),max(value),min(value) from tidb_query_duration where time >= '2020-03-08 13:23:00' and time < '2020-03-08 13:33:00' and value is not null and quantile=0.99 group by instance,sql_type;
+-------------------+----------+-------------------+------------------+-------------------+
| instance          | sql_type | avg(value)        | max(value)       | min(value)        |
+-------------------+----------+-------------------+------------------+-------------------+
| 172.16.5.40:10089 | Select   | 0.00800917072138  | 0.00824108821892 | 0.00790462559176  |
| 172.16.5.40:10089 | internal | 0.012384          | 0.01554          | 0.0062            |
| 172.16.5.40:10089 | Insert   | 0.00687276884265  | 0.0069763539823  | 0.00670463917526  |
| 172.16.5.40:10089 | general  | 0.000923958333333 | 0.00133333333333 | 0.000666666666667 |
+-------------------+----------+-------------------+------------------+-------------------+
```

## metrics_tables 系统表

由于目前添加的监控系统表数量较多，本文不对各个表进行逐个解释。可以通过 `information_schema.metrics_tables` 查询所有监控的信息，下面是示例：

```sql
information_schema> select * from information_schema.metrics_tables limit 3\G
***************************[ 1. row ]***************************
TABLE_NAME | abnormal_stores
PROMQL     | sum(pd_cluster_status{ type=~"store_disconnected_count|store_unhealth_count|store_low_space_count|store_down_count|store_offline_count|store_tombstone_count"})
LABELS     | instance,type
QUANTILE   | 0.0
COMMENT    |
***************************[ 2. row ]***************************
TABLE_NAME | etcd_disk_wal_fsync_rate
PROMQL     | delta(etcd_disk_wal_fsync_duration_seconds_count{$LABEL_CONDITIONS}[$RANGE_DURATION])
LABELS     | instance
QUANTILE   | 0.0
COMMENT    | The rate of writing WAL into the persistent storage
***************************[ 3. row ]***************************
TABLE_NAME | etcd_wal_fsync_duration
PROMQL     | histogram_quantile($QUANTILE, sum(rate(etcd_disk_wal_fsync_duration_seconds_bucket{$LABEL_CONDITIONS}[$RANGE_DURATION])) by (le,instance))
LABELS     | instance
QUANTILE   | 0.99
COMMENT    | The quantile time consumed of writing WAL into the persistent storage
```

`metrics_tables` 的字段解释如下：

* TABLE_NAME：对应于 metrics_schema 中的表名。
* PROMQL：监控表的主要原理是将 SQL 映射成 PromQL，并将 Promethues 结果转换成 SQL 查询结果。这个字段是 PromQL 的表达式模板，获取监控表数据时使用查询条件改写模板中的变量，生成最终的查询表达式。
* LABELS：监控定义的 label，每一个 label 会对应监控表中的一列，SQL 中如果包含对应列的过滤，对应生成的 PromQL 也会改变。
* QUANTILE：百分位值，对于直方图类型的监控数据，指定一个默认百分位，如果值为 0，表示该监控表对应的监控不是直方图。
* COMMENT：是对这个监控表的解释。

