## 可视化Statement


在上一节介绍了怎样通过Dashboard做TiDB集群诊断报告，本节主要带领读者体会写怎么样通过dashboard的信息来Statement分析执行SQL情况，
从而达到帮助运维人员快速定位SQL性能问题。

### Statement是什么
针对SQL性能相关的问题，TiDB Dashboard提供了statement用来监控和统计SQL。例如页面上提供了丰富的列表信息，
包括延迟、执行次数、扫描行数、全表扫描次数等，可以用来分析哪些类别的SQL 语句耗时过长，消耗内存过多等情况，帮助用户定位性能问题。

### 为什么要用可视化Statement
TiDB已经有很多性能排查工具了，但我们在应对各类场景时，仍发现它们有一些不足，如下：
1. Grafana不能排查单条 SQL 的性能问题
2. Slow log只能看到慢查询
3. General log本身对性能有一些影响
4. Explain analyze只能查可以复现的问题
5. Profile只能查整个实例的瓶颈


### Statement参数配置

* tidb_enable_stmt_summary: statement功能默认开启，通过设置系统变量打开，例如：
```
set global tidb_enable_stmt_summary = true;
```
* tidb_stmt_summary_refresh_interval：performance_schema.events_statements_summary_by_digest表的的清空周期，单位是秒 (s)，默认值是 1800。
```
set global tidb_stmt_summary_refresh_interval = 1800;
```
* tidb_stmt_summary_history_size：performance_schema.events_statements_summary_by_digest_history表保存每种SQL的历史的数量，默认值是 24

```
set global tidb_stmt_summary_history_size = 24;
```


### 查看 SQL 语句的整体情况
登录后，在左侧点击「SQL 语句分析」即可进入此功能页面。在时间区间选项框中选择要分析的时间段即可得到该时段所有数据库的SQL语句执行统计情况，如果只关心某些数据库， 
则可以在第二个选项框中选择相应的数据库对结果进行过滤，支持多选。

结果以表格的形式展示，并支持按不同的列对结果进行排序。
1. 选择一份分析的时间段
2. 支持按数据库过滤
3. 支持按不同的指标排序

注:下面所称的 SQL 语句实际指的是某一类 SQL 语句。语法一致的 SQL 语句会规一划为一类相同的 SQL 语句。
比如 “SELECT * FROM employee WHERE id IN (1, 2, 3)” 和 “select * from EMPLOYEE where ID in (4, 5)” 最后都会被规一划为 “select * from employee where id in (...)”。

![1.png](/res/session3/chapter3/slow-query-table/1.png)

目前的已知问题:
1. 对于TiDB内部SQL语句来说，数据库这一列内容为空
2. 选择时间段时，只能从下拉框中选择固定的时间段，暂不支持自定义的任意时间段


### 查看单个SQL语句的详情
在 SQL 类别列点击某类 SQL 语句，可以进入该 SQL 语句的详情页查看更详细的信息，以及 该 SQL 语句在不同节点上执行的统计情况。
单个Statements详情页关键信息：

1. SQL执行总时长
2. 平均影响行数（一般是写入）
3. 平均扫描行数（一般是读）
4. 各个节点执行指标，分析出某个节点性能瓶颈
![2.png](/res/session3/chapter3/slow-query-table/2.png)

如果有耗时的SQL可以通过前面章节介绍的KeyVis来进行分析

