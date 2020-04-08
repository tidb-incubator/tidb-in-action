## 3.7 Statement Summary
在 2.2 节中，介绍过 TiDB Dashboard 中的 Statements 页面，本章节主要介绍 Statements 页面使用到的 Statement Summary 系统表。
### 3.7.1 Statement Summary 是什么
首先来对 Statement Summary 做个简单介绍。如果你用过其他产品，你可能听说过 "Dynamic Performance Views" "Profile Tables" "SQL Audit" 等功能。它们的本质都一样，通过系统表的形式，把 SQL 的性能指标暴露给用户，可以定位性能问题、排查原因。

为了补足现有工具在排查 SQL 性能方面的空缺，TiDB 4.0 提供了 [Statement Summary Tables](https://pingcap.com/docs-cn/stable/reference/performance/statement-summary/)，这个名字从 MySQL 继承而来。

简单来说，Statement Summary 把相似的 SQL 和执行计划汇总到一组，然后统计每一组的各项性能指标。我们只需要查询系统表，TiDB 就可以把这些指标输出。

#### 3.7.1.1 什么是 “相似的 SQL 和执行计划”
我们要排查的经常不是一条 SQL，而是一类 SQL。比如有这样两条 SQL：

```sql
select * from `order` where item_id=1000;

SELECT * 
FROM `order`
WHERE item_id=1001;
```

可以看到两条 SQL 虽然大小写、常量、空白符都不一样，但语法完全一样，那么它们就是同类的 SQL。通过把同类的 SQL 归到一组，我们就可以排查这一类的性能问题了。

但是同类的 SQL 也会生成不同的执行计划，执行计划不同也可能导致性能问题。为了排查这种问题，还要把类型相似、执行计划不同的 SQL 归到不同的组。

还是上面的例子，可能生成 IndexLookup，也可能生成 TableScan。通过把它们归到不同的组，就可以比较各种执行计划下的运行耗时了。

#### 3.7.1.2 有哪些监控指标
为了尽可能地排查出原因，TiDB 在这些系统表中定义了很多字段。截止 4.0 版本，共有 60 多项指标。总共分为几类：
* 基本信息：查询语句、原 SQL 语句、执行计划等等。
* TiDB 上的执行数据：总次数、平均延时、平均内存等等。
* TiKV 上的执行数据：CopTask 数量、平均耗时、扫描行数等等。
* 事务相关：写入的数据量、重试次数等等。

可以看到，这些指标与 slow log 非常相似，但几乎每种指标都有最大值、平均值两项，方便排除执行时间不稳定等因素。

试着运行一下：

```
mysql> select * from events_statements_summary_by_digest limit 1\G
*************************** 1. row ***************************
       SUMMARY_BEGIN_TIME: 2020-03-04 13:00:00
         SUMMARY_END_TIME: 2020-03-04 13:30:00
                STMT_TYPE: select
              SCHEMA_NAME: test
                   DIGEST: d8cc0047ec3514d418e6f425d6203966de0094f025dab14babab8f4db0947736
              DIGEST_TEXT: select buyer_id , item_id from order where order_id = ?
              TABLE_NAMES: test.order
              INDEX_NAMES: NULL
              SAMPLE_USER: root
               EXEC_COUNT: 8
              SUM_LATENCY: 2591978
              MAX_LATENCY: 1345860
              MIN_LATENCY: 135860
              AVG_LATENCY: 323997
        AVG_PARSE_LATENCY: 69993
        MAX_PARSE_LATENCY: 78761
      AVG_COMPILE_LATENCY: 137604
      MAX_COMPILE_LATENCY: 881880
………
                  AVG_MEM: 0
                  MAX_MEM: 0
        AVG_AFFECTED_ROWS: 0
               FIRST_SEEN: 2020-03-04 13:20:55
                LAST_SEEN: 2020-03-04 13:21:24
        QUERY_SAMPLE_TEXT: select buyer_id, item_id from `order` where order_id=1001221
         PREV_SAMPLE_TEXT:
              PLAN_DIGEST: 28ccfb38e96b6e4eaab31e82d12f349eb4edcb97bed3be49cb3f73051f2cd9d2
                     PLAN: 	Point_Get_1	root	1	table:order, handle:1001221
1 row in set (0.00 sec)
```

#### 3.7.1.3 数据如何刷新
通常我们在排查问题时，问题是最近才出现的。为了查看最近的监控指标，`events_statements_summary_by_digest` 会定时清空，默认半小时清空一次。这样，我们查看这张表时，总是查看到最新的数据。

但是即使我们看到了最新的指标，也并不知道算不算正常。为了与历史的时间段进行比较，TiDB 还新增了一张历史表 `events_statements_summary_by_digest_history` ，它存放着从 `events_statements_summary_by_digest` 清掉的历史数据。通过指定 `SUMMARY_BEGIN_TIME` 和 `SUMMARY_END_TIME` 两个字段的值，可以查看特定时间段的指标。

但是历史表也是内存表，所以有数量限制，默认只保存 24 段历史。

### 3.7.2 使用示例
相比于用图形化界面来呈现结果，查询系统表也有它独特的优势：通过借助 SQL 强大的语言表达能力，我们可以挖掘更有价值的内容。下面通过几个案例，演示如何使用 Statement Summary 来排查性能问题。

#### 3.7.2.1 案例一
业务更新后，发现某条 SQL 延时上升到了 10ms，但是 Grafana 上没有异常，如何判定是客户端问题还是服务端问题呢？

可以用 `QUERY_SAMPLE_TEXT` 进行模糊查询：

```
mysql> select avg_latency, query_sample_text from events_statements_summary_by_digest where QUERY_SAMPLE_TEXT LIKE 'select buyer_id, item_id from `order`%'\G
*************************** 1. row ***************************
      avg_latency: 202225
query_sample_text: select buyer_id, item_id from `order` where order_id=1001221
1 row in set (0.00 sec)
```

上面看到 `avg_latency` 是 0.2ms，远低于 10ms，说明服务端没有问题，继而排查网络或客户端问题。

#### 3.7.2.2 案例二
业务监控显示凌晨三点整个业务的延时出现了波动，怎么看当时耗时最高的几条 SQL 呢？

```
mysql> select sum_latency, query_sample_text, digest
    ->     from events_statements_summary_by_digest
    ->     where summary_begin_time='2020-3-1 3:00:00'
    ->     order by sum_latency desc limit 3\G
*************************** 1. row ***************************
      sum_latency: 120663574508
query_sample_text: select buyer_id, item_id from `order` where order_id=1001221
           digest: d8cc0047ec3514d418e6f425d6203966de0094f025dab14babab8f4db0947736
*************************** 2. row ***************************
      sum_latency: 97252462621
query_sample_text: select count(1) from item
           digest: 1626b9d694faefc4e88ae9fd5e8917e85ed26fe62dbe781eb65edad3aa939ae8
*************************** 3. row ***************************
      sum_latency: 65914323442
query_sample_text: select count(1) from buyer
           digest: b07c73323c511d3c18407771adb8aec865c0409f4e9a4f53baedc409fd5a1cd0
3 rows in set (0.00 sec)
```

可以看到这几条 SQL 的总耗时最高，可以继续排查它们的其他指标。

`digest`  是这类 SQL 的唯一 ID，所以之后的语句，可以带上 `digest` 来过滤，不需要再用模糊查询了。

#### 3.7.2.3 案例三
有条 SQL 上午 10 点还是好的，下午 2 点明显变慢了。我怎么知道它是哪里变慢了呢？

可以比较这条 SQL 在两个时间段各项指标的差异：

```
mysql> select abnormal.avg_latency/normal.avg_latency,
    -> abnormal.avg_process_time/normal.avg_process_time,
    -> abnormal.avg_total_keys/normal.avg_total_keys,
    -> abnormal.avg_wait_time/normal.avg_wait_time
    -> from events_statements_summary_by_digest_history abnormal,
    -> events_statements_summary_by_digest_history normal
    -> where normal.summary_begin_time='2020-3-1 10:00:00'
    -> and abnormal.summary_begin_time='2020-3-1 14:00:00'
    -> and abnormal.digest=normal.digest
    -> and normal.digest = 'd8cc0047ec3514d418e6f425d6203966de0094f025dab14babab8f4db0947736'\G
*************************** 1. row ***************************
          abnormal.avg_latency/normal.avg_latency: 6.3433
abnormal.avg_process_time/normal.avg_process_time: 8.9993
    abnormal.avg_total_keys/normal.avg_total_keys: 12.6666
      abnormal.avg_wait_time/normal.avg_wait_time: 0.9883
1 row in set, 1 warning (0.00 sec)
```

上面看到，平均扫描行数（`avg_total_keys`）变大了，导致 TiKV 上的处理时间（`avg_process_time`）变长了。所以需要接着排查为什么扫描行数变大。可能是执行计划、表的数据量、过滤条件、TiKV 的 GC 周期等因素。

### 3.7.3 配置项
上面介绍了一些使用案例，但是实际场景中，往往需要修改各类配置。下面是与 Statement Summary 相关的配置：
* `tidb_enable_stmt_summary`：打开或关闭该功能
* `tidb_stmt_summary_refresh_interval`：监控指标的刷新周期
* `tidb_stmt_summary_history_size`：历史表保存的历史数量
* `max-stmt-count`：保存的 SQL 的种类数量
* `max-sql-length`：显示的 SQL 的最大长度

更具体的使用方法及细节，参照[文档](https://pingcap.com/docs-cn/stable/reference/performance/statement-summary/#%E5%8F%82%E6%95%B0%E9%85%8D%E7%BD%AE)。

### 3.7.4 FAQ
介绍了如何使用 Statement Summary，接下来对常见问题做一下说明。
#### 3.7.4.1 配置越大越好吗？
Q：我想查看尽可能多的 SQL、保存的历史尽可能多，可以把 `tidb_stmt_summary_history_size` 和 `max-stmt-count` 改成非常大吗？

A：因为 Statement Summary Tables 是内存表，把配置项改得过大，会占用更多的内存。所以不是越大越好，需要根据每台 TiDB server 的物理内存、实际需求而定。

#### 3.7.4.2 显示 commit 语句慢了，怎么查呢？
Q：因为 TiDB 是乐观事务，只有在 commit 时才写数据，导致经常看到 commit 语句慢了，我要怎么确认是哪个事务呢？

A：这种情况确实不好处理。目前的做法是按 commit 的前一个语句进行分类，也就是按 `prev_sample_text` 的 digest 来把 commit 分到不同的组中。这基于一个假设：commit 的前一条语句相同，就算同一类事务。

#### 3.7.4.3 `schema_name` 为什么总是空的？
Q：SQL 里明明有表名，但 `schema_name` 这个字段却是空的，怎么回事？

A：这里的 `schema_name` 并不是该语句涉及的所有 schema，而是执行当前语句时所在的 schema（例如执行 `use db` 之后的 db 的名字）。因为 `table_names` 里表名的格式是 "{schema}.{table}"，要根据 schema 过滤，就要在 `table_names` 里用正则表达式匹配。

#### 3.7.4.4 这个功能有性能影响吗？
Q：Statement Summary 看起来要统计所有 SQL，会有性能影响吗？

A：凡事都有弊端，该功能也一样。Sysbench 的结果表明几乎没有性能下降，但是 TPCC 有 2% 的性能下降。但是 TiDB 认为这个功能带来的价值要大于 2% 的性能影响，所以在 4.0 中默认打开。
