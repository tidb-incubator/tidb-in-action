# 3.6 processlist 系统表

processlist 是当前线程的运行情况，在 TiDB 中，主要有三种语句可以用来查看 processlist 系统表，分别是：

* SHOW [FULL] PROCESSLIST
* select * from INFORMATION_SCHEMA.PROCESSLIST
* select * from INFORMATION_SCHEMA.CLUSTER_PROCESSLIST

需要注意的是，除了 root 用户能看到所有正在运行的线程外，其他用户都只能看到自己正在运行的线程，看不到其它用户正在运行的线程。除非单独个这个用户赋予了PROCESS 权限。

## SHOW [FULL] PROCESSLIST

`SHOW [FULL] PROCESSLIST` 语句列出连接到相同 TiDB 服务器的当前会话。`Info` 列包含查询文本，除非指定可选关键字 `FULL`，否则文本会被截断。

### 示例

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

### 字段含义说明

* Id：连接 TiDB 服务器线程的唯一标识，可以通过 kill 来终止此线程的链接。
* User：当前连接线程的用户。
* Host：发出命令语句的客户端的主机名。
* db：线程链接的数据库，如果没有则为 null。
* Command：线程正在执行的命令类型，一般是休眠（Sleep），查询（Query）。
* Time：线程处于当前状态的时间（以秒为单位）。
* State：显示当前sql语句的状态，比如：Sending data，Sorting for group，Creating tmp table，Locked 等等。
* Info：线程正在执行的语句，为 NULL 时表示没有在执行任何语句。

### 查询 PROCESSLIST 示例

#### KILL [TIDB]

`KILL TIDB` 语句用于终止 TiDB 中的连接。

按照设计，`KILL TIDB` 语句默认与 MySQL 不兼容。负载均衡器后面通常放有多个 TiDB 服务器，这种默认不兼容有助于防止在错误的 TiDB 服务器上终止连接。

#### 设置 KILL 语句的兼容性

* TiDB 中 KILL xxx 的行为和 MySQL 中的行为不相同。为杀死一条查询，在 TiDB 里需要加上 TIDB 关键词，即 KILL TIDB xxx。但如果把 compatible-kill-query 设置为 true (默认值为  false)，则不需要加上 TIDB 关键词。

* 这种区别很重要，因为当用户按下 Ctrl+C 时，MySQL 命令行客户端的默认行为是：创建与后台的新连接，并在该新连接中执行 KILL 语句。如果负载均衡器或代理已将该新连接发送到与原始会话不同的 TiDB 服务器实例，则该错误会话可能被终止，从而导致使用 TiDB 集群的业务中断。只有当您确定在 KILL 语句中引用的连接正好位于 KILL 语句发送到的服务器上时，才可以启用 compatible-kill-query。因此如果正尝试终止的会话位于同一个 TiDB 服务器上，可在配置文件里设置 `compatible-kill-query = true`

#### KILL 示例

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

再次查看发现 ID 为 5 的 查询已经被 kill 掉了

## INFORMATION_SCHEMA.PROCESSLIST

查询 `INFORMATION_SCHEMA.PROCESSLIST` 表和 `show processlist` 的功能一样，都是查看当前正在处理的请求。

`PROCESSLIST` 表会比 `show processlist` 多一个 `MEM` 和 `TxnStart`列。

* `MEM` ：指正在处理的请求已使用的内存，单位是 byte。
* `TxnStart` ：指当前处理请求的事务开始的时间戳。

```sql
select * from INFORMATION_SCHEMA.PROCESSLIST
```

```result
+------+--------+-----------+--------+-----------+--------+---------+----------------------------------------------+-------+------------+
| ID   | USER   | HOST      | DB     | COMMAND   | TIME   | STATE   | INFO                                         | MEM   | TxnStart   |
|------+--------+-----------+--------+-----------+--------+---------+----------------------------------------------+-------+------------|
| 9    | root   | 127.0.0.1 | <null> | Query     | 0      | 2       | select * from INFORMATION_SCHEMA.PROCESSLIST | 0     |            |
| 7    | root   | 127.0.0.1 | <null> | Sleep     | 51     | 2       | <null>                                       | 0     |            |
+------+--------+-----------+--------+-----------+--------+---------+----------------------------------------------+-------+------------+

```

### 查询 INFORMATION_SCHEMA.PROCESSLIST 示例

show full processlist 可以看到所有连接的情况，但是大多连接的 state 其实是 Sleep 的，这种的其实是空闲状态，没有太多查看价值
我们要观察的是有问题的，所以可以使用 `select` 查询 `PROCESSLIST` 系统表进行过滤：

```sql
-- 查询非 Sleep 状态的链接，按消耗时间倒序展示，加条件过滤
select *
from information_schema.processlist
where command != 'Sleep'
order by time desc
```

这样就过滤出来哪些是正在运行的，然后按照消耗时间倒序展示，排在最前面的，极大可能就是有问题的链接了，然后查看 info 一列，就能看到具体执行的什么 SQL 语句了

```result
+------+--------+-----------+--------+-----------+--------+---------+------------------------------------------------------------------------------------------+-------+------------+
| ID   | USER   | HOST      | DB     | COMMAND   | TIME   | STATE   | INFO                                                                                     | MEM   | TxnStart   |
|------+--------+-----------+--------+-----------+--------+---------+------------------------------------------------------------------------------------------+-------+------------|
| 10   | root   | 127.0.0.1 | <null> | Query     | 0      | 2       | select * from information_schema.processlist where command != 'Sleep' order by time desc | 4588  |            |
+------+--------+-----------+--------+-----------+--------+---------+------------------------------------------------------------------------------------------+-------+------------+

```

找出运行较长的 sql 后，我们就可以通过运行 `EXPLAIN ANALYZE` 语句可以获得一个 SQL 语句执行中的一些具体信息。关于 `EXPLAIN ANALYZE` 的具体使用可查看 [使用 EXPLAIN 来优化 SQL 语句](https://pingcap.com/docs-cn/stable/reference/performance/understanding-the-query-execution-plan/#%E4%BD%BF%E7%94%A8-explain-%E6%9D%A5%E4%BC%98%E5%8C%96-sql-%E8%AF%AD%E5%8F%A5)

当 TiDB 节点内存不足时

```sql
-- 查询非 Sleep 状态的链接，按消耗内存展示其 top10
select *
from information_schema.processlist
where command != 'Sleep'
order by mem
limit 10
```

这样就可以过滤出消耗内存最多的 10 条运行中的命令，排在最前面的，极大可能就是有问题的链接了，然后查看 info 一列，就能看到具体执行的什么 SQL 语句了
输出样例：

```result
+------+--------+-----------+--------+-----------+--------+---------+------------------------------------------------------------------------------------------+-------+------------+
| ID   | USER   | HOST      | DB     | COMMAND   | TIME   | STATE   | INFO                                                                                     | MEM   | TxnStart   |
|------+--------+-----------+--------+-----------+--------+---------+------------------------------------------------------------------------------------------+-------+------------|
| 10   | root   | 127.0.0.1 | <null> | Query     | 0      | 2       | select * from information_schema.processlist where command != 'Sleep' order by time desc | 4588  |            |
+------+--------+-----------+--------+-----------+--------+---------+------------------------------------------------------------------------------------------+-------+------------+

```

找出内存消耗较多的 sql 后，同样可以通过运行 `EXPLAIN ANALYZE` 语来获具体 SQL 执行信息。

我们可以根据 command 和 time 条件找出有问题的执行语句，并根据其 ID 将其 kill 掉，一个个 ID 来 kill 显然太慢，我们可以通过 concat() 内置函数来实现快速 kill

```sql
-- 查询执行时间超过2分钟，且非 sleep 的线程，然后拼接成 kill 语句
select concat('kill ', 'TiDB', id, ';')
from information_schema.processlist
where command != 'Sleep'
and time > 2*60
order by time desc
```

-- 然后再来查看执行时间超过2分钟，且非 sleep 的线程，发现已经全部被 kill 了

```sql
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

## INFORMATION_SCHEMA.CLUSTER_PROCESSLIST

查询 TiDB 的 `PROCESSLIST` 系统表时，用户一定会遇到的问题是：某些系统表只包含了当前 TiDB 节点的数据，而不是所有节点的数据。
TiDB 4.0 中新增了 `CLUSTER_PROCESSLIST` 系统表，用来查询**所有** TiDB 节点的 `PROCESSLIST` 数据，使用上和 `PROCESSLIST` 是一样的。

`CLUSTER_PROCESSLIST` 表会比 `PROCESSLIST` 多一个 `INSTANCE` 列。
`INSTANCE` 用来表示该条数据属于哪一个 TiDB 节点。

```sql
select * from INFORMATION_SCHEMA.CLUSTER_PROCESSLIST
```

```result
+---------------+------+--------+-----------+--------+-----------+--------+---------+------------------------------------------------------+-------+----------------------------------------+
| INSTANCE      | ID   | USER   | HOST      | DB     | COMMAND   | TIME   | STATE   | INFO                                                 | MEM   | TxnStart                               |
|---------------+------+--------+-----------+--------+-----------+--------+---------+------------------------------------------------------+-------+----------------------------------------|
| 0.0.0.0:10080 | 9    | root   | 127.0.0.1 | <null> | Sleep     | 1824   | 2       | <null>                                               | 0     |                                        |
| 0.0.0.0:10080 | 10   | root   | 127.0.0.1 | <null> | Sleep     | 1439   | 2       | <null>                                               | 0     |                                        |
| 0.0.0.0:10081 | 7    | root   | 127.0.0.1 | <null> | Query     | 0      | 2       | select * from INFORMATION_SCHEMA.CLUSTER_PROCESSLIST | 0     | 03-08 13:42:02.850(415143329228390401) |
+---------------+------+--------+-----------+--------+-----------+--------+---------+------------------------------------------------------+-------+----------------------------------------+
```

### 查询集群各个 TiDB 节点的运行时间超过2分钟的线程数量

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

如果某个节点的长时间运行线程较多，可以进一步查看该节点的具体线程情况，并结合 `EXPLAIN ANALYZE` 分析具体 sql

## 与 MySQL 兼容性

* KILL TIDB 语句是 TiDB 的扩展语法。如果正尝试终止的会话位于同一个 TiDB 服务器上，可在配置文件里设置 

* TiDB 中的 `State` 列是非描述性的。在 TiDB 中，将状态表示为单个值更复杂，因为查询是并行执行的，而且每个 GO 线程在任一时刻都有不同的状态。

* TiDB 的 show processlist 与 MySQL 的 show processlist 显示内容基本一样，不会显示系统进程号，而 ID 表示当前的 session ID。其中 TiDB 的 show processlist 和 MySQL 的 show processlist 区别如下：

* 由于 TiDB 是分布式数据库，tidb-server 实例是无状态的 SQL 解析和执行引擎（详情可参考 TiDB 整体架构），用户使用 MySQL 客户端登录的是哪个 tidb-server，show processlist 就会显示当前连接的这个 tidb-server 中执行的 session 列表，不是整个集群中运行的全部 session 列表；而 MySQL 是单机数据库，show processlist 列出的是当前整个 MySQL 数据库的全部执行 SQL 列表。

* TiDB 的 show processlist 显示内容比起 MySQL 来讲，多了一个当前 session 使用内存的估算值（单位 Byte）。
