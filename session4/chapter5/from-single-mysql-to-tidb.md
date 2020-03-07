## 5.1.1 DM 同步单机 MySQL 到 TiDB 的实践

[Data Migration (DM)](https://pingcap.com/docs-cn/stable/reference/tools/data-migration/overview/#dm-%e6%9e%b6%e6%9e%84) 是一款可以将 MySQL 实例数据实时同步到 TiDB 集群的 [开源产品](https://github.com/pingcap/dm)。

这一小节的实践目标是将 单机 MySQL 实例数据同步到 TiDB 集群。

主要包括以下8个小节的内容，所有提到的参数配置及说明基于 DM 1.0.2版本

* [1.DM 支持的场景](#1)
* [2.DM 使用要求](#2)
* [3.DM 同步原理](#3)
* [4.同步前置条件](#4)
* [5.制定同步规则的 task 文件配置](#5)
* [6.同步状态检查](#6)
* [7.同步过程中可能遇到的问题及如何解决](#7)
* [8.tips](#8)

<h3 id="1"> 1.DM 支持的场景 </h3>

* 全量&增量同步数据
* 不同维度的过滤规则设定：库表级别，SQL级别
* 上游分库分表合并及变更聚合，具体示例参见 [5.1.2 DM 同步分库分表 MySQL 到 TiDB 的实践]()
* 同步延迟监控

<h3 id="2"> 2.DM 使用要求</h3>

[官方详细说明](https://pingcap.com/docs-cn/stable/reference/tools/data-migration/overview/#%e4%bd%bf%e7%94%a8%e9%99%90%e5%88%b6)


* 数据库版本
	- 5.5 < MySQL 版本 < 8.0
	- MariaDB 版本 >= 10.1.2
* 仅支持 TiDB parser 支持的 DDL 语法
* 上下游 sql_model 检查
* 上游开启 binlog，且 binlog_format=ROW
* 关于分库分表合并场景的限制，参见 [5.1.2 DM 同步分库分表 MySQL 到 TiDB 的实践]()
* [如果 MySQL 实例通过 VIP 连接并且需要切换点这里](https://pingcap.com/docs-cn/stable/reference/tools/data-migration/usage-scenarios/master-slave-switch/#%E8%99%9A%E6%8B%9F-ip-%E7%8E%AF%E5%A2%83%E4%B8%8B%E5%88%87%E6%8D%A2-dm-worker-%E4%B8%8E-mysql-%E5%AE%9E%E4%BE%8B%E7%9A%84%E8%BF%9E%E6%8E%A5)

<h3 id="3"> 3.DM 同步原理</h3>

DM 以一个集群为单位运行，包括以下5个组成部分：

* DM-master，负责管理整个DM集群，以及调度同步任务
* DM-woker，执行具体的同步任务

	- 一个 DM-worker 注册为一个上游 MySQL 或 MariaDB 实例的slave
	- 一个 DM 集群中可以包含多个 DM-worker，也就是说可以同步上游多个 MySQL 或 MariaDB 实例
	- DM-worker 的工作方式是
		- Dumper 从上游 导出全量数据到本地磁盘
		- Loader 读取 dumper 处理单元的数据文件，然后加载到下游 TiDB
		- Syncer 读取 relay log 处理单元的 binlog event，将这些 event 转化为 SQL 语句，再将这些 SQL 语句应用到下游 TiDB	

* dmctl，控制DM集群的命令行工具，连接 DM-Master 管理整个集群
* task文件，配置 DM-worker 要执行的同步规则，所有 DM-worker 生效
* Prometheus，监控同步状态


<h3 id="4">  4.同步前置条件 </h3>

* 确认同步上下游部署结构

|组件|主机|端口号|
|:----:|:----:|:-----:|
|DM-Master|172.16.10.71|8261|
|DM-worker|172.16.10.72|8262|
|上游MariaDB|172.16.10.81|3306|
|下游TiDB的计算节点|172.16.10.83|4000|

* 确认同步目标

	- 将上游单机 MySQL 实例中的 book 库 session 表全量同步到下游 TiDB 中
	- 过滤系统库：mysql,information_schema,percona,performance_schema
	- 过滤删除操作：drop，truncate
	- 不同步 book 库的 draft 表

* [DM集群的部署启动文档](https://pingcap.com/docs-cn/stable/how-to/deploy/data-migration-with-ansible/)

	部署过程与TiDB集群的部署启动高度相似，inventory.ini 需要注意以下几点
	- [dm\_worker\_servers] 部分

			1.server_id 在整个同步结构里唯一，范围包括上游 MySQL，下游 TiDB
			2.source_id 在 task 任务配置里标示上游实例
			2.mysql_password 需要通过 dmctl 工具加密，这个密码在task文件里也需要用到
				eg: dm-ansible/resources/bin/dmctl -encrypt 密码串
			3.enable_gtid 是否使用 GTID 同步，前提是上游 MySQL 实例开启了 GTID，本案例里没有用到。
			4.这个部分完整的例子
			  [dm_worker_servers]
			  dm-worker1 ansible_host=1.1.1.1 source_id="mariadb-01" server_id=101 mysql_host=172.16.10.81 mysql_user=tidbdm mysql_password="encryptpwd" mysql_port=3306
				
				
* 同步用户需要上游 MySQL 实例访问授权
		
	- 需要权限有
			
			REPLICATION SLAVE,REPLICATION CLIENT,RELOAD,SELECT
		
* 下游[TiDB集群部署](https://github.com/pingcap-incubator/tidb-in-action/blob/master/session2/chapter1/tiup-deployment.md)及读写访问授权
* 同步需求分类，决定 task 文件的配置项复杂程度

	- 同步模式：全量，增量，仅备份
	
			这个例子里使用全量，先全量备份上游数据库，将数据全量导入到下游数据库，
			然后从全量数据备份时导出的位置信息 (binlog position) 开始通过 binlog 增量同步数据到下游数据库。
	
	- 同步粒度：整库，指定表，指定 Binlog
			
			这个例子里选整库，过滤上游系统库，过滤上游删库删表操作
	

<h3 id="5">  5.制定同步规则的 task 文件配置 </h3>

task 文件决定 DM-Worker 按照怎样的规格同步数据，主要有以下9个区域：

* 任务全局定义
	
		name: "taskname"     # 全局唯一的 task 名称
		task-mode: all       # 同步模式，这里选全量
		meta-schema: "dm_meta"   # checkpoint 信息存储在下游的数据库名
		remove-meta: true    # 是否在任务同步开始前移除该任务名对应的 checkpoint 信息，删除会重新开始同步，不删除会从上次停止的位置开始同步
		
* target-database，下游 TiDB 集群地址用户密码，密码与 DM-Worker 配置里的密码相同
* mysql-instances，上游 MySQL 实例 source-id 及同步规则模块名称

    	source-id: "mariadb-01"    # dm-worker 定义的 source-id 对应
    	route-rules: ["book-route-rules-schema", "book-route-rules"] # 需要同步的对应的库表配置名称
    	filter-rules: ["book-filter-1"]   # 需要过滤的 binlog event 配置名称
    	black-white-list:  "instance"     # 需要过滤的库表配置名称
    	
    	mydumper-config-name: "global"    # mydumper 配置名称
    	mydumper-thread: 4

    	loader-config-name: "global"      # loader 配置名称
    	loader-thread: 8

   	 	syncer-config-name: "global"      # syncer 配置名称
   		syncer-thread: 9
    	
* routes，需要同步的库表信息
		
		 book-route-rules-schema:
        	schema-pattern: "book"
        	target-schema: "book"
    	order-route-rules:
        	schema-pattern: "book"
        	table-pattern: "session"
        	target-schema: "book"
        	target-table: "session"
		
* filters，需要过滤的Binlog Event
	
		book-filter-1:
        	schema-pattern: "book"
        	table-pattern: "session"
        	events: ["truncate table", "drop table"]
        	action: Ignore

* black-white-list，需要过滤的库表

		instance:
    		do-dbs: ["~^book.*"]       
    		ignore-dbs: ["mysql", "performance_schema", "percona", "information_schema"]
    		ignore-tables: 
   			- db-name: "book.*"
      		  tbl-name: "draft"
    
* mydumpers，备份控制

		global:
        	mydumper-path: "./bin/mydumper"
        	threads: 4
        	chunk-filesize: 64
        	skip-tz-utc: true
        	
* loaders，备份导入控制

		global:
        	pool-size: 8
        	dir: "./dumped_data"
        	
* syncers，同步控制
		
		global:
        	worker-count: 8
        	batch: 100



<h3 id="6">  6.同步状态检查 </h3>

task 配置完成，通过 dmctl 工具检查执行同步

* 通过 dmctl 连接 DM-master 管理 task 任务

		./dmctl -master-addr 172.16.10.71:8261

* 首先检查任务配置是否符合规范
		
		>> check-task  task-path
		{
    		"result": true,
    		"msg": "check pass!!!"
		}
		
* 运行任务
		
		>> start-task  task-path
		{
     		"result": true,
     		"msg": "",
     		"workers": [
         		{
             		"result": true,
             		"worker": "172.16.10.72:8262",
            		"msg": ""
         		},
     		]
		}

* 查看详细任务状态，正常状态 result 为 true，worker 内的 binlog 位置一致，同步过程中也会展示同步百分比

		query-status  taskname
		
* 如果发现启动任务异常，查看详细的错误信息

		query-error taskname
		
* 停止任务

		start-task  taskname
* [其他详细的任务管理内容](https://pingcap.com/docs-cn/stable/reference/tools/data-migration/manage-tasks/)

<h3 id="7">  7.同步过程中可能遇到的问题及如何解决 </h3>

* 检查 task 失败，根据提示检查对应配置行是否有语法错误
* 启动失败，根据提示信息解决后，resume-task
* 同步过程中，因为 SQL 不兼容，或者异常问题导致复制中断，查看详细错误信息修复
* [Data Migration 常见错误修复](https://pingcap.com/docs-cn/stable/reference/tools/data-migration/troubleshoot/error-handling/)
* 举一个🌰

	- task 状态报错信息

		
			"msg": "[code=44003:class=schema-tracker:scope=downstream:level=high] current pos (mysql-bin.000010, 814332497): failed to create table for `db_1`.`tb_1` in schema tracker: [types:1067]Invalid default value for 'expire_time'
			
	- 查看上游 db\_1.tb\_1 报错字段定义

			expire_time  datetime NOT NULL DEFAULT '0000-00-00 00:00:00'
			
	- 查看下游列定义一致
	- 查看下游 sql_mode，严格模式下，datetime 类型默认值不能为 0000-00-00 00:00:00 
			
			STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION
	
	- 修改下游 sql_mode，重启 task 同步继续

<h3 id="8">  8.tips </h3>

* task 配置过滤规则与 MySQL 基本一致
* task 是否需要保留 meta 信息，决定任务重新启动后的 binlog 起点位置
* 配置[监控告警](https://pingcap.com/docs-cn/stable/reference/tools/data-migration/monitor/)，如果发现同步异常可以及时通知
* task 任务的配置也可以使用 [DM Portal](https://pingcap.com/docs-cn/stable/reference/tools/data-migration/dm-portal/) 工具自动生成
* DM-worker 需要配置[日志清理](https://pingcap.com/docs-cn/stable/reference/tools/data-migration/relay-log/)，清理同步完成的 Rely log 以及索引信息