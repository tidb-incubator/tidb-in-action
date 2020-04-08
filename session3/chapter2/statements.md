# 2.2 分析 SQL 执行性能

上一节介绍通过 KeyVis 识别 TiDB 的业务模式。

本节将带领读者体会如何借助 TiDB Dashboard 的 Statements 信息，分析 SQL 执行情况，快速定位 SQL 性能问题。

## 1. Statements 是什么

Statement，即 SQL 语句。

针对 SQL 性能相关的问题，TiDB Dashboard 提供了 Statements 用来监控和统计 SQL。

例如页面上提供了丰富的列表信息，包括延迟、执行次数、扫描行数、全表扫描次数等，用来分析哪些类别的 SQL 语句耗时过长、消耗内存过多等情况，帮助用户定位性能问题。

## 2. 为什么要用可视化 Statements

TiDB 已支持多种性能排查工具。但在多种应用场景需求下，仍有不足，例如：

1. Grafana 不能排查单条 SQL 的性能问题
2. Slow log 只记录超过慢日志阀值的 SQL
3. General log 本身对性能有一定影响
4. Explain analyze 只能查看可以复现的问题
5. Profile 只能查看整个实例的瓶颈

因此推出可视化 Statements，可以直接在页面观察 SQL 执行情况，不需要查询系统表，便于用户定位性能问题。

## 3. 查看 Statements 整体情况

登录后，在左侧点击「SQL 语句分析」即可进入此功能页面。

在时间区间选项框中选择要分析的时间段，即可得到该时段所有数据库的 SQL 语句执行统计情况。

如果只关心某些数据库，则可以在第二个选项框中选择相应的数据库对结果进行过滤，支持多选。

结果以表格的形式展示，并支持按不同的列对结果进行排序，如下图所示。

1. 选择需要分析的时间段
2. 支持按数据库过滤
3. 支持按不同的指标排序

> 注意：
> 
> 这里所指的 SQL 语句实际指的是某一类 SQL 语句。语法一致的 SQL 语句会规一化为一类相同的 SQL 语句。

例如：

```sql
SELECT * FROM employee WHERE id IN (1, 2, 3);
select * from EMPLOYEE where ID in (4, 5);
```
规一化为 

```sql
select * from employee where id in (...);
```

![slow query table](/res/session3/chapter2/slow-query-table/1.jpg)

## 4. 查看 Statements 详情

在 SQL 类别列，点击某类 SQL 语句，可以进入该 SQL 语句的详情页查看更详细的信息，以及该 SQL 语句在不同节点上执行的统计情况。

单个 Statements 详情页关键信息如下图所示。

1. SQL 执行总时长
2. 平均影响行数（一般是写入）
3. 平均扫描行数（一般是读）
4. 各个节点执行指标（可以快速定位出某个节点性能瓶颈）

![slow query table](/res/session3/chapter2/slow-query-table/2.jpg)

## 5. Statements 参数配置

* `tidb_enable_stmt_summary`

    Statements 功能默认开启，也可以通过设置系统变量打开，例如：

  ```sql
  set global tidb_enable_stmt_summary = true;
  ```

* `tidb_stmt_summary_refresh_interval`

    设置 `performance_schema.events_statements_summary_by_digest` 表的的清空周期，单位是秒 (s)，默认值是 1800，例如：

  ```sql
  set global tidb_stmt_summary_refresh_interval = 1800;
  ```

* `tidb_stmt_summary_history_size`

    设置 `performance_schema.events_statements_summary_by_digest_history` 表保存每种 SQL 的历史的数量，默认值是 24，例如：

  ```sql
  set global tidb_stmt_summary_history_size = 24;
  ```

由于 Statements 信息是存储在内存表中，为了防止内存溢出等问题，需要限制保存的 SQL 条数和 SQL 的最大显示长度。这两个参数需要在 config.toml 的 `[stmt-summary]` 类别下配置：

* 通过 `max-stmt-count` 更改保存的 SQL 种类数量，默认 200 条。当 SQL 种类超过 `max-stmt-count` 时，会移除最近没有使用的 SQL

* 通过 `max-sql-length` 更改 `DIGEST_TEXT` 和 `QUERY_SAMPLE_TEXT` 的最大显示长度，默认是 4096

> 注意：
>
> `tidb_stmt_summary_history_size`、`max-stmt-count`、`max-sql-length` 几项配置影响内存占用，建议根据实际情况调整，不宜设置得过大。


综上所述，可视化 Statements 可以快速定位某个 SQL 性能问题，也可以配合前一小节介绍的 KeyVis 进行分析。
