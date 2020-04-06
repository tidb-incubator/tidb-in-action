## 7.3 Sequence

Sequence 是数据库系统按照一定规则自增的数字序列，具有唯一和单调递增的特性。在官方 SQL 2003 标准中，其被定义为“生成连续数值的一种机制，Sequence 既可以是内部对象，也可以是外部对象”。因原生 MySQL 中并未支持 Sequence，所以 TiDB Sequence 的语法参考了 MariaDB、Oracle 和 IBM Db2。

- Create Sequence 语法

```SQL
CREATE [TEMPORARY] SEQUENCE [IF NOT EXISTS] sequence_name
[ INCREMENT [ BY | = ] INCREMENT ]
[ MINVALUE [=] minvalue | NO MINVALUE | NOMINVALUE ]
[ MAXALUE [=] maxvalue | NO MAXVALUE | NOMAXVALUE ]
[ START [ WITH | = ] start ]
[ CACHE [=] cache | NOCACHE | NO CACHE]
[ CYCLE | NOCYCLE | NO CYCLE]
[ ORDER | NOORDER | NO ORDER]
[table_options]
```

- Show Create Sequence 语法

```SQL
SHOW CREATE SEQUENCE sequence_name
```

- Drop Sequence

```SQL
DROP [TEMPORARY] SEQUENCE [IF NOT EXISTS] sequence_name
```

- 获取下一个值

```SQL
SELECT NEXT VALUE FOR sequence_name;
SELECT NEXTVAL(sequence_name);
```

- 获取上一个/当前值

```SQL
SELECT PREVIOUS VALUE FOR sequence_name;
SELECT LASTVAL(sequence_name);
```

- 修改当前值

```SQL
SELECT SETVAL(sequence_name,100)；
```

### 7.3.1 用例介绍

本部分将会通过一些案例介绍 TiDB Sequence 的使用方法：

- 并发应用需要获取单调递增的序列号

在使用分布式数据库的场景里，通常应用也是分布式架构，这样多个应用节点之间如何获取唯一且递增的序列号就成为一个难题。在分布式数据库没有 Sequence 的时候，应用基本通过`雪花算法`、`数据库主键自增`等方法实现，业界也有一些较为成熟的方案，比如 [Leaf - 美团点评分布式 ID](https://tech.meituan.com/2017/04/21/mt-leaf.html)、[百度的 uid-generator](https://github.com/baidu/uid-generator) 等，上述方案中为了解决该问题引入一个新的系统或模块，极大的增加了应用系统的复杂度。接下来我们看看 TiDB 如何通过 `Sequence` 解决上述问题。

(1) 首先新建一个 Sequence

```SQL
CREATE SEQUENCE seq_for_unique START WITH 1 INCREMENT BY 1 CACHE 1000 NOCYCLE;
```

(2) 从不同的 TiDB 节点获取到的 Sequence 值顺序有所不同

如果两个应用节点同时连接至同一个 `TiDB` 节点，两个节点取到的则为连续递增的值

```SQL
节点 A：tidb[test]> SELECT NEXT VALUE FOR seq_for_unique;
+-------------------------------+
| NEXT VALUE FOR seq_for_unique |
+-------------------------------+
|                             1 |
+-------------------------------+
1 row in set (0.00 sec)

节点 B：tidb[test]> SELECT NEXT VALUE FOR seq_for_unique;
+-------------------------------+
| NEXT VALUE FOR seq_for_unique |
+-------------------------------+
|                             2 |
+-------------------------------+
1 row in set (0.00 sec)
```

(3) 如果两个应用节点分别连接至不同 `TiDB` 节点，两个节点取到的则为区间递增（每个 TiDB 节点上为连续递增）但不连续的值

```SQL
节点 A：tidb[test]> SELECT NEXT VALUE FOR seq_for_unique;
+-------------------------------+
| NEXT VALUE FOR seq_for_unique |
+-------------------------------+
|                             1 |
+-------------------------------+
1 row in set (0.00 sec)

节点 B：tidb[test]> SELECT NEXT VALUE FOR seq_for_unique;
+-------------------------------+
| NEXT VALUE FOR seq_for_unique |
+-------------------------------+
|                          1001 |
+-------------------------------+
1 row in set (0.00 sec)
```

- 在一张表里面需要有多个自增字段

MySQL 语法中每张表仅能新建一个 `auto_increment` 字段，且该字段必须定义在主键或是索引列上。在 TiDB 中通过 `Sequence` 和生成列，我们可以实现多自增字段需求。

(1) 首先新建如下两个 Sequence

```SQL
CREATE SEQUENCE seq_for_autoid START WITH 1 INCREMENT BY 2 CACHE 1000 NOCYCLE;
CREATE SEQUENCE seq_for_logid START WITH 100 INCREMENT BY 1 CACHE 1000 NOCYCLE;
```

(2) 在新建表的时候通过 `default nextval(seq_name)` 设置列的默认值

```SQL
CREATE TABLE `user` (
    `userid` varchar(32) NOT NULL,
    `autoid` int(11) DEFAULT 'nextval(`test`.`seq_for_autoid`)',
    `logid` int(11) DEFAULT 'nextval(`test`.`seq_for_logid`)',
    PRIMARY KEY (`userid`)
)
```

(3) 接下来我们插入几个用户信息进行测试：

```SQL
INSERT INTO user (userid) VALUES ('usera');
INSERT INTO user (userid) VALUES ('userb');
INSERT INTO user (userid) VALUES ('userc');
```

(4) 查询 `user` 表，可以发现 `autoid` 和 `logid` 字段的值按照不同的步长进行自增，且主键仍然在列 `userid` 上：

```SQL
tidb[test]> select * from user;
+--------+--------+-------+
| userid | autoid | logid |
+--------+--------+-------+
| usera  |      1 |   100 |
| userb  |      3 |   101 |
| userc  |      5 |   102 |
+--------+--------+-------+
3 rows in set (0.01 sec)
```

- 更新数据表中一列值为连续自增的值

假设我们有一张数据表，表中有 20 万行数据，我们需要更新其中一列的值为连续自增且唯一的整数，如果没有 Sequence，我们只能通过应用一条条读取记录，并用 `update` 更新值，同时还需要分批次提交，但现在我们有了 Sequence，一切都会变的特别简单。

(1) 新建一张测试表

```SQL
tidb[test]> CREATE TABLE t( a int, name varchar(32));
Query OK, 0 rows affected (0.01 sec)
```

(2) 新建一个 Sequence

```SQL
tidb[test]> CREATE SEQUENCE test;
Query OK, 0 rows affected (0.00 sec)
```

(3) 插入 1 万条记录

```bash
for i in $(seq 1 10000)
do
   echo "insert into t values($(($RANDOM%1000)),'user${i}');" >> user.sql
done
```

```SQL
tidb[test]> select count(*) from t;
+----------+
| count(*) |
+----------+
|    10000 |
+----------+
1 row in set (0.05 sec)
tidb[test]> select * from t;
+------+-----------+
| a    | name      |
+------+-----------+
|  355 | user1     |
|  729 | user2     |
|  684 | user3     |
|  815 | user4     |
|   39 | user5     |
|  294 | user6     |
|  407 | user7     |
|  767 | user8     |
|  246 | user9     |
|  755 | user10    |
|  496 | user11    |
...
```

(4) 更新为连续的值

```SQL
tidb[test]> update t set a=nextval(test);
Query OK, 10000 rows affected (0.20 sec)
Rows matched: 10000  Changed: 10000  Warnings: 0
```

(5) 查询结果集,可以看到字段 `a` 的值已经连续自增且唯一

```SQL
tidb[test]> select * from t;
+-------+-----------+
| a     | name      |
+-------+-----------+
|     1 | user1     |
|     2 | user2     |
|     3 | user3     |
|     4 | user4     |
|     5 | user5     |
|     6 | user6     |
|     7 | user7     |
|     8 | user8     |
|     9 | user9     |
|    10 | user10    |
|    11 | user11    |
|    12 | user12    |
|    13 | user13    |
|    14 | user14    |
|    15 | user15    |
|    16 | user16    |
|    17 | user17    |
|    18 | user18    |
|    19 | user19    |
|    20 | user20    |
...
```

### 7.3.2 注意事项

在分布式架构的数据库中实现单调递增序列是比较有难度的，而 `Sequence` 把`严格递增`和`性能`两方面交给了使用者，在新建 `Sequence` 的时候，可以通过组合 `Order/No Order`（目前尚未实现）和 `Cache/No Cache` 来选择新建高性能的 `Sequence`，亦或是性能较差但递增较为严格的 `Sequence`。
