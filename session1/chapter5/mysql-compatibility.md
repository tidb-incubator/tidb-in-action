## 第5章 TiDB 和 MySQL 的区别

TiDB 作为开源 NewSQL 数据库的典型代表之一，同样支持 SQL，支持事务 ACID 特性。在通讯协议上，TiDB 选择与 MySQL 完全兼容，并尽可能兼容 MySQL 的语法。因此，基于 MySQL 数据库开发的系统，大多数可以平滑迁移至 TiDB，而几乎不用修改代码。对用户来说，迁移成本极低，过渡自然。

然而，仍有一些 MySQL 的特性和行为，TiDB 目前暂时不支持或表现与 MySQL 有差异。除此之外，TiDB 提供了一些扩展语法和功能，为用户提供更多的便利。

TiDB 仍处在快速发展的道路上，对 MySQL 功能和行为的支持方面，正按 [路线图](https://pingcap.com/docs-cn/stable/roadmap/) 的规划在前行。

### 5.1 兼容策略

先从总体上概括 TiDB 和 MySQL 兼容策略，如下表：

| 通讯协议   | SQL语法   | 功能和行为   |
|:----|:----|:----|
| 完全兼容   | 兼容绝大多数   | 兼容大多数   |

截至 4.0 版本，TiDB 与 MySQL 的区别总结如下表：

|    | MySQL   | TiDB   |
|:----|:----|:----|
| 隔离级别   | 支持读未提交、读已提交、可重复读、串行化，默认为可重复读   | 乐观事务支持快照隔离，悲观事务支持快照隔离和读已提交   |
| 锁机制   | 悲观锁   | 乐观锁、悲观锁   |
| 存储过程   | 支持   | 不支持   |
| 触发器   | 支持   | 不支持   |
| 事件   | 支持   | 不支持   |
| 自定义函数   | 支持   | 不支持   |
| 窗口函数   | 支持   | 部分支持   |
| JSON   | 支持   | 不支持部分 MySQL 8.0 新增的函数   |
| 外键约束   | 支持   | 忽略外键约束   |
| 字符集   |    | 只支持 ascii、latin1、binary、utf8、utf8mb4   |
| 增加/删除主键   | 支持   | 通过 [alter-primary-key](https://pingcap.com/docs-cn/dev/reference/configuration/tidb-server/configuration-file/#alter-primary-key) 配置开关提供   |
| CREATE TABLE tblName AS SELECT stmt   | 支持   | 不支持   |
| CREATE TEMPORARY TABLE   | 支持   | TiDB 忽略 TEMPORARY 关键字，按照普通表创建   |
| DML affected rows   | 支持   | 不支持   |
| AutoRandom 列属性   | 不支持   | 支持   |
| Sequence 序列生成器   | 不支持   | 支持   |

### 5.2 区别点详述及应对方案

(1) 字符集支持

TiDB 目前支持以下字符集：

```sql
tidb> SHOW CHARACTER SET;
+---------|---------------|-------------------|--------+
| Charset | Description   | Default collation | Maxlen |
+---------|---------------|-------------------|--------+
| utf8    | UTF-8 Unicode | utf8_bin          |      3 |
| utf8mb4 | UTF-8 Unicode | utf8mb4_bin       |      4 |
| ascii   | US ASCII      | ascii_bin         |      1 |
| latin1  | Latin1        | latin1_bin        |      1 |
| binary  | binary        | binary            |      1 |
+---------|---------------|-------------------|--------+
5 rows in set (0.00 sec)
```

注意：TiDB 的默认字符集为 `utf8mb4`，MySQL 5.7 中为 `latin1`，MySQL 8.0 中修改为 `utf8mb4`。
当指定的字符集为 `utf8` 或 `utf8mb4` 时，TiDB 仅支持合法的 UTF8 字符。对于不合法的字符，会报错：`incorrect utf8 value`，该字符合法性检查与 MySQL 8.0 一致。对于 MySQL 5.7 及以下版本，会存在允许插入非法 UTF8 字符，但同步到 TiDB 报错的情况。此时，可以通过 TiDB 配置 ["tidb_skip_utf8_check"](https://pingcap.com/docs/stable/faq/upgrade/#issue-3-error-1366-hy000-incorrect-utf8-value-f09f8c80-for-column-a) 跳过 UTF8 字符合法性检查强制写入 TiDB。

每一个字符集，都有一个默认的 Collation，例如 `utf8` 的默认 Collation 为 `utf8_bin`，TiDB 中字符集的默认 Collation 与 MySQL 不一致，具体如下：

| 字符集   | TiDB 默认 Collation   | MySQL 5.7 默认 Collation   | MySQL 8.0 默认 Collation   |
|:----|:----|:----|:----|
| utf8   | utf8_bin   | utf8_general_ci   | utf8_general_ci   |
| utf8mb4   | utf8mb4_bin   | utf8mb4_general_ci   | utf8mb4_0900_ai_ci   |
| ascii   | ascii_bin   | ascii_general_ci   | ascii_general_ci   |
| latin1   | latin1_bin   | latin1_swedish_ci   | latin1_swedish_ci   |
| binary   | binary   | binary   | binary   |

在 4.0 版本之前，TiDB 中可以任意指定字符集对应的所有 Collation，并把它们按照默认 Collation 处理，即以编码字节序为字符定序。同时，并未像 MySQL 一样，在比较前按照 Collation 的 `PADDING` 属性将字符补齐空格。因此，会造成以下的行为区别：

```sql
tidb> create table t(a varchar(20) charset utf8mb4 collate utf8mb4_general_ci primary key);
Query OK, 0 rows affected
tidb> insert into t values ('A');
Query OK, 1 row affected
tidb> insert into t values ('a');
Query OK, 1 row affected // MySQL 中，由于 utf8mb4_general_ci 大小写不敏感，报错 Duplicate entry 'a'.
tidb> insert into t1 values ('a ');
Query OK, 1 row affected // MySQL 中，由于补齐空格比较，报错 Duplicate entry 'a '
```

TiDB 4.0 新增了完整的 Collation 支持框架，允许实现所有 MySQL 中的 Collation，并新增了配置开关 `new_collation_enabled_on_first_boostrap`，在集群初次初始化时决定是否启用新 Collation 框架。在该配置开关打开之后初始化集群，可以通过 `mysql`.`tidb` 表中的 `new_collation_enabled` 变量确认新 Collation 是否启用：

```sql
tidb> select VARIABLE_VALUE from mysql.tidb where VARIABLE_NAME='new_collation_enabled';
+----------------+
| VARIABLE_VALUE |
+----------------+
| True           |
+----------------+
1 row in set (0.00 sec)
```

在新 Collation 启用后，TiDB 修正了 `utf8mb4_general_bin` 和 `utf8_general_bin` 的 `PADDING` 行为，会将字符串补齐空格后比较；同时支持了 `utf8mb4_general_ci` 和 `utf8_general_ci`，这两个 Collation 与 MySQL 保持兼容。

(2) 系统时区

在 MySQL 中，系统时区 `system_time_zone` 在 MySQL 服务启动时通过 [环境变量 `TZ` 或命令行参数 `--timezone`](https://dev.mysql.com/doc/refman/8.0/en/time-zone-support.html) 指定。

对于 TiDB 而言，作为一个分布式数据库，TiDB 需要保证整个集群的系统时区始终一致。因此 TiDB 的系统时区在集群初始化时，由负责初始化的 TiDB 节点环境变量 `TZ` 决定。集群初始化后，固定在集群状态表 `mysql`.`tidb` 中：

```sql
tidb> select VARIABLE_VALUE from mysql.tidb where VARIABLE_NAME='system_tz';
+----------------+
| VARIABLE_VALUE |
+----------------+
| Asia/Shanghai  |
+----------------+
1 row in set (0.00 sec)
```

通过查看 `system_time_zone` 变量，可以看到该值与状态表中的 `system_tz` 保持一致：

```sql
tidb> select @@system_time_zone;
+--------------------+
| @@system_time_zone |
+--------------------+
| Asia/Shanghai      |
+--------------------+
1 row in set (0.00 sec)
```

请注意，这意味着 TiDB 的系统时区在初始化后不再更改。若需要改变集群的时区，可以显式指定 `time_zone` 系统变量，例如：

```sql
tidb> set @@global.time_zone='UTC';
Query OK, 0 rows affected (0.00 sec)
```
