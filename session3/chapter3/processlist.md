# 3.6 processlist 

processlist 用来查看 TiDB 服务器当前的会话信息。

## 3.6.1 查看 processlist 的方式
可以用以下 3 种方式查看 processlist 信息：

### 1. 执行 SQL: `SHOW [FULL] PROCESSLIST`
此语句可以查看当前 TiDB 服务器节点的会话信息。 下面给出一个实际的例子：

```sql
SHOW FULL PROCESSLIST;
```

```result
+------+--------+-----------+--------+-----------+--------+---------+-----------------------+
| Id   | User   | Host      | db     | Command   | Time   | State   | Info                  |
|------+--------+-----------+--------+-----------+--------+---------+-----------------------|
| 1    | root   | 127.0.0.1 | <null> | Sleep     | 127    | 2       | <null>                |
| 3    | root   | 127.0.0.1 | <null> | Sleep     | 75     | 2       | <null>                |
| 5    | root   | 127.0.0.1 | <null> | Query     | 0      | 2       | show full processlist |
+------+--------+-----------+--------+-----------+--------+---------+-----------------------+
```

输出字段含义说明如下：

* Id：连接 TiDB 服务器会话的唯一标识，可以通过 `KILL TiDB {ID}` 来终止同一服务器上会话 Id 的连接。
* User：当前会话的用户。
* Host：会话客户端的主机名。
* db：会话连接的数据库，如果没有则为 null。
* Command：会话正在执行的命令类型，一般是休眠（Sleep），查询（Query）。
* Time：会话处于当前状态的时间（以秒为单位）。
* State：显示当前sql语句的状态，比如：Sending data，Sorting for group，Creating tmp table，Locked 等等。
* Info：会话正在执行的语句，为 NULL 时表示没有在执行任何语句。

这里需要注意的是，如果不指定可选关键字 `FULL`，输出文本会被截断。


### 2. 查询系统表 `INFORMATION_SCHEMA.PROCESSLIST`
这种方式和第一种方式输出结果类似，不同点在于查询结果会比 `show processlist` 多 `MEM` 和 `TxnStart`列。这两列具体含义如下：

	* `MEM`：指正在处理的请求已使用的内存，单位是 byte。（从 v3.0.5 开始引入）
	* `TxnStart`：指当前处理请求的事务开始的时间戳。（从 v4.0.0 开始引入） 

下面是一个实际的例子：

```sql
select * 
from information_schema.processlist 
where command != 'Sleep' 
order by time desc\G
```
```result
*************************** 1. row ***************************
      ID: 1
    USER: root
    HOST: 172.16.5.169
      DB: NULL
 COMMAND: Query
    TIME: 0
   STATE: 2
    INFO: select * from information_schema.processlist where command != 'Sleep' order by time desc
     MEM: 4588
TxnStart:
1 row in set (0.00 sec)
```

### 3.  查询系统表`INFORMATION_SCHEMA.CLUSTER_PROCESSLIST`
查询 TiDB 的 `INFORMATION_SCHEMA.PROCESSLIST` 系统表时，用户一定会遇到的问题是：此表只包含了当前 TiDB 节点的数据，而不是所有节点的数据。为了解决这个问题，TiDB 4.0 中新增了 `INFORMATION_SCHEMA.CLUSTER_PROCESSLIST` 系统表，用来查询 **所有** TiDB 节点的 `PROCESSLIST` 数据。其使用方式和 `PROCESSLIST` 一致。`CLUSTER_PROCESSLIST` 表比 `PROCESSLIST` 多一个 `INSTANCE` 列，用来表示该条数据属于哪一个 TiDB 节点。具体示例如下：

```sql
SELECT * FROM INFORMATION_SCHEMA.CLUSTER_PROCESSLIST\G
```
```result
*************************** 1. row ***************************
INSTANCE: 172.16.4.235:10070
      ID: 1
    USER: root
    HOST: 172.16.5.169
      DB: NULL
 COMMAND: Query
    TIME: 0
   STATE: 2
    INFO: SELECT * FROM INFORMATION_SCHEMA.CLUSTER_PROCESSLIST
     MEM: 0
TxnStart: 04-12 16:51:39.735(415939035066531841)
*************************** 2. row ***************************
INSTANCE: 172.16.5.189:10070
      ID: 1
    USER: root
    HOST: 172.16.5.169
      DB: NULL
 COMMAND: Sleep
    TIME: 6
   STATE: 2
    INFO: NULL
     MEM: 0
TxnStart:
2 rows in set (0.00 sec)
```

> 注意:
> 只有 root 或者具有 `ProcessPriv` 权限的 User 能看到所有的会话信息，其他 User 只能看到和自己同一 User 的会话信息。

## 3.6.2 KILL [TIDB]

`KILL TIDB` 语句用于终止当前 TiDB 服务器中某个会话的连接。

### KILL 语句的兼容性

TiDB 中 KILL xxx 的行为和 MySQL 不相同。在 TiDB 中，需要加上 TIDB 关键词，即 KILL TIDB xxx。但是在 TiDB 的配置文件中设置 `compatible-kill-query = true` 后，则不需要加上 TIDB 关键词。

### KILL 语句兼容性的设计考量

当用户按下 Ctrl+C 时，MySQL 命令行客户端的默认行为是：创建与后台的新连接，并在该新连接中执行 KILL 语句。然而 TiDB 是一个分布式数据库，一个集群可能部署了多个 TiDB 实例。如果负载均衡器或代理已将该新连接发送到与原始会话不同的 TiDB 服务器实例，则该错误会话可能被终止，从而导致使用 TiDB 集群的业务中断。只有当您确定在 KILL 语句中引用的连接正好位于 KILL 语句发送到的服务器上时，才可以启用 compatible-kill-query。因此如果正尝试终止的会话位于同一个 TiDB 服务器上，可在配置文件里设置 `compatible-kill-query = true`。

### KILL 示例

```sql
SHOW PROCESSLIST;
```

```result
+------+--------+-----------+--------+-----------+--------+---------+-----------------------+
| Id   | User   | Host      | db     | Command   | Time   | State   | Info                  |
|------+--------+-----------+--------+-----------+--------+---------+-----------------------|
| 5    | root   | 127.0.0.1 | <null> | Query     | 0      | 2       | show full processlist |
+------+--------+-----------+--------+-----------+--------+---------+-----------------------+
```

```sql
KILL TIDB 5;
```

```result
Query OK, 0 rows affected (0.00 sec)
```

再次查看，可以发现 ID 为 5 的 查询已经被 kill 掉了。

## 3.6.3 示例：利用 INFORMATION_SCHEMA.PROCESSLIST 定位问题查询

通过执行`show full processlist` 可以看到所有连接的情况，但是大多连接的 `state` 其实是 `Sleep` 的。这种连接其实处于空闲状态，没有太多查看价值。
我们要观察的是有问题的连接，可以使用 `select` 查询对 `PROCESSLIST` 系统表进行过滤：

```sql
-- 查询非 Sleep 状态的链接，按消耗时间倒序展示，加条件过滤
select *
from information_schema.processlist
where command != 'Sleep'
order by time desc \G
```

这样就过滤出来哪些是正在运行的连接。之后再按照消耗时间倒序展示，排在最前面的，极大可能就是有问题的连接了。最后，通过查看 info 一列，我们就能看到具体执行的什么 SQL 语句了。

```result
*************************** 1. row ***************************
      ID: 1
    USER: root
    HOST: 172.16.5.169
      DB: NULL
 COMMAND: Query
    TIME: 0
   STATE: 2
    INFO: select *
from information_schema.processlist
where command != 'Sleep'
order by time desc
     MEM: 4588
TxnStart:
1 row in set (0.00 sec)
```

找出运行较长的 SQL 后，我们可以通过运行 `EXPLAIN ANALYZE` 语句获得一个 SQL 语句执行过程中的一些具体信息。关于 `EXPLAIN ANALYZE` 的具体使用，可查看 [使用 EXPLAIN 来优化 SQL 语句](https://pingcap.com/docs-cn/stable/reference/performance/understanding-the-query-execution-plan/#%E4%BD%BF%E7%94%A8-explain-%E6%9D%A5%E4%BC%98%E5%8C%96-sql-%E8%AF%AD%E5%8F%A5)

当 TiDB 节点内存不足时，可以用同样方式过滤出消耗内存最多的 10 条运行中的命令在具体执行的什么 SQL 语句。

```sql
-- 查询非 Sleep 状态的链接，按消耗内存展示其 top10
select *
from information_schema.processlist
where command != 'Sleep'
order by mem desc
limit 10 \G
```

```result
*************************** 1. row ***************************
      ID: 1
    USER: root
    HOST: 172.16.5.169
      DB: NULL
 COMMAND: Query
    TIME: 0
   STATE: 2
    INFO: select *
from information_schema.processlist
where command != 'Sleep'
order by mem desc
limit 10
     MEM: 4588
TxnStart:
1 row in set (0.00 sec)
```

找出内存消耗较多的 SQL 后，同样可以通过运行 `EXPLAIN ANALYZE` 语来获具体 SQL 执行信息。

我们可以根据 command 和 time 条件找出有问题的执行语句，并根据其 ID 将其 kill 掉。如果觉得一个个 ID 来 kill 太慢，还可以通过 concat() 内置函数来实现快速 kill

```sql
-- 查询执行时间超过2分钟，且非 sleep 的会话，然后拼接成 kill 语句
select concat('kill ', 'TiDB', id, ';')
from information_schema.processlist
where command != 'Sleep'
and time > 2*60
order by time desc
```

```sql
-- 然后再来查看执行时间超过2分钟，且非 sleep 的会话，发现已经全部被 kill 了
select *
from information_schema.processlist
where command != 'Sleep'
and time > 2*60
order by time desc
```

输出样例：

```result
+------+--------+--------+------+-----------+--------+---------+--------+-------+------------+
| ID   | USER   | HOST   | DB   | COMMAND   | TIME   | STATE   | INFO   | MEM   | TxnStart   |
|------+--------+--------+------+-----------+--------+---------+--------+-------+------------|
+------+--------+--------+------+-----------+--------+---------+--------+-------+------------+
```

## 3.6.4 示例：利用 INFORMATION_SCHEMA.CLUSTER_PROCESSLIST 定位问题查询

下面一个例子演示了如何利用`INFORMATION_SCHEMA.CLUSTER_PROCESSLIST`查询集群各个 TiDB 节点的运行时间超过2分钟的会话数量：

```sql
select instance, count(*)
from INFORMATION_SCHEMA.CLUSTER_PROCESSLIST
where command != 'Sleep'
and time > 2*60
group by instance;
```

输出样例：

```result
+---------------+----------+
| instance      | count(*) |
+---------------+----------+
| 0.0.0.0:10081 | 1        |
| 0.0.0.0:10080 | 3        |
+---------------+----------+
```

如果某个节点的长时间运行会话较多，可以进一步查看该节点的具体会话情况，并结合 `EXPLAIN ANALYZE` 分析具体 SQL 。

## 3.6.5 与 MySQL 兼容性

* KILL TIDB 语句是 TiDB 的扩展语法。如果正尝试终止的会话位于同一个 TiDB 服务器上，可在配置文件里设置 `compatible-kill-query = true` 。

* TiDB 中的 `State` 列是非描述性的。在 TiDB 中，将状态表示为单个值更复杂，因为查询是并行执行的，而且每个 GO 线程在任一时刻都有不同的状态。

* TiDB 的 `show processlist` 与 MySQL 的 `show processlist` 显示内容基本一样，不会显示系统进程号，而 ID 表示当前的 session ID。其中 TiDB 的 `show processlist` 和 MySQL 的 `show processlist` 区别如下：

    * 由于 TiDB 是分布式数据库，tidb-server 实例是无状态的 SQL 解析和执行引擎（详情可参考 TiDB 整体架构），用户使用 MySQL 客户端登录的是哪个 tidb-server，show processlist 就会显示当前连接的这个 tidb-server 中执行的 session 列表，不是整个集群中运行的全部 session 列表；而 MySQL 是单机数据库，show processlist 列出的是当前整个 MySQL 数据库的全部执行 SQL 列表。
