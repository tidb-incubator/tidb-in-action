## 案例1 Delete 涉及数据量过大导致 OOM
```
MySQL [db_stat]> explain delete from t_stat where imp_date<='20200202';
+---------------------+--------------+------+------------------------------------------------------+
| id                  | count        | task | operator info                                        |
+---------------------+--------------+------+------------------------------------------------------+
| TableReader_6       | 220895815.00 | root | data:Selection_5                                     |
| └─Selection_5       | 220895815.00 | cop  | le(db_stat.t_stat.imp_date, "20200202")     |
|   └─TableScan_4     | 220895815.00 | cop  | table:t_stat, range:[-inf,+inf], keep order:false |
+---------------------+--------------+------+------------------------------------------------------+
3 rows in set (0.00 sec)
MySQL [db_stat]> select count(*)  from t_stat where imp_date<='20200202';
+-----------+
| count(*)  |
+-----------+
| 184340473 |
+-----------+
1 row in set (17.88 sec)
```
### 背景
* 大批量清理数据时系统资源消耗高，可能导致 TiDB OOM
### 分析
* imp_date 字段虽然有索引，但是范围扫描的数据量过大，无论是走 IndexScan 还是 Table Scan，Coprocessor 都要处理大量数据
### 影响
* TiKV 节点 Coprocessor CPU 飙高
* 执行 Delete 操作的 TiDB 节点内存飙高，因为要将1.8亿条数据加载 tidb server 内存
### 建议
* 删除数据时，缩小数据筛选范围，或者加上 limit N 每次删除一批数据
* 建议使用 3.0 版本的 Range 分区，按照分区快速删除
## 案例2 执行计划不稳定导致查询延迟增加
```
MySQL [db_stat]> explain SELECT * FROM `tbl_article_check_result` `t` WHERE (articleid = '20190925A0PYT800') ORDER BY checkTime desc LIMIT 100 ;
+--------------------------+----------+------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| id                       | count    | task | operator info                                                                                                                                                                                                                                                                                                                                                                 |
+--------------------------+----------+------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| Projection_7             | 100.00   | root | db_stat.t.type, db_stat.t.articleid, db_stat.t.docid, db_stat.t.version, db_stat.t.checkid, db_stat.t.checkstatus, db_stat.t.seclevel, db_stat.t.t1checkstatus, db_stat.t.t2checkstatus, db_stat.t.mdaichannel, db_stat.t.mdaisubchannel, db_stat.t.checkuser, db_stat.t.checktime, db_stat.t.addtime, db_stat.t.havegot, db_stat.t.checkcode |
| └─Limit_12               | 100.00   | root | offset:0, count:100                                                                                                                                                                                                                                                                                                                                                           |
|   └─IndexLookUp_34       | 100.00   | root |                                                                                                                                                                                                                                                                                                                                                                               |
|     ├─IndexScan_31       | 30755.49 | cop  | table:t, index:checkTime, range:[NULL,+inf], keep order:true, desc                                                                                                                                                                                                                                                                                                            |
|     └─Selection_33       | 100.00   | cop  | eq(db_dayu_1.t.articleid, "20190925A0PYT800")                                                                                                                                                                                                                                                                                                                                 |
|       └─TableScan_32     | 30755.49 | cop  | table:tbl_article_check_result, keep order:false                                                                                                                                                                                                                                                                                                                              |
+--------------------------+----------+------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
6 rows in set (0.00 sec)
```
### 背景
* articleid 和 checkTime 字段分别建有单列索引，正常情况下走 articleid 索引比较快，有时执行计划不稳定走 checkTime 索引，查询延迟达到分钟级别
### 分析
* LIMIT 100 限定了获取 100 条记录，checkTime 和 articleid 列之间存在相关性，如果列之间的相关度不高，在独立性假设失效时，优化器估算走 checkTime 索引并满足 articleid 条件时扫描的行数，可能比走 articleid 索引扫描的行数更少
### 影响
* 业务响应延迟不稳定，偶尔有抖动
### 建议
* 手动 analyze table，配合 crontab 定期 analyze，维持统计信息准确度
* 自动 auto analyze，调低 analyze ratio 阈值，提高收集频次，并设置运行时间窗口
  * set global tidb_auto_analyze_ratio=0.2;
  * set global tidb_auto_analyze_start_time='00:00 +0800';
  * set global tidb_auto_analyze_end_time='06:00 +0800';
* 业务修改 SQL ，使用 force index 固定使用 articleid 列上的索引
* 3.0 版本下，业务不修改 SQL，使用 create binding 创建 force index 的绑定 SQL
## 案例3 查询字段与值的数据类型不匹配
```
MySQL [db_stat]> explain select * from t_like_list where person_id=1535538061143263;
+---------------------+------------+------+-----------------------------------------------------------------------------------+
| id                  | count      | task | operator info                                                                     |
+---------------------+------------+------+-----------------------------------------------------------------------------------+
| Selection_5         | 1430690.40 | root | eq(cast(db_stat.t_like_list.person_id), 1.535538061143263e+15) |
| └─TableReader_7     | 1788363.00 | root | data:TableScan_6                                                                  |
|   └─TableScan_6     | 1788363.00 | cop  | table:t_like_list, range:[-inf,+inf], keep order:false                       |
+---------------------+------------+------+-----------------------------------------------------------------------------------+
3 rows in set (0.00 sec)


MySQL [db_stat]>
```
### 背景
* person_id 列上建有索引且选择性较好，但执行计划走了 TableScan
### 分析
* person_id 是字符串类型，但是存储的值都是数字，业务认为可以直接赋值；而优化器需要在字段上做 cast 类型转换，导致无法使用索引
### 建议
* where 条件加上引号
```
MySQL [db_stat]> explain select * from table:t_like_list where person_id='1535538061143263';
+-------------------+-------+------+----------------------------------------------------------------------------------------------------------+
| id                | count | task | operator info                                                                                            |
+-------------------+-------+------+----------------------------------------------------------------------------------------------------------+
| IndexLookUp_10    | 0.00  | root |                                                                                                          |
| ├─IndexScan_8     | 0.00  | cop  | table:t_like_list, index:person_id, range:["1535538061143263","1535538061143263"], keep order:false |
| └─TableScan_9     | 0.00  | cop  | table:t_like_list, keep order:false                                                                 |
+-------------------+-------+------+----------------------------------------------------------------------------------------------------------+
3 rows in set (0.00 sec)
```
## 案例4 读热点导致的 SQL 延迟增加
### 背景
一个数据量不大(600G左右)读多写少的集群，某段时间发现 query summary 监控中的 duration 显著增加，p99 如下图：


p999 如下图：

![case4_pic1.png](../../res/session4/chapter6/sql_optimization_case/case4_pic1.png)

通过查看监控发现 TiDB 的 KV Duration 变高，KV Errors 仍然很低。其中 KV Request Duration 999 by store 监控是各 TiKV 轮流上涨，如下图：

![case4_pic2.png](../../res/session4/chapter6/sql_optimization_case/case4_pic2.png)

继续查看 TiKV 监控，Coprocessor Overview 如下：

![case4_pic3.png](../../res/session4/chapter6/sql_optimization_case/case4_pic3.png)

![case4_pic_coprosessor.png](../../res/session4/chapter6/sql_optimization_case/case4_pic_coprosessor.png)

Coprocessor CPU 如下：

![case4_coprocessor2.png](../../res/session4/chapter6/sql_optimization_case/case4_coprocessor2.png)


Coprocessor 监控如下：

![case4_pic6.png](../../res/session4/chapter6/sql_optimization_case/case4_pic6.png)

Coprocessor CPU 几乎打满了 CPU。下面开始分析日志，调查 Duration 和 Coprocessor CPU 高的原因。

### 慢查询日志分析
通过 pt-query-digest 工具分析 TiDB 慢查询日志：

```
./pt-query-digest  tidb_slow_query.log  >  result
```
分析 result 发现 Process keys 多的 SQL 并不一定 Process time 也长，二者并不正相关。比如如下 SQL 的 Process keys 为 22.09M，Process time 为 51s：
![case4_pic9.png](../../res/session4/chapter6/sql_optimization_case/case4_pic7.png)

但是如下 SQL 的 Process keys 为 12.68M，而 Process time 为 142353s：

![case4_pic8.png](../../res/session4/chapter6/sql_optimization_case/case4_pic8.png)

过滤 Process time 较多的 SQL，发现了3个典型的 SQL，分析执行计划是否正常：

```
SQL1: select a.a_id, a.b_id,uqm.p_id from a join hsq on a.b_id=hsq.id join uqm on a.a_id=uqm.id;  
```
 

![case4_pic9.png](../../res/session4/chapter6/sql_optimization_case/case4_pic9.png)

```

SQL2: select distinct g.abc, g.def, g.ghi, h.abcd, hi.jq   from ggg g left join ggg_host gh on g.id = gh.ggg_id left join host h on gh.a_id = h.id left join a_jq hi on h.id = hi.hid   where h.abcd is not null and h.abcd  <>  '' and hi.jq is not null and hi.jq  <>  '';

```

![case4_pic10.png](../../res/session4/chapter6/sql_optimization_case/case4_pic10.png)

```

SQL3: select tb1.mt, tb2.name from tb2 left join tb1 on tb2.mtId=tb1.id where tb2.type=0 and (tb1.mt is not null and tb1.mt != '') and (tb2.name is not null or tb2.name != '');
```

![case4_pic12.png](../../res/session4/chapter6/sql_optimization_case/case4_pic12.png)

从执行计划看没有问题，查看表的统计信息也正常，继续分析 TiDB、TiKV日志。

### 一般日志分析
查看日志中标记为 [slow-query] 的日志行中的 region 分布情况：

```
more tikv.log.2019-10-16-06\:28\:13 |grep slow-query |awk -F ']' '{print $1}' | awk  '{print $6}' | sort | uniq -c | sort –n
```
访问频率最大的3个 region 为：
```
	 73 29452
    140 33324
	757 66625
```
这些 region 的访问次数远大于其它 region。之后定位这些 region 所属的表名。
首先查看 [slow-query] 行里的 table_id 记录值和 start_ts 记录值,然后查询 TiDB 日志以获取表名。比如 table_id 为1318，start_ts 为411837294180565013，则：

```
more tidb-2019-10-14T16-40-51.728.log |grep '"/[1318/]"' |grep  411837294180565013
```
过滤后发现是上述慢查询 SQL 涉及到的表。
### 操作优化
尝试对这些 region 做 split 操作，以 66625 为例，需要将 x.x.x.x 替换为实际的 pd 地址：

```
pd-ctl –u http://x.x.x.x:2379 operator add split-region 66625
```
查看 PD 日志如下：
```
[2019/10/16 18:22:56.223 +08:00] [INFO] [operator_controller.go:99] ["operator finish"] [region-id=30796] [operator="\"admin-split-region (kind:admin, region:66625(1668,3), createAt:2019-10-16 18:22:55.888064898 +0800 CST m=+110918.823762963, startAt:2019-10-16 18:22:55.888223469 +0800 CST m=+110918.823921524, currentStep:1, steps:[split region with policy SCAN]) finished\""]
```
说明 region 分裂完成，之后查看是否 region 仍然是热点:	
```
more tikv.log.2019-10-16-06\:28\:13 |grep slow-query  | grep 66625 | more
```
观察一段时间后确认 66625 已不是热点 region，之后继续处理其它的热点 region。
所有热点 region 处理完成后 query summary 监控中的 duration 显著降低：

![case4_pic12.png](../../res/session4/chapter6/sql_optimization_case/case4_pic12.png)

不过只保持了一段时间(19:35 后仍有较高的 duration 出现，下图未列出)：

![case4_pic13.png](../../res/session4/chapter6/sql_optimization_case/case4_pic13.png)

观察压力较重的 tikv，移走热点 region 的 leader：

```
pd-ctl –u http://x.x.x.x:2379 operator add transfer-leader 1 2 //把Region1 的 leader 调度到 Store2
```
leader 迁走之后 ，原 TiKV 的 duration 立刻下降了，但是 leader 所在的 TiKV duration 随之上升(图中展示了一个 TiKV 的变化过程)：
![case4_p95handle_duration.png](../../res/session4/chapter6/sql_optimization_case/case4_p95handle_duration.png)

分析后反复分裂热点 region，之后效果如下：

![case4_region_splict.png](../../res/session4/chapter6/sql_optimization_case/case4_region_splict.png)

### 调优总结
对于分布式数据库读热点的情况，难以通过优化 SQL 本身来解决，需要通过系统分析整个数据库的状态来定位原因，采用分裂 region 的方式来缓解和消除读热点对 SQL 查询效率的影响。读热点实际上限制了分布式数据库的并发读取优势，分裂 region 的方式本质上是恢复分布式数据库的并发读取优势。


## 案例5 SQL 执行计划不准

### 背景

* SQL 执行时间突然变长

### 分析

* SQL 语句：

```
select count(*)
from   tods.bus_jijin_trade_record a, tods.bus_jijin_info b 
where   a.fund_code=b.fund_code  and a.type in   ('PURCHASE','APPLY')  
and   a.status='CANCEL_SUCCESS' and a.pay_confirm_status = 1 
and a.cancel_app_no   is not null and a.id >=    177045000  
and a.updated_at   > date_sub(now(), interval 48 hour) ;
 
执行结果，需要 1 分 3.7s：
mysql> select   count(*)
    -> from tods.bus_jijin_trade_record a,   tods.bus_jijin_info b 
    -> where a.fund_code=b.fund_code  and a.type in ('PURCHASE','APPLY')  
    -> and a.status='CANCEL_SUCCESS' and   a.pay_confirm_status = 1 
    -> and a.cancel_app_no is not null and   a.id >=  177045000  
    -> and a.updated_at >   date_sub(now(), interval 48 hour) ;
+----------+
| count(*) |
+----------+
|      708 |
+----------+
1   row in set (1 min 3.77 sec)
```
 

* 索引信息

| **表名**   | **数据行**   | **索引名**   | 
|:----|:----|:----|
| bus_jijin_trade_record   | 176384036   | PRIMARY   KEY (`ID`)  KEY   `idx_bus_jijin_trade_record_upt` (`UPDATED_AT`)   | 
| bus_jijin_info   | 6442   | PRIMARY   KEY (`ID`)   | 

 

* 查看执行计划

```
mysql> explain 
    -> select count(*)
    -> from tods.bus_jijin_trade_record a,   tods.bus_jijin_info b 
    -> where a.fund_code=b.fund_code  and a.type in ('PURCHASE','APPLY')  
    -> and a.status='CANCEL_SUCCESS' and   a.pay_confirm_status = 1 
    -> and a.cancel_app_no is not null and   a.id >=  177045000  
    -> and a.updated_at >   date_sub(now(), interval 48 hour) ;
+----------------------------+--------------+------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| id                         | count        | task | operator info                                                                                                                                                     |
+----------------------------+--------------+------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| StreamAgg_13               | 1.00         | root | funcs:count(1)                                                                                                                                                    |
| └─HashRightJoin_27         | 421.12       | root | inner join, inner:TableReader_18, equal:[eq(a.fund_code, b.fund_code)]                                                                                            |
|   ├─TableReader_18         | 421.12       | root | data:Selection_17                                                                                                                                                 |
|   │ └─Selection_17         | 421.12       | cop  | eq(a.pay_confirm_status, 1), eq(a.status, "CANCEL_SUCCESS"), gt(a.updated_at, 2020-03-03 22:31:08), in(a.type, "PURCHASE", "APPLY"), not(isnull(a.cancel_app_no)) |
|   │   └─TableScan_16       | 145920790.55 | cop  | table:a, range:[177045000,+inf], keep order:false                                                                                                                 |
|   └─TableReader_37         | 6442.00      | root | data:TableScan_36                                                                                                                                                 |
|     └─TableScan_36         | 6442.00      | cop  | table:b, range:[-inf,+inf], keep order:false                                                                                                                      |
+----------------------------+--------------+------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------+
 
TableScan_16，TableScan_36：表示在 KV 端分别对表 a 和 b 的数据进行扫描，其中 TableScan_16 扫描了 1.46 亿的行数；
Selection_17：表示满足表 a 后面 where 条件的数据
TableReader_37： 由于表   b 没有独立的附加条件，所以直接将这部分数据返回给 tidb；
TableReader_18：将各个   coprocessor 满足 a 表条件的结果返回给 tidb；
HashRightJoin_27：将 TableReader_37   和 TableReader_18   上的结果进行 hash join；
StreamAgg_13：进一步统计所有行数，将数据返回给客户端；
```
 
可以看到语句中 a 表 ( bus_jijin_trade_record ) 的条件 id >=  177045000， 和 updated_at > date_sub(now(), interval 48 hour ) 上，这两个列分别都有索引，但是 tidb 还是选择了全表扫描；

 

按照上面两个条件分别查询数据分区情况

```

mysql> SELECT   COUNT(*) FROM tods.bus_jijin_trade_record WHERE id >=  177045000 ;
+-----------+
| COUNT(*)  |
+-----------+
| 145917327 |
+-----------+
1 row in set (16.86   sec)
 
mysql> SELECT   COUNT(*) FROM tods.bus_jijin_trade_record WHERE updated_at >   date_sub(now(), interval 48 hour)  ;
+-----------+
|  COUNT(*) |
+-----------+
|    713682 |
+-----------+ 
```
可以看到，表 bus_jijin_trade_record 有 1.7 亿的数据量， 应该走 updated_at 字段上的索引；
 

使用强制 hint 进行执行，6.27 秒就执行完成了，**速度从之前 63s 到现在的 6.3s，提升了 10 倍**

```
mysql> select   count(*)
    -> from tods.bus_jijin_trade_record a   use index(idx_bus_jijin_trade_record_upt), tods.bus_jijin_info b 
    -> where a.fund_code=b.fund_code  and a.type in ('PURCHASE','APPLY')  
    -> and a.status='CANCEL_SUCCESS' and   a.pay_confirm_status = 1 
    -> and a.cancel_app_no is not null and   a.id >=  177045000  
    -> and a.updated_at >   date_sub(now(), interval 48 hour) ;
+----------+
| count(*) |
+----------+
|      709 |
+----------+
1 row in set (6.27   sec) 
```
强制 hint 后的执行计划
```
mysql> explain 
    -> select count(*)
    -> from tods.bus_jijin_trade_record a   use index(idx_bus_jijin_trade_record_upt), tods.bus_jijin_info b 
    -> where a.fund_code=b.fund_code  and a.type in ('PURCHASE','APPLY')  
    -> and a.status='CANCEL_SUCCESS' and   a.pay_confirm_status = 1 
    -> and a.cancel_app_no is not null and   a.id >=  177045000  
    -> and a.updated_at >   date_sub(now(), interval 48 hour) ;
+------------------------------+--------------+------+----------------------------------------------------------------------------------------------------------------------------+
| id                           | count        | task | operator info                                                                                                              |
+------------------------------+--------------+------+----------------------------------------------------------------------------------------------------------------------------+
| StreamAgg_13                 | 1.00         | root | funcs:count(1)                                                                                                             |
| └─HashRightJoin_24           | 421.12       | root | inner join, inner:IndexLookUp_20, equal:[eq(a.fund_code, b.fund_code)]                                                     |
|   ├─IndexLookUp_20           | 421.12       | root |                                                                                                                            |
|   │ ├─Selection_18           | 146027634.83 | cop  | ge(a.id, 177045000)                                                                                                        |
|   │ │   └─IndexScan_16       | 176388219.00 | cop  | table:a, index:UPDATED_AT, range:(2020-03-03 23:05:30,+inf], keep order:false                                              |
|   │ └─Selection_19           | 421.12       | cop  | eq(a.pay_confirm_status, 1), eq(a.status, "CANCEL_SUCCESS"), in(a.type, "PURCHASE", "APPLY"), not(isnull(a.cancel_app_no)) |
|   │   └─TableScan_17         | 146027634.83 | cop  |   table:bus_jijin_trade_record, keep order:false                                                                           |
|   └─TableReader_31           | 6442.00      | root | data:TableScan_30                                                                                                          |
|     └─TableScan_30           | 6442.00      | cop  | table:b, range:[-inf,+inf], keep order:false                                                                               |
+------------------------------+--------------+------+----------------------------------------------------------------------------------------------------------------------------+
```
使用 hint 后的执行计划，预估 updated_at 上的索引会扫描 176388219，**索引选择了全表扫描，可以判定是由于错误的统计信息导致执行计划有问题**
 

查看表 bus_jijin_trade_record 上的统计信息

```
mysql> show   stats_meta where table_name like 'bus_jijin_trade_record' and db_name like   'tods';
+---------+------------------------+---------------------+--------------+-----------+
| Db_name | Table_name             | Update_time         | Modify_count | Row_count |
+---------+------------------------+---------------------+--------------+-----------+
| tods    | bus_jijin_trade_record | 2020-03-05 22:04:21 |     10652939 | 176381997 |
+---------+------------------------+---------------------+--------------+-----------+
 
 
mysql> show   stats_healthy  where table_name like   'bus_jijin_trade_record' and db_name like 'tods';
+---------+------------------------+---------+
| Db_name | Table_name             | Healthy |
+---------+------------------------+---------+
| tods    | bus_jijin_trade_record |      93 |
+---------+------------------------+---------+
```
根据统计信息，表 bus_jijin_trade_record 有 176381997，修改的行数有 10652939，

该表的健康度为：(176381997-10652939)/176381997 *100=93

 
### 解决
* 重新收集统计信息

```

mysql> set   tidb_build_stats_concurrency=10;
Query OK, 0 rows   affected (0.00 sec)
#调整收集统计信息的并发度，以便快速对统计信息进行收集 
mysql> analyze   table tods.bus_jijin_trade_record;
Query OK, 0 rows   affected (3 min 48.74 sec) 
```
* 查看没有使用 hint 语句的执行计划
```
mysql> explain   select count(*)
    -> from tods.bus_jijin_trade_record a,   tods.bus_jijin_info b 
    -> where a.fund_code=b.fund_code  and a.type in ('PURCHASE','APPLY')  
    -> and a.status='CANCEL_SUCCESS' and   a.pay_confirm_status = 1 
    -> and a.cancel_app_no is not null and   a.id >=  177045000  
    -> and a.updated_at >   date_sub(now(), interval 48 hour) ;;
+------------------------------+-----------+------+----------------------------------------------------------------------------------------------------------------------------+
| id                           | count     | task | operator info                                                                                                              |
+------------------------------+-----------+------+----------------------------------------------------------------------------------------------------------------------------+
| StreamAgg_13                 | 1.00      | root | funcs:count(1)                                                                                                             |
| └─HashRightJoin_27           | 1.99      | root | inner join, inner:IndexLookUp_23, equal:[eq(a.fund_code, b.fund_code)]                                                     |
|   ├─IndexLookUp_23           | 1.99      | root |                                                                                                                            |
|   │ ├─Selection_21           | 626859.65 | cop  | ge(a.id, 177045000)                                                                                                        |
|   │ │   └─IndexScan_19       | 757743.08 | cop  | table:a, index:UPDATED_AT, range:(2020-03-03 23:28:14,+inf], keep order:false                                              |
|   │ └─Selection_22           | 1.99      | cop  | eq(a.pay_confirm_status, 1), eq(a.status, "CANCEL_SUCCESS"), in(a.type, "PURCHASE", "APPLY"), not(isnull(a.cancel_app_no)) |
|   │   └─TableScan_20         | 626859.65 | cop  | table:bus_jijin_trade_record, keep order:false                                                                             |
|   └─TableReader_37           | 6442.00   | root | data:TableScan_36                                                                                                          |
|     └─TableScan_36           | 6442.00   | cop  | table:b, range:[-inf,+inf], keep order:false                                                                               |
+------------------------------+-----------+------+----------------------------------------------------------------------------------------------------------------------------+
9 rows in set (0.00   sec)
```
可以看到，**收集完统计信息后，现在的执行计划走了索引扫描，与手动添加 hint 的行为一致，且扫描的行数 757743 符合预期；**

 

**此时执行时间变为 1.69s ，在执行计划没变的情况下，应该是由于缓存命中率上升带来的提升。**

```
mysql> select   count(*)
    -> from tods.bus_jijin_trade_record a,   tods.bus_jijin_info b 
    -> where a.fund_code=b.fund_code  and a.type in ('PURCHASE','APPLY')  
    -> and a.status='CANCEL_SUCCESS' and   a.pay_confirm_status = 1 
    -> and a.cancel_app_no is not null and   a.id >=  177045000  
    -> and a.updated_at >   date_sub(now(), interval 48 hour) ;
+----------+
| count(*) |
+----------+
|      712 |
+----------+
1 row in set (1.69   sec) 
```

### 总结
可以看出该 SQL 执行效率变差是由于统计信息不准确造成的，在通过收集统计信息之后得到了正确的执行计划。

从最终结果 712 行记录来看，创建联合索引可以更大的降低扫描数据的量，更进一步提升性能。在性能已经满足业务要求情况下，联合索引会有额外的成本，留待以后尝试。

