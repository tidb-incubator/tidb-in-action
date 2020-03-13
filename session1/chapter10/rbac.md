## 10.2 RBAC

上一节介绍了 TiDB 的基本权限功能，本小节将介绍另一个权限管理功能-- RBAC。

Role-based access control，RBAC 基于角色的权限访问控制。

区别于 MAC (Mandatory access control) 以及 DAC (Discretionary Access Control)，RBAC 更为中性且更具灵活性。

TiDB 的基于角色的访问控制 (RBAC) 系统的实现类似于 MySQL 8.0 的 RBAC 系统，兼容大部分 [MySQL RBAC 系统的语法](https://dev.mysql.com/doc/refman/8.0/en/roles.html)。


### 10.2.1 RBAC 可以做什么

- 根据业务场景设置角色，集合多个权限。

- 方便用户权限管理，同时修改多个用户的权限。

- 用户关注场景，角色关注权限。

- 进行继承，角色可以授予给另外一个角色。

- 一个用户可以同时拥有多个角色，可以同时使用这些角色拥有的权限。

### 10.2.2 RBAC 实现原理

- TiDB 的权限管理器，构建出了一个邻接表来记录图结构。
在鉴权时，从用户拥有的角色出发，进行深度优先搜索，找到所有与之相关的角色，将这些角色的权限汇总起来，就得到了用户的角色权限。

- 每个会话 session 中维护了一个 ActiveRole 数组，其中记录着当前哪些角色是启用着，在使用 SET ROLE 时便会对这个数组进行修改，同时权限管理器在用户进行登录时，也会在内存系统表缓存中，找到 default_roles 中记录的默认启用角色，构建出最开始的 ActiveRole 数组。

主要依赖以下系统表：

- mysql.user
复用用户表，区别是 Account_Locked 字段，角色的值是 Y，也就是不能登陆.

```sql
+------+------+----------+-------------+-------------+-------------+-------------+-------------+-----------+--------------+------------+-----------------+------------+--------------+------------+-----------------------+------------------+--------------+------------------+----------------+---------------------+--------------------+------------+------------------+------------+--------------+------------------+----------------+----------------+---------------+
| Host | User | Password | Select_priv | Insert_priv | Update_priv | Delete_priv | Create_priv | Drop_priv | Process_priv | Grant_priv | References_priv | Alter_priv | Show_db_priv | Super_priv | Create_tmp_table_priv | Lock_tables_priv | Execute_priv | Create_view_priv | Show_view_priv | Create_routine_priv | Alter_routine_priv | Index_priv | Create_user_priv | Event_priv | Trigger_priv | Create_role_priv | Drop_role_priv | Account_locked | Shutdown_priv |
+------+------+----------+-------------+-------------+-------------+-------------+-------------+-----------+--------------+------------+-----------------+------------+--------------+------------+-----------------------+------------------+--------------+------------------+----------------+---------------------+--------------------+------------+------------------+------------+--------------+------------------+----------------+----------------+---------------+
| %    | root |          | Y           | Y           | Y           | Y           | Y           | Y         | Y            | Y          | Y               | Y          | Y            | Y          | Y                     | Y                | Y            | Y                | Y              | Y                   | Y                  | Y          | Y                | Y          | Y            | Y                | Y              | N              | Y             |
| %    | r_1  |          | N           | N           | N           | N           | N           | N         | N            | N          | N               | N          | N            | N          | N                     | N                | N            | N                | N              | N                   | N                  | N          | N                | N          | N            | N                | N              | Y              | N             |
| %    | r_2  |          | N           | N           | N           | N           | N           | N         | N            | N          | N               | N          | N            | N          | N                     | N                | N            | N                | N              | N                   | N                  | N          | N                | N          | N            | N                | N              | Y              | N             |
+------+------+----------+-------------+-------------+-------------+-------------+-------------+-----------+--------------+------------+-----------------+------------+--------------+------------+-----------------------+------------------+--------------+------------------+----------------+---------------------+--------------------+------------+------------------+------------+--------------+------------------+----------------+----------------+---------------+
```

- mysql.role_edges
描述了角色和角色，角色和用户之间的授予关系。
例如将角色 r1 授予给 test 后，会出现这样一条记录：

```sql
+-----------+-----------+---------+---------+-------------------+
| FROM_HOST | FROM_USER | TO_HOST | TO_USER | WITH_ADMIN_OPTION |
+-----------+-----------+---------+---------+-------------------+
| %         | r1        | %       | test    | N                 |
+-----------+-----------+---------+---------+-------------------+
```

- mysql.default_roles
记录每个用户默认启用的角色，启用后的角色才能生效。

```sql
+------+------+-------------------+-------------------+
| HOST | USER | DEFAULT_ROLE_HOST | DEFAULT_ROLE_USER |
+------+------+-------------------+-------------------+
| %    | test | %                 | r_1               |
+------+------+-------------------+-------------------+
```

### 10.2.3 RBAC 操作示例

- 创建角色 r_1，r_2，可以一次创建多个，示例：

```sql
CREATE ROLE `r_1`@`%`, `r_2`@`%`;
```

- 设置 r_1 为只读角色：

```sql
GRANT SELECT ON db_1.* TO 'r_1'@'%';
```

- 将 r_1 角色授予用户 test@'%'：

```sql
grant r_1 to test@'%';
```

- 启用默认角色，在登陆时，默认启用的角色会被自动启用：

```sql
SET DEFAULT ROLE 'r_1';
```

- 启用当前session角色，仅对当前session生效：

```sql
SET ROLE 'r_1';
```

- 查看用户角色：

```sql
SELECT CURRENT_ROLE();
```

- 查看用户角色权限：

```sql
TiDB > SHOW GRANTS FOR 'test'@'%' USING 'r_1';
+--------------------------------------+
| Grants for test@%                    |
+--------------------------------------+
| GRANT USAGE ON *.* TO 'test'@'%'     |
| GRANT Select ON test.* TO 'test'@'%' |
| GRANT 'r_1'@'%' TO 'test'@'%'        |
+--------------------------------------+
```

- 收回角色：

```sql
REVOKE 'r_1' FROM 'test'@'%', 'root'@'%';
```

### 10.2.4 看一个完整的例子
账户 bi_user 登录，启用只读角色后，才可以查询指定库表权限，会话结束，权限失效。

```sql
#创建角色 reader
root@127.0.0.1:(none)>create role reader@'%';
Query OK, 0 rows affected (0.012 sec)

#设置角色 reader 只读 mysql.role_edges 权限
root@127.0.0.1:mysql>grant select on mysql.role_edges to reader'%';
Query OK, 0 rows affected (0.017 sec)

#创建用户 bi_user
root@127.0.0.1:(none)>create user bi_user@'%';
Query OK, 0 rows affected (0.011 sec)

#将只读角色 reader 授予 bi_user 用户
root@127.0.0.1:mysql>grant reader to bi_user'%';
Query OK, 0 rows affected (0.014 sec)

# bi_user 登录查看无数据权限
bi_user@127.0.0.1:(none)>show databases;
+--------------------+
| Database           |
+--------------------+
| INFORMATION_SCHEMA |
+--------------------+
1 row in set (0.000 sec)

#查看当前登录用户 bi_user 当前未启用角色
bi_user@127.0.0.1:(none)>SELECT CURRENT_ROLE();
+----------------+
| CURRENT_ROLE() |
+----------------+
|                |
+----------------+
1 row in set (0.000 sec)

#在当前 session 中启用 bi_user 的 reader 角色
bi_user@127.0.0.1:(none)>set role reader;
Query OK, 0 rows affected (0.000 sec)

#查看 bi_user 当前被启用的角色
bi_user@127.0.0.1:(none)>SELECT CURRENT_ROLE();
+----------------+
| CURRENT_ROLE() |
+----------------+
| `reader`@`%`   |
+----------------+
1 row in set (0.000 sec)

#当前登录用户 bi_user 查看 mysql 库中有权限的表
bi_user@127.0.0.1:mysql>select * from role_edges;
+-----------+-----------+---------+---------+-------------------+
| FROM_HOST | FROM_USER | TO_HOST | TO_USER | WITH_ADMIN_OPTION |
+-----------+-----------+---------+---------+-------------------+
| %         | reader    | %       | bi_user | N                 |
+-----------+-----------+---------+---------+-------------------+
1 row in set (0.000 sec)

#当前登录用户 bi_user 执行 delete 表报错，权限校验失败
bi_user@127.0.0.1:mysql>delete from role_edges;
ERROR 1105 (HY000): privilege check fail

#当前登录用户 bi_user 执行查询其他表报错
bi_user@127.0.0.1:mysql>select * from user;
ERROR 1142 (42000): SELECT command denied to user 'bi_user'@'127.0.0.1' for table 'user'

#重新登录 bi_user 权限已经失效
bi_user@127.0.0.1(none)>use mysql
ERROR 1044 (42000): Access denied for user 'bi_user'@'%' to database 'mysql'
```

### 10.2.5 小结
本小节介绍了 RBAC 的原理和使用方式，企业用户可以用 RBAC 构建出一套灵活的权限管理机制。下一节中将介绍 TiDB 的另一种身份验证方式——证书验证。