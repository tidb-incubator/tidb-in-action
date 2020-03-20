## 10.1 权限管理

TiDB 的权限管理系统提供了基本的权限访问控制功能，保障数据不被非授权的篡改。

TiDB 的权限管理系统按照 MySQL 的权限管理进行实现，TiDB 支持大部分的 MySQL 的语法和权限类型。

TiDB 的权限管理系统主要包含两部分，用户账户管理和权限管理，在本节会通过示例一一展示。


### 10.1.1 权限管理系统可以做什么
- 权限管理系统可以创建和删除用户，授予和撤销用户权限。

- 只有有相应权限的用户才可以进行操作，比如只有对某个表有写权限的用户，才可以对这个表进行写操作。

- 通过为每个用户设定严格的权限，保障数据不被恶意篡改。

### 10.1.2 权限管理系统原理
在权限管理模块中，有三类对象：用户，被访问的对象（数据库，表）以及权限。

所有对象的具体信息都会被记录在几张系统表中：

* mysql.user
* mysql.tables_priv
* mysql.db

所有的授权，撤销权限，创建用户，删除用户操作，实际上都是对于这三张用户表的修改操作。 TiDB 的权限管理器负责将系统表解析到内存中，方便快速的进行鉴权操作。在进行权限修改操作后，权限管理器会重新加载系统表。

#### 1.mysql.user 表解析：

mysql.user 表的结构如下：

```
CREATE TABLE `user` (
  `Host` char(64) NOT NULL,
  `User` char(32) NOT NULL,
  `authentication_string` text DEFAULT NULL,
  `Select_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Insert_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Update_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Delete_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Create_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Drop_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Process_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Grant_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `References_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Alter_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Show_db_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Super_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Create_tmp_table_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Lock_tables_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Execute_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Create_view_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Show_view_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Create_routine_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Alter_routine_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Index_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Create_user_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Event_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Trigger_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Create_role_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Drop_role_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Account_locked` enum('N','Y') NOT NULL DEFAULT 'N',
  `Shutdown_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Reload_priv` enum('N','Y') DEFAULT 'N',
  `File_priv` enum('N','Y') DEFAULT 'N',
  PRIMARY KEY (`Host`,`User`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
```
mysql.user 表主要记录了用户的信息和用户拥有的全局权限，Host 和 User 字段主要用于用户登陆；其中 Host 字段支持通配符功能，用户在登陆时，权限管理器首先会根据登陆指定的用户名，找到 user 表中所有包含这个用户名的行。再通过比对登陆主机的 ip 和这些行的 Host 字段，来确定登陆哪个具体用户；例如用户在 192.168.1.7 登陆 root 用户，mysql.user 表中有 `root`@`172.16.*` 和 `root`@`192.168.1.*` 这两个 User 字段为 root 的用户，那权限管理器会将登陆主机 ip 192.168.1.7 和这两个 Host 进行匹配，从而登陆  `root`@`192.168.1.*`。

#### 2.mysql.table, mysql.db 表解析：

mysql.table 表和 mysql.db 表的结构如下：

```
CREATE TABLE `tables_priv` (
  `Host` char(60) NOT NULL,
  `DB` char(64) NOT NULL,
  `User` char(32) NOT NULL,
  `Table_name` char(64) NOT NULL,
  `Grantor` char(77) DEFAULT NULL,
  `Timestamp` timestamp DEFAULT CURRENT_TIMESTAMP,
  `Table_priv` set('Select','Insert','Update','Delete','Create','Drop','Grant','Index','Alter','Create View','Show View','Trigger','References') DEFAULT NULL,
  `Column_priv` set('Select','Insert','Update') DEFAULT NULL,
  PRIMARY KEY (`Host`,`DB`,`User`,`Table_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
```
```
CREATE TABLE `db` (
  `Host` char(60) NOT NULL,
  `DB` char(64) NOT NULL,
  `User` char(32) NOT NULL,
  `Select_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Insert_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Update_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Delete_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Create_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Drop_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Grant_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `References_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Index_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Alter_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Create_tmp_table_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Lock_tables_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Create_view_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Show_view_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Create_routine_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Alter_routine_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Execute_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Event_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  `Trigger_priv` enum('N','Y') NOT NULL DEFAULT 'N',
  PRIMARY KEY (`Host`,`DB`,`User`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
```
mysql.tables_priv 和 mysql.db 主要记录了将权限授予给用户的信息，分别对应表权限和数据库权限。

在进行鉴权操作时，执行计划会根据访问到的表，数据库，以及操作类型，汇总出一个所需要权限的 bitmask ，然后向权限管理器请求鉴权。权限管理器会根据要鉴权的 User, Host 从内存的权限表中得到对应用户的全局权限，数据库权限和表权限。来逐级检查用户是否拥有所需要的权限。

在进行类似 GRANT, REVOKE 等对用户的权限修改操作时，TiDB 会开启一个内部 sql 事务，用 INSERT, UPDATE, DELETE 修改对应的权限表，然后提交内部事务，如果提交成功，权限管理器会刷新内存中的权限表。

### 10.1.3 权限管理系统操作示例
创建一个用户名为 developer 且能在 192.168.0.* 这一子网中登陆的用户，密码为  'test_user'

```
root> CREATE USER 'developer'@'192.168.0.%' IDENTIFIED BY 'test_user';
```
并且授予给 developer 用户在 read_table 表上的读权限，write_table 表上的写权限。
```
root> GRANT SELECT ON app.read_table TO 'developer'@'192.168.0.%';
root> GRANT INSERT, UPDATE ON app.write_table TO 'developer'@'192.168.0.%';
```
查看 developer 用户当前的权限。
```
root> SHOW GRANTS FOR 'developer'@'192.168.0.%';
GRANT USAGE ON *.* TO 'developer'@'192.168.0.%'                      
GRANT Select ON app.read_table TO 'developer'@'192.168.0.%'
GRANT Insert,Update,Delete ON app.write_table TO 'developer'@'192.168.0.%'
```
然后用 developer 登陆，尝试使用权限。
```
developer> SEECT * FROM app.read_table;
Empty set (0.01 sec)
developer> INSERT INTO write_table VALUES (1),(2),(3);
Query OK, 3 rows affected (0.00 sec)
Records: 3  Duplicates: 0  Warnings: 0
```
假如用 developer 试图对 write_table 进行写操作，TiDB 会提示限检查未通过。
```
developer> INSERT INTO read_table VALUES (1),(2),(3);
ERROR 1142 (42000): INSERT command denied to user 'developer'@'192.168.0.%' for table 'read_table'
```
具有 GRANT_OPTION 权限的用户可以通过 GRANT, REVOKE 管理其他用户的权限，比如撤销 developer 在 read_table 表上的读权限。
```
root> REVOKE SELECT ON app.read_table from 'developer'@'192.168.0.%';
```
具有 CREATE USER 权限的用户可以修改其他用户的信息，比如修改密码，删除用户。
```
root> ALTER USER 'developer'@'192.168.0.%' IDENTIFIED BY 'password';
root> DROP USER 'developer'@'192.168.0.%'
```

### 10.1.4 小结
本节主要介绍了 TiDB 权限相关操作的使用方法；介绍了如何创建一个用户，授予一些权限。如何撤销权限和删除用户。下一节将进一步深入 TiDB 权限管理模块，讲解 RBAC 的原理和使用方法。