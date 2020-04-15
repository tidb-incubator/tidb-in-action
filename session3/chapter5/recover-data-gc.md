## 5.1 利用 GC 快照读恢复数据

当遇到数据被误更新或误删除的情况，很多人想到的是 Oracle 的闪回或者 MySQL 的基于 binlog 实现的闪回工具。作为 NewSQL 的佼佼者，TiDB 可以直接通过标准 SQL 读取历史数据，无需特殊的 client 或者 driver。即使在更新/删除数据后，表结构发生了变化，TiDB 依旧能够按照旧的表结构定义将数据读取出来。

## 5.1.1 历史数据保留策略

TiDB 事务的实现采用了 MVCC（多版本并发控制）机制，当更新/删除数据时，不会做真正的数据删除，只会添加一个新版本数据，并以时间戳来区分版本。当然历史数据不会永久保留，超过一定时间的历史数据将会被彻底删除，以减小空间占用，同时避免因历史版本过多引起的性能开销。


TiDB 使用周期性运行的 GC（Garbage Collection，垃圾回收）来进行清理，默认情况下每 10 分钟一次。每次 GC 时，TiDB 会计算一个称为 safe point 的时间戳（默认为上次运行 GC 的时间减去 10 分钟），接下来 TiDB 会在保证在 safe point 之后的快照都能够读取到正确数据的前提下，删除更早的过期数据。

TiDB 的 GC 相关的配置存储于 mysql.tidb 系统表中，可以通过 SQL 语句对这些参数进行查询和更改：

```
select VARIABLE_NAME, VARIABLE_VALUE from mysql.tidb where VARIABLE_NAME like 'tikv_gc%';

+--------------------------+----------------------------------------------------------------------------------------------------+
| VARIABLE_NAME            | VARIABLE_VALUE                                                                                     |
+--------------------------+----------------------------------------------------------------------------------------------------+
| tikv_gc_leader_uuid      | 5afd54a0ea40005                                                                                    |
| tikv_gc_leader_desc      | host:tidb-cluster-tidb-0, pid:215, start at 2019-07-15 11:09:14.029668932 +0000 UTC m=+0.463731223 |
| tikv_gc_leader_lease     | 20190715-12:12:14 +0000                                                                            |
| tikv_gc_enable           | true                                                                                               |
| tikv_gc_run_interval     | 10m0s                                                                                              |
| tikv_gc_life_time        | 10m0s                                                                                              |
| tikv_gc_last_run_time    | 20190715-12:09:14 +0000                                                                            |
| tikv_gc_safe_point       | 20190715-11:59:14 +0000                                                                            |
| tikv_gc_auto_concurrency | true                                                                                               |
| tikv_gc_mode             | distributed                                                                                        |
+--------------------------+----------------------------------------------------------------------------------------------------+
13 rows in set (0.00 sec)                                                                                      
```

例如，如果需要将 GC 调整为保留最近一天以内的数据，只需执行下列语句即可：

```
update mysql.tidb set VARIABLE_VALUE="24h" where VARIABLE_NAME="tikv_gc_life_time";
```

> **注意：** mysql.tidb系统表中除了下文将要列出的 GC 的配置外，还包含一些 TiDB 用于储存部分集群状态（包括 GC 状态）的记录。请勿手动更改这些记录。其中，与 GC 有关的记录如下：
>
> **.** tikv_gc_leader_uuid，tikv_gc_leader_desc 和 tikv_gc_leader_lease 用于记录 GC leader 的状态
>
> **.** tikv_gc_last_run_time：上次 GC 运行时间
>
> **.** tikv_gc_safe_point：当前 GC 的 safe point
>
> **.** tikv_gc_life_time: 用于配置历史版本保留时间，可以手动修改
>
> **.** tikv_gc_safe_point: 记录了当前的 safe point，用户可以安全地使用大于 safe point 的时间戳创建 Snapshot 读取历史版本。safe point 在每次 GC 开始运行时自动更新。

## 5.1.2 查询历史数据

读取历史版本数据前，需设定一个系统变量: tidb_snapshot ，这个变量是 Session 范围有效级别，可以通过标准的 Set 语句修改其值。其值可以是 TSO 或日期时间。TSO 是全局授时的时间戳，是从 PD 端获取的; 日期时间的格式可以为： “2016-10-08 16:45:26.999”，一般来说可以只写到秒，比如”2016-10-08 16:45:26”。 当这个变量被设置后，TiDB 会用这个时间戳建立 Snapshot（没有开销，只是创建数据结构），之后所有的查询操作都会在这个 Snapshot 上读取数据。

> **注意:** TiDB 的事务是通过 PD 进行全局授时，所以存储的数据版本也是以 PD 所授时间戳作为版本号。在生成 Snapshot 时，是以 tidb_snapshot 变量的值作为版本号，如果 TiDB Server 所在机器和 PD Server 所在机器的本地时间相差较大，需要以 PD 的时间为准。

当读取历史版本数据操作结束后，可以结束当前 Session 或者是通过 Set 语句将 tidb_snapshot 变量的值设为 “"，即可读取最新版本的数据。

## 5.1.3 查询历史数据示例：

1.初始化阶段，创建一个表，并插入几行数据：

```
create table t (c int);
Query OK, 0 rows affected (0.01 sec)

insert into t values (1), (2), (3);
Query OK, 3 rows affected (0.00 sec)
```

2.查看表中的数据：

```
select * from t;
+------+
| c    |
+------+
|    1 |
|    2 |
|    3 |
+------+
3 rows in set (0.00 sec)
```

3.查看当前时间：

```
select now();
+---------------------+
| now()               |
+---------------------+
| 2016-10-08 16:45:26 |
+---------------------+
1 row in set (0.00 sec)
```

4.更新某一行数据：

```
update t set c=22 where c=2;
Query OK, 1 row affected (0.00 sec)
```

5.确认数据已经被更新：

```
select * from t;
+------+
| c    |
+------+
|    1 |
|   22 |
|    3 |
+------+
3 rows in set (0.00 sec)
```

6.设置一个特殊的环境变量，这个是一个 session scope 的变量，其意义为读取这个时间之前的最新的一个版本。

```
set @@tidb_snapshot="2016-10-08 16:45:26";
Query OK, 0 rows affected (0.00 sec)
```

> **注意：** 这里的时间设置的是 update 语句之前的那个时间。在 tidb_snapshot 前须使用 @@ 而非 @，因为 @@ 表示系统变量，@ 表示用户变量。

这里读取到的内容即为 update 之前的内容，也就是历史版本：

```
select * from t;
+------+
| c    |
+------+
|    1 |
|    2 |
|    3 |
+------+
3 rows in set (0.00 sec)
```

7.清空这个变量后，即可读取最新版本数据：

```
set @@tidb_snapshot="";
Query OK, 0 rows affected (0.00 sec)

select * from t;
+------+
| c    |
+------+
|    1 |
|   22 |
|    3 |
+------+
3 rows in set (0.00 sec)
```

> **注意：** 在 tidb_snapshot 前须使用 @@ 而非 @，因为 @@ 表示系统变量，@ 表示用户变量。

## 5.1.4 恢复被更新/删除的数据

通过读取历史数据可以快速恢复被更新/删除的数据，大致步骤如下：

> **注意：** 此方法仅适用变化的数据量较少的情况，进行恢复时需要调整gc的生命周期。


1、调整 GC 保留时间，如将 GC 调整为保留最近一天以内的数据。

```
update mysql.tidb set VARIABLE_VALUE="24h" where VARIABLE_NAME="tikv_gc_life_time";
```

> **说明：** 具体保留多长时间，需要结合业务进行评估


2、创建一个与待恢复的数据表同结构的临时表，如：

```
set @@tidb_snapshot="2016-10-08 16:45:26";
create table t_20161008 like t;
```

3、按照业务逻辑将需要的数据插入到临时表：

```
insert into t_20161008 select * from t where c=2;
```

4、按照业务逻辑将数据从临时表反更新或插入到原表

5、按照业务逻辑校验数据

6、将 GC 保留时长调整为恢复之前的设置

```
update mysql.tidb set VARIABLE_VALUE="10m0s" where VARIABLE_NAME="tikv_gc_life_time"
```

7、根据需要删除临时表
