## 3.2 监控表
前一章节介绍了 TiDB 4.0 新增诊断功能中的集群信息表。本章节主要介绍诊断功能中的监控表。

TiDB 4.0 诊断系统添加了集群监控系统表，所有表都在 `metrics_schema` 中，可以通过 SQL 的方式查询。通过 SQL 查询监控的好处在于可以对整个集群的所有监控进行关联查询，并对比不同时间段的结果，迅速找出性能瓶颈。

### 3.2.1 监控表示例

`tidb_query_duration` 表用来查询 TiDB query 执行的百分位时间，如 P999，P99，P90 的查询耗时，单位是秒。 其表结构如下：

| 字段名 | 类型 | 字段解释 |
| :-----:| :----: | :----: |
| TIME | unsigned | query 执行的具体时间 |
| INSTANCE | varchar(512) | 运行 query 的 TiDB 实例地址， 以 `IP:PORT` 格式组织 |
| SQL_TYPE | varchar(512) | query 的具体类型，比如 `Select`，`internal` |
| QUANTILE | double unsigned| query 执行的时间百分位 |
| VALUE | double unsigned| 与 `QUANTILE` 字段对应执行时间百分位的查询耗时，如上所述，单位为秒 |

下面 SQL 查询当前时间的 P90 的 TiDB Query 耗时。可以看出，`Select` 类似的 Query 的 P90 耗时是 0.0384 秒，`internal` 类型的 P90 耗时是 0.00327。`instance` 字段是 TiDB 示例的地址。

```sql
metrics_schema> select * from tidb_query_duration where value is not null and time=now() and quantile=0.90;
+---------------------+-------------------+----------+----------+------------------+
| time                | instance          | sql_type | quantile | value            |
+---------------------+-------------------+----------+----------+------------------+
| 2020-03-08 13:34:40 | 172.16.5.40:10089 | Select   | 0.9      | 0.0384           |
| 2020-03-08 13:34:40 | 172.16.5.40:10089 | internal | 0.9      | 0.00327692307692 |
+---------------------+-------------------+----------+----------+------------------+
```

### 3.2.2 监控表列表

由于目前监控表非常多，本小节不会完全列举所有监控表。系统表 `information_schema.metrics_tables` 存储所有监控系统表的元数据信息，所有的监控表可以通过 SQL `select * from information_schema.metrics_tables` 查询。

系统表表结构如下所示：

| 字段名 | 类型 | 字段解释 |
| :-----:| :----: | :----: |
| TABLE_NAME | varchar(64) | 对应于 metrics_schema 中的表名 |
| PROMQL | varchar(64) | 监控表的主要原理是将 SQL 映射成 PromQL，并将 prometheus 结果转换成 SQL 查询结果，这个字段是 PromQL 的表达式模板，获取监控表数据时使用查询条件改写模板中的变量，生成最终的查询表达式 |
| LABELS | varchar(64) | 监控定义的 label，每一个 label 会对应监控表中的一列，SQL 中如果包含对应列的过滤，对应的 PromQL 也会改变 |
| QUANTILE | double unsigned | 百分位，对于直方图的监控数据，指定一个默认百分位，如果值为 0，表示该监控表对应的监控不是直方图 |
| COMMENT | varchar(256)| 对该监控表的解释 |

### 3.2.3 监控表实现方式

上一小节描述的表结构中有一列 `PROMQL`，TiDB 会根据 SQL 生成一条 `PromQL` 的查询，然后把查询请求发给 prometheus 查询相应的监控信息。

通过以下 SQL 的执行计划，可以发现在 `MemTableScan` 中，有一个 `PromQL`，其中 `start_time` 和 `end_time`分别表示查询监控的时间范围的起止，`step` 表示查询的分辨率步长，默认值是 1 分钟。这几个参数和 [prometheus 的 range query HTTP API](https://prometheus.io/docs/prometheus/latest/querying/api/#range-queries) 的参数是一样的。

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

### 3.2.4 监控表 session 变量

和监控表查询相关的 2 个 session 变量，可以通过修改 session 的变量来调整监控查询的默认行为。相关参数如下：

* `tidb_metric_query_step`：查询的分辨率步长。从 prometheus 的 query_range 数据时需要指定 start，end，step，其中 step 会使用该变量的值
* `tidb_metric_query_range_duration`：生成 PromQL 语句时，会将 PromQL 中的 $RANGE_DURATION 替换成该变量的值，默认值是 60 秒

> **补充知识点：**
>
> range query 是 prometheus 非常常见的一种 query，以下是它的参数：
> * query=<string>: PromQL 表达式
> * start=<rfc3339 | unix_timestamp>: 时间范围的开始
> * end=<rfc3339 | unix_timestamp>: 时间范围的结束
> * step=<duration | float>: 查询解析度（query resolution）
> * timeout=<duration>: 执行超时，这个参数是可选的
>
> prometheus 在对 PromQL 表达式求值的逻辑是这样的：
> * 对于 [start, end] 时间区间，从 start 开始，以 step 为长度，把时间区间分成若干段
> * 对每个段进行求值
> 举例：start=10，end=20，step=2，那么就会有 ts=10，ts=12，ts=14，ts=16，ts=18，ts=206 共 6 段，然后为这 6 个段进行求值。

例如，将步长调整为 60
 
```
set @@session.tidb_metric_query_step=60
```

目前 TiDB 会从 PD 中查询 `prometheus` 的地址，然后将查询请求发给 `prometheus`，后续 PD 会考虑内置监控组件，就不用再部署 `prometheus` 组件了。下面例子按照 `instance` 和 `sql_type` 聚合后，查询 `['2020-03-08 13:23:00', '2020-03-08 13:33:00')`  范围内的 P99 耗时的 avg, max, min 值。

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
