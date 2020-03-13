在数同步场景中，上游数据库可能是任何关系型数据库，异构数据库之间的同步目前还没有一款通用的工具能够很好的适配所有的关系型数据库。不同的数据源同步我们的通常会调研各种可用的工具，在 DB2 同步数据到 TiDB 中，我们发现 IBM 的 CDC 工具能够较好的完成这一任务。

## CDC 简介
IBM 公司为 DB2 开发了一款数据同步工具，初期这款工具被命名为 InfoSphere Change Data Capture 简称 CDC ，在后来的迭代过程中又更名为 IBM InfoSphere Data Replication 简称 IIDR。但 CDC 大家再用的过程中还是习惯性的称它为 CDC 。本文中 CDC 等价于 IIDR。

IIDR 的核心组件是 Q Replication，IBM 使用 Q Replication 提供了一个基于近实时事务复制机制的软件，该机制可保证数据交付。从技术上讲，Q Replication 是一项异步日志捕获/事务重播技术，它借助消息队列的方式在源端和目标端传输事务。Q Replication 会抓取源 DB2 中指定的日志并将其应用到目的端。IIDR 需要分别在源端和目标端部署相关软件，同时需要有一台 windows 服务器用于部署管理端。

## 部署架构
![图片](https://uploader.shimo.im/f/uTQkVjDBsG0uHb01.png!thumbnail)

以上图的生产环境架构为例，上游是一个核心系统，使用的是IBM商业平台，生产和备份平台之间使用了 OMS 同步，IIDR 同步的源端为备机数据库，目标端为 TiDB 。为保证高可用，在下游的另外一台服务器上部署了 IIDR 软件作为备用节点。

## 关键参数和配置项
关于 IIDR 的部署安装大家可以参考官网，本文不做重点介绍。这里主要说明一下 IIDR 的下游为 TiDB 时，在部署和使用过程中需要注意的点。

* IIDR 安装选项选择 FlexRep

因为 TiDB 并不在 IIDR 官方的支持列表中，所以在下游安装时，我们要选择 **FlexRep 如下图所示：**

![图片](https://uploader.shimo.im/f/KJyEsAItPqISf8o0.png!thumbnail)

* 创建预定需要借助 MySQL 驱动

IIDR 需要借助 MySQL 驱动通过 JDBC 的方式将数据写入 TiDB 中，需要提前下载 MySQL 驱动，并在创建订阅时选择该驱动，如下图所示：

![图片](https://uploader.shimo.im/f/pk4owBXHWvgGZ2ST.png!thumbnail)

* IIDR 下游软件参数配置

| 参数   | 值   | 
|:----|:----:|
| convert_not nullable_column   | true   | 
| events_max_retain   | 10000   | 
| global_conversion_not_possible_warning   | false   | 
| global_max_batch_size   | 25   | 
| global_shutdown_after_no_heartbeat_reponse_minute   | 10   | 
| Implicit_transformation_warning   | true   | 
| jdbc_refresh_commit_after_max_operation   | 4000   | 
| Mirror_commit_after_max_operations   | 4000   | 
| Mirror_global_disk_quota_gb   | 9223372036854775807   | 
| Mirror_interim_commit_threshols   | 100   | 
| Userexit_max_lob_size_kb   | 2097151   | 
| Mirror_commit_on_transaction_boundary   | False   | 

* 数据类型转换对照表

IIDR 在同步全量数据之前，需要在 TiDB 侧创建好表结构，表字段对应关系如下表：

| DB2字段类型   | TiDB字段类型   | 
|:----|:----:|
| L   | date   | 
| T   | time   | 
| Z   | timestamp（6）   | 
| A   | varchar   | 
| P   | Decimal   | 
| S   | decimal   | 
| O   | varchar   | 

## 总结
IIDR 是目前能够找到的唯一一款能够比较好的将 DB2 的数据同步到 TiDB 的工具，在同步过程中如遇到上述配置还解决不了的问题，请联系 IIDR 官方或者 TiDB 官方，具体问题具体分析解决。
