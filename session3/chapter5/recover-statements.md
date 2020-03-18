# 5.2 利用 Recover/Flashback 命令秒恢复误删表

对于 DBA 来说，删库跑路永远是被调侃的哏，近在眼前的某微商平台的大面积宕机事件给企业管理人员及数据库运维团队带来的启示仍在被不断讨论。当然为了应对大面积的恶意删库跑路行为，可能真的是防不胜防，不过这种情况也非常罕见。但是大家尤其是线上运维 DBA 在维护数据库的过程中，出现删错表/库的情况却是很容易出现的，下面来看一下 TiDB 提供的快速恢复误删表的功能。

## 5.2.1 Recover 实现原理
TiDB 在删除表时，实际上只删除了表的元信息，并将需要删除的表数据（行数据和索引数据）写一条数据到 mysql.gc_delete_range 表。TiDB 后台的 GC Worker 会定期从 mysql.gc_delete_range 表中取出超过 GC lifetime 相关范围的 key 进行删除。

所以，RECOVER TABLE 只需要在 GC Worker 还没删除表数据前，恢复表的元信息并删除 mysql.gc_delete_range 表中相应的行记录就可以了。恢复表的元信息可以用 TiDB 的快照读实现，TiDB 中表的恢复是通过快照读获取表的元信息后，再走一次类似于 CREATE TABLE 的建表流程，所以 RECOVER TABLE 实际上也是一种 DDL。

### 1. 简单实践
MySQL [test]> show tables;

+----------------+

| Tables_in_test |

+----------------+

| t1             |

| t3             |

+----------------+

**2 rows in set (0.00 sec)**

MySQL [test]> create table t2 like t1;

**Query OK, 0 rows affected (0.10 sec)**

MySQL [test]> insert into t2 select * from t1;

**Query OK, 524288 rows affected (17.10 sec)**

**Records: 524288  Duplicates: 0  Warnings: 0**

MySQL [test]> show tables;

+----------------+

| Tables_in_test |

+----------------+

| t1             |

| t2             |

| t3             |

+----------------+

**3 rows in set (0.00 sec)**

我们执行 DDL 删除 t2 表。

MySQL [test]> drop table t2;

**Query OK, 0 rows affected (0.24 sec)**

MySQL [test]> show tables;

+----------------+

| Tables_in_test |

+----------------+

| t1             |

| t3             |

+----------------+

**2 rows in set (0.00 sec)**

MySQL [test]> select * from t2 limit 1;

ERROR 1146 (42S02): Table 'test.t2' doesn't exist

这个时候执行 recover 操作

MySQL [test]> recover table t2;

**Query OK, 0 rows affected (1.17 sec)**

MySQL [test]> show tables;

+----------------+

| Tables_in_test |

+----------------+

| t1             |

| t2             |

| t3             |

+----------------+

**3 rows in set (0.00 sec)**

MySQL [test]> select count(1) from t2;

+----------+

| count(1) |

+----------+

|   524288 |

+----------+

**1 row in set (0.55 sec)**

可以看到table t2 已经回来了。当然根据前面的原理介绍，如果超过 gc 时间，这里就会返回下面错误

MySQL [test]> recover table t2;

ERROR 8055 (HY000): snapshot is older than GC safe point 2020-03-08 15:06:19 +0800 CST


另外还有一种用法，可以通过查询 ddl jobs 队列，指定 job id 的方式来进行恢复。

MySQL [test]> ADMIN SHOW DDL JOBS;

+--------+---------+------------+---------------+--------------+-----------+----------+-----------+-----------------------------------+-----------------------------------+--------+

| JOB_ID | DB_NAME | TABLE_NAME | JOB_TYPE      | SCHEMA_STATE | SCHEMA_ID | TABLE_ID | ROW_COUNT | START_TIME                        | END_TIME                          | STATE  |

+--------+---------+------------+---------------+--------------+-----------+----------+-----------+-----------------------------------+-----------------------------------+--------+

|     73 | test    | t2         | drop table    | none         |         1 |       71 |         0 | 2020-03-08 15:38:47.076 +0800 CST | 2020-03-08 15:38:47.276 +0800 CST | synced |

|     72 | test    | t2         | create table  | public       |         1 |       71 |         0 | 2020-03-08 15:38:37.626 +0800 CST | 2020-03-08 15:38:37.726 +0800 CST | synced |

|     70 | test    | t2         | drop table    | none         |         1 |       66 |         0 | 2020-03-08 15:38:20.576 +0800 CST | 2020-03-08 15:38:20.776 +0800 CST | synced |

从 DDL 记录可以看到，我们一共执行了 2 次 drop table t2 的操作，如果只执行 recover table t2 恢复的是最近一次删除的表。如果我希望恢复前面一次删除的动作，就需要用到下面的命令

MySQL [test]> recover table by job 70;

**Query OK, 0 rows affected (1.15 sec)**


### 2. 使用限制
recover table 的一些使用限制：

* 只能用来恢复误删除表的 DDL 操作，例如 truncate table，delete 操作没有办法恢复。
* 只能在 GC 回收数据之前完成，超过 GC 时间后会报错无法成功恢复。
* 如果在使用 binlog 的情况下，上游执行 recover table 可能会造成非预期的结果，例如下游是 MySQL 数据库，对于这个语法不兼容。上下游的 GC 策略配置不同，再加上复制延迟可能会引起下游的数据在 apply recover table 的时候已经被 GC 了从而导致语句执行失败。
## 5.2.2 Flashback 介绍
Flashback 的原理和 Recover table 比较类似，不过是 recover 的升级版，在覆盖 recover 的所有功能之外，还可以支持 truncate table 的操作，未来也会逐渐取代 recover 命令。下面是简单的使用示例，其他不再累述。

MySQL [test]> show tables;

+----------------+

| Tables_in_test |

+----------------+

| t1             |

| t2             |

| t3             |

+----------------+

**3 rows in set (0.00 sec)**

MySQL [test]> truncate table t2;

**Query OK, 0 rows affected (0.11 sec)**

MySQL [test]> flashback table t2 to t4;

**Query OK, 0 rows affected (1.16 sec)**

MySQL [test]> show tables;

+----------------+

| Tables_in_test |

+----------------+

| t1             |

| t2             |

| t3             |

| t4             |

+----------------+

**4 rows in set (0.00 sec)**

MySQL [test]> select count(1) from t2;

+----------+

| count(1) |

+----------+

|        0 |

+----------+

**1 row in set (0.01 sec)**

MySQL [test]> select count(1) from t4;

+----------+

| count(1) |

+----------+

|   524288 |

+----------+

**1 row in set (0.39 sec)**

需要注意的是，目前 flashback 命令还不支持指定 ddl job id 来恢复表。

