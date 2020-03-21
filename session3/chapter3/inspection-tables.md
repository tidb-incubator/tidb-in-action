# 3.3 诊断结果表

## 1. 背景

在 3.1 和 3.2 中介绍了 TiDB 4.0 引入的集群信息表和集群监控表，也通过 SQL 演示了如何通过查询这些表来发现集群问题，比如通过 `information_schema.cluster_config` 发现集群不同节点配置不一致，通过 `information_schema.cluster_info` 发现是否存在组件版本不一样。

手动执行固定模式的 SQL 排查集群问题是低效的，所以 TiDB 4.0 利用已有的基础信息表提供了诊断相关的系统表来自动执行诊断：

 * `information_schema.inspection_result`
 * `information_schema.inspection_summary`

诊断功能可以帮助用户快速发现问题，减少用户的重复性手动工作。诊断功能使用 SQL `select * from information_schema.inspection_result` 触发内部的诊断。

诊断模块内部包含一系列的规则，这些规则会通过查询已有的监控表和集群信息表，对结果和预先设定的阈值进行对比，如果结果超过阈值或低于阈值将生成 `warning` / `critical` 的结果，并在 `details` 列中提供进一步信息。

## 2. 诊断结果表

诊断结果表 `information_schema.inspection_result` 的表结构如下：

```
mysql> desc inspection_result;
+-----------+--------------+------+------+---------+-------+
| Field     | Type         | Null | Key  | Default | Extra |
+-----------+--------------+------+------+---------+-------+
| RULE      | varchar(64)  | YES  |      | NULL    |       |
| ITEM      | varchar(64)  | YES  |      | NULL    |       |
| TYPE      | varchar(64)  | YES  |      | NULL    |       |
| INSTANCE  | varchar(64)  | YES  |      | NULL    |       |
| VALUE     | varchar(64)  | YES  |      | NULL    |       |
| REFERENCE | varchar(64)  | YES  |      | NULL    |       |
| SEVERITY  | varchar(64)  | YES  |      | NULL    |       |
| DETAILS   | varchar(256) | YES  |      | NULL    |       |
+-----------+--------------+------+------+---------+-------+
8 rows in set (0.00 sec)
```

字段解释：

* RULE：诊断规则，由于规则在持续添加，以下列表可能已经过时，最新的规则列表可以通过 `select * from inspection_rules where type='inspection'` 查询
  - `config`：配置一致性检测，如果同一个配置在不同节点配置值不同，会生成 warning 级别的诊断结果
  - `version`：版本一致性检测，如果同一类型的节点版本 `githash` 不同，会生成 critical 级别的诊断结果
  - `current-load`：如果当前系统负载太高，会生成对应的 warning 诊断结果
  - `critical-error`：系统各个模块定义了严重的错误，如果某一个严重错误在对应时间段内超过阈值，会生成 warning 诊断结果
  - `threshold-check`：诊断系统会对大量指标进行阈值判断，如果超过阈值会生成对应的诊断信息
* ITEM：每一个规则会对不同的项进行诊断，这个用来表示对应规则下面的具体诊断项。
* TYPE：诊断的实例类型，可能是 tidb/tikv/pd
* INSTANCE：诊断的具体实例
* VALUE：针对这个诊断项得到的值
* REFERENCE：针对这个诊断项的参考值（阈值），如果 VALUE 和阈值差距比较大，就会产生对应的结果
* SEVERITY：严重程度，warning/critical
* DETAILS：诊断的详细信息，可能包含进一步调查的 SQL 或文档链接

查询已有的诊断规则：

```
mysql> select * from inspection_rules where type='inspection';
+-----------------+------------+---------+
| NAME            | TYPE       | COMMENT |
+-----------------+------------+---------+
| config          | inspection |         |
| version         | inspection |         |
| current-load    | inspection |         |
| critical-error  | inspection |         |
| threshold-check | inspection |         |
+-----------------+------------+---------+
5 rows in set (0.00 sec)
```

## 3. 诊断汇总表

诊断结果需要基于确定性的阈值进行判断，比如当前 Coprocessor 配置的线程池为 8，如果 Coprocessor 的 CPU 使用率达到了 750%，可以确定这里有风险，或者可能提前成为瓶颈。但是部分监控会因为用户的 workload 不同而差异较大，所以难以定义确定的阈值。这部分场景问题排查也非常重要，所以新增了 `information_schema.inspection_summary`  对特定链路或模块的监控汇总，是用户可以根据整个模块或链路的上下文来排查定位问题。

诊断结果表 `information_schema.inspection_summary` 的表结构如下：

```
mysql> desc inspection_summary;
+--------------+-----------------------+------+------+---------+-------+
| Field        | Type                  | Null | Key  | Default | Extra |
+--------------+-----------------------+------+------+---------+-------+
| RULE         | varchar(64)           | YES  |      | NULL    |       |
| INSTANCE     | varchar(64)           | YES  |      | NULL    |       |
| METRICS_NAME | varchar(64)           | YES  |      | NULL    |       |
| LABEL        | varchar(64)           | YES  |      | NULL    |       |
| QUANTILE     | double unsigned       | YES  |      | NULL    |       |
| AVG_VALUE    | double(22,6) unsigned | YES  |      | NULL    |       |
| MIN_VALUE    | double(22,6) unsigned | YES  |      | NULL    |       |
| MAX_VALUE    | double(22,6) unsigned | YES  |      | NULL    |       |
+--------------+-----------------------+------+------+---------+-------+
8 rows in set (0.00 sec)
```

字段解释：

* RULE：汇总规则，由于规则在持续添加，以下列表可能已经过时，最新的规则列表可以通过 `select * from inspection_rules where type='summary'` 查询
* INSTANCE：监控的具体实例
* METRIC_NAME：监控表
* QUANTILE：对于包含 QUANTILE 的监控表有效，可以通过谓词下推指定多个百分位，比如 `select * from inspection_summary where rule='ddl' and quantile in (0.80, 0.90, 0.99, 0.999)` 来汇总 ddl 相关监控，查询百分位为 80/90/99/999 的结果。
AVG_VALUE/MIN_VALUE/MAX_VALUE 分别表示聚合的平均、最小、最大值。

> **注意事项:**
>
> 由于汇总所有结果有一定开销，所以 `information_summary` 中的规则是惰性触发的，即通过 SQL 的谓词中显示指定的 rule 才会运行。比如 `select * from inspection_summary` 语句会得到一个空的结果集。`select * from inspection_summary where rule in ('read-link', 'ddl')` 会汇总读链路和 DDL 相关的监控。

## 4. 诊断时间范围

诊断结果表和诊断监控汇总表都可以通过 hint 的方式指定诊断的时间范围，比如 `select /*+ time_range('2020-03-07 12:00:00','2020-03-07 13:00:00') */ * from inspection_summary` 对`2020-03-07 12:00:00` - `2020-03-07 13:00:00` 时间段的监控汇总。和监控汇总表一样，通过两个不同时间段的数据进行对比，快速发现差异较大的监控项。以下为一个例子：

```sql
mysql> SELECT 
         t1.avg_value / t2.avg_value AS ratio, 
         t1.*, 
         t2.* 
       FROM 
         (
           SELECT 
             /*+ time_range("2020-01-16 16:00:54.933", "2020-01-16 16:10:54.933")*/ * 
           FROM inspection_summary WHERE rule='read-link'
         ) t1 
         JOIN
         (
           SELECT 
             /*+ time_range("2020-01-16 16:10:54.933","2020-01-16 16:20:54.933")*/ *
           FROM inspection_summary WHERE rule='read-link'
         ) t2
         ON t1.metrics_name = t2.metrics_name 
         and t1.instance = t2.instance 
         and t1.label = t2.label 
       ORDER BY 
         ratio DESC;
```
