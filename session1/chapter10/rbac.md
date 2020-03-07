---
title: 10.2 RBAC
category: TiDB安全
---

## 10.2 RBAC

Role-based access control，RBAC 基于角色的权限访问控制。

区别于 强制访问控制 MAC 以及 自由选定访问控制 DAC，RBAC 更为中性且更具灵活性。

TiDB 的基于角色的访问控制 (RBAC) 系统的实现类似于 MySQL 8.0 的 RBAC 系统，兼容大部分 [MySQL RBAC 系统的语法](https://dev.mysql.com/doc/refman/8.0/en/roles.html)。

主要包括4个小节，所有提到的参数配置及说明基于 TiDB 4.0 版本

- [RBAC 可以做什么](#rbac-可以做什么)
- [RBAC 实现原理](#rbac-实现原理)
- [RBAC 操作示例](#rbac-操作示例)
- [其他](#其他)

#### RBAC 可以做什么

* 根据业务场景设置角色，集合多个权限

* 方便用户权限管理，同时修改多个用户的权限

* 用户关注场景，角色关注权限

* 进行继承，角色可以授予给另外一个角色

* 一个用户可以同时拥有多个角色，可以同时使用这些角色拥有的权限

#### RBAC 实现原理

* TiDB 的权限管理器，构建出了一个邻接表来记录图结构。
在鉴权时，从用户拥有的角色出发，进行深度优先搜索，找到所有与之相关的角色，将这些角色的权限汇总起来，就得到了用户的角色权限。

* 每个会话 session 中维护了一个 ActiveRole 数组，其中记录着当前哪些角色是启用着，在使用 SET ROLE 时便会对这个数组进行修改，同时权限管理器在用户进行登录时，也会在内存系统表缓存中，找到 default_roles 中记录的默认启用角色，构建出最开始的 ActiveRole 数组。


* 主要依赖以下系统表：

	- mysql.user
	
			复用用户表，区别是 Account_Locked 字段，角色的值是 Y，也就是不能登陆。
		
			+------+------+----------------+
			| host | user | Account_locked | 
			+------+------+----------------+
			| %    | test | N              | 
			| %    | r_1  | Y              |  
			+------+------+----------------+


	- mysql.role_edges
	
			描述了角色和角色，角色和用户之间的授予关系
			例如将角色 r1 授予给 test 后，会出现这样一条记录：
		
			+-----------+-----------+---------+---------+-------------------+
			| FROM_HOST | FROM_USER | TO_HOST | TO_USER | WITH_ADMIN_OPTION |
			+-----------+-----------+---------+---------+-------------------+
			| %         | r1        | %       | test    | N                 |
			+-----------+-----------+---------+---------+-------------------+


	- mysql.default_roles 

			记录每个用户默认启用的角色，启用后的角色才能生效
		
			+------+------+-------------------+-------------------+
			| HOST | USER | DEFAULT_ROLE_HOST | DEFAULT_ROLE_USER | 
			+------+------+-------------------+-------------------+
			| %    | test | %                 | r_1               | 
			+------+------+-------------------+-------------------+

#### RBAC 操作示例

* 创建角色，可以一次创建多个

		CREATE ROLE `r_1`@`%`, `r_2`@`%`;

* 角色权限设置

		GRANT SELECT ON db_1.* TO 'r_1'@'%';
		
* 角色与用户授权

		grant r_1 to test@'%';
		
* 启用默认角色，在登陆时，默认启用的角色会被自动启用

		SET DEFAULT ROLE 'r_1';
		
* 启用当前session角色，仅对当前session生效

		SET ROLE 'r_1';
		
* 查看用户角色

		SELECT CURRENT_ROLE();

* 查看用户角色权限

		TiDB > SHOW GRANTS FOR 'test'@'%' USING 'r_1';
		+--------------------------------------+
		| Grants for test@%                    | 
		+--------------------------------------+
		| GRANT USAGE ON *.* TO 'test'@'%'     | 
		| GRANT Select ON test.* TO 'test'@'%' | 
		| GRANT 'r_1'@'%' TO 'test'@'%'        | 
		+--------------------------------------+
		
* 收回角色

		REVOKE 'r_1' FROM 'test'@'%', 'root'@'%';
		

#### 其他

由于基于角色的访问控制模块和用户管理以及权限管理结合十分紧密，因此需要参考一些操作的细节：

* [TiDB 权限管理](http://pingcap.com/docs-cn/stable/reference/security/privilege-system/)

* [TiDB 用户账户管理](https://pingcap.com/docs-cn/stable/reference/security/user-account-management/)