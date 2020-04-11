# 第 5 章 数据迁移方案

本章将介绍常用的异构或者同构数据库之间的数据全量和增量同步方案，重点介绍如何将数据从IBM Db2、Mongodb、MySQL、Oracle、阿里云 DRDS、SQL Server同步至TiDB分布式数据库，同时介绍如何使用数据同步方案进行TiDB的高可用数据容灾。

* [IBM Db2 到 TiDB (CDC)](from-db2-to-tidb.md) 
* [MongoDB 迁移到 TiD](from-mongodb-to-tidb.md)
* [DM 同步 MySQL 到 TiDB 的实践](from-mysql-to-tidb.md)
* [Oracle 到 TiDB (OGG)](from-oracle-to-tidb.md)
* [DM 同步分库分表 MySQL 到 TiDB 的实践](from-sharding-to-tidb.md)
* [DM 同步单机 MySQL 到 TiDB 的实践](from-single-mysql-to-tidb.md)
* [SQLServer 到 TiDB (阿里DataX)](from-sqlserver-to-tidb-using-datax.md)
* [SQL Server 迁移到 TiDB (阿里yutong)](from-sqlserver-to-tidb.md)
* [TiDB 到 TiDB (阿里DataX)](from-tidb-to-tidb-using-datax.md)