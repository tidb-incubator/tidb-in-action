## 11.4 TiSpark 结合大数据体系
作为新兴的存储引擎，TiDB 虽然在架构上比大多数传统主流的大技术体系要相对优雅和先进，但由于技术生态以及迁移成本等问题，不可能在短时间内取而代之，因此必然面临和前辈共处一室的尴尬场景。毕竟谁也拉不下面子把自己辛苦收集和处理的数据再抽取一次丢给对方使用，但老板又说要实现数据协同效应，怎么办呢？下面介绍一些皆大欢喜的解决办法。  
### 11.4.1 与 Hive 表混和读写
但凡有些规模和积累的公司一定不会对基于 Hadoop 集群的 Hive 表陌生，毕竟廉价，稳定且成熟。但 Hive 表不适合存放频繁变化的数据，而这却是 TiDB 的强项，这就导致了很多业务公司可能既有 Hadoop 集群又有 TiDB 集群。要实现完美的混和访问，我们希望达到以下三个核心目标：  
1. 对业务 SQL 来讲，不能有 Hive/TiDB 表的区分，都按库名+表名进行访问，不要有多余操作。
2. 由于访问 Hive 表可能需要消耗巨大资源，因此最好可以使用与之配套的计算集群资源。
3. 确保 hive-site.xml 能够被 Spark 访问到，例如 hive-site.xml 复制到 SPARK_HOME/conf 下。hive-site.xml 中包含了 Hive Metastore 相关信息，只有 Spark 可以读取它，才能访问 Hive 中的数据。

下节将用一个具体的例子进行阐述。   

### 11.4.2 使用 beeline + Livy + Spark + Tispark 实现混访    
1. 软件环境清单：     
	* Livy 服务，版本：基于 0.6 版本的改动版，作用：提交Spark任务到yarn集群；
	* beeline 客户端，版本：3.1.1，作用：连接 Livy 服务的客户端；
	* Spark 客户端，版本：2.4.0，作用：提供Spark引擎相关能力；     
	* Tispark Jar 包，版本：2.1.8，作用：提供与 TiKV 交互的能力；    
	* YARN 集群，作用：提供计算资源并执行任务。     

2. 函数封装代码：   
``` 
function runMixSQLOnLivy(){  
export HIVE_HOME=/usr/local/share/apache-Hive-3.1.1-bin 
/usr/local/share/apache-Hive-3.1.1-bin/bin/beeline -n hdfs_user_name -p hdfs_user_pwd --verbose=false --color=false \  
     -u "jdbc:Hive2://bj0000,bj0001,bj0002:2222/;serviceDiscoveryMode=zooKeeper;zooKeeperNamespace=mix-livy" \  
     --Hiveconf livy.session.conf.spark.sql.extensions=org.apache.spark.sql.TiExtensions \  
     --Hiveconf livy.session.conf.spark.tispark.pd.addresses=10.10.10.11:2379,10.10.10.12:2379,10.10.10.13:2379 \  
     --Hiveconf livy.session.conf.spark.jars=hdfs://com-hdfs/user/spark/tispark-core-2.1.4-spark_2.4-jar-with-dependencies.jar \  
     --Hiveconf livy.session.name=session_name_${RANDOM}_$2 \  
     --Hiveconf livy.session.queue=your_yarn_queue_name \  
     -e "$1"  
}  
```   
3. 封装函数说明：   
	* 上述函数为封装的 shell 脚本函数，接收 2 个参数，$1 是 SQL 代码，$2 是可选的参数用以进行任务标识，本身使用了 $RANDOM 保证 session 名称不重复；
	* beeline 本身支持多种用户认证的方式，因此可以根据环境的具体情况变化，详情不在这里讲述。这里使用的是使用 hdfs 用户来认证；     
	* -u 是指 JDBC URL，用来连接 livy 服务；
	* TiDB 相关参数：
	   a) spark.sql.extensions=org.apache.spark.sql.TiExtensions   
	   b) spark.tispark.pd.addresses=10.10.10.11:2379,10.10.10.12:2379,10.10.13.10:2379  
	   c) spark.jars=hdfs://com-hdfs/user/spark/tispark-core-2.1.4-spark_2.4-jar-with-dependencies.jar    
	* livy.session.name 需要保证唯一，因此加了随机数及$2；  
	* livy.session.queue 是 YARN 的队列名称；  
	* 如果不加 -e "$1" 即可以实现交互查询。  

4. 实际效果演示：  
(1) 查看库：
```
0: jdbc:Hive2://bj0000,bj0001,bj0002:2222/> show databases;
+----------------------------------------------------+    
|                    databaseName                    |  
+----------------------------------------------------+  
| sales_db                                           |  
| db_em                                              |  
| db_test                                            |  
| db_shr                                             |  
+----------------------------------------------------+  
```
上面 sales_db 是 Hive 库，db_em 及以下是 TiDB 库。   
(2) 单独查询 TiDB 库表：
```
0: jdbc:Hive2://bj0000,bj0001,bj0002:2222/> select count(1) from db_em.app_war_room_fpyr_rt;   
RSC client is executing SQL query: select count(1) from db_em.app_war_room_fpyr_rt, statementId = 91583fc3-0837-4b26-b579-b438a53f151e, session = SessionHandle [b6933d96-8ec0-47b9-a767-ff2da5c5b2b2]    
[Stage 0:>                                                          (0 + 1) / 1]     
+-----------+   
| count(1)  |   
+-----------+   
| 224       |   
+-----------+   
1 row selected (6.505 seconds)   
```
(3) 单独查 Hive 表：  
```
0: jdbc:Hive2://bj0000,bj0001,bj0002:2222/> select count(1) from sales_db.mdms_tsqa_syyt;   
RSC client is executing SQL query: select count(1) from sales_db.mdms_tsqa_syyt, statementId = 324d7d1d-03bc-4d9b-849f-18967305a454, session = SessionHandle [b6933d96-8ec0-47b9-a767-ff2da5c5b2b2]   
[Stage 2:>                                                        (0 + 1) / 151]
...  
[Stage 3:>                                                          (0 + 0) / 1]    
+------------+   
|  count(1)  |   
+------------+   
| 142380109  |   
+------------+    
1 row selected (25.169 seconds) 
```
(4) 混和查询并写入 Hive 表: 
```
0: jdbc:Hive2://bj0000,bj0001,bj0002:2222/> insert into dc_tmp.test_for_mix  select count(1) as cnt from sales_db.mdms_tsqa_syyt union select count(1) as cnt from db_em.app_war_room_fpyr_rt;    
RSC client is executing SQL query: insert into dc_tmp.test_for_mix  select count(1) as cnt from sales_db.mdms_tsqa_syyt union select count(1) as cnt from db_em.app_war_room_fpyr_rt, statementId = 7e87c512-d5c5-4ba1-bd62-d013ff16a4e7, session = SessionHandle [b6933d96-8ec0-47b9-a767-ff2da5c5b2b2]    
[Stage 5:>                                                        (0 + 0) / 151]     
......    
[Stage 10:>                                                         (0 + 0) / 1]    
+---------+    
| Result  |   
+---------+       
+---------+      
No rows selected (31.221 seconds)  
```
(5) 检查结果：  
```
0: jdbc:Hive2://bj0000,bj0001,bj0002:2222/> select cnt from dc_tmp.test_for_mix;     
RSC client is executing SQL query: select cnt from dc_tmp.test_for_mix, statementId = 18247b15-d9fb-4b97-87a1-6fa9cc3afad8, session = SessionHandle [b6933d96-8ec0-47b9-a767-ff2da5c5b2b2]    
[Stage 11:>                                                         (0 + 1) / 1]    
......    
[Stage 11:>                                                         (0 + 1) / 1]    
+------------+   
|    cnt     |   
+------------+    
| 142380109  |    
| 224        |    
+------------+    
2 rows selected (2.977 seconds)    
```
可以看到是成功的实现了混和访问，对业务逻辑来说，数据在Hive库或者在TiDB库没有任何感知。  

### 11.4.3 改进地方：
#### 1. 写回TiDB    
TiDB 4.0 实现大事务支持之前，TiSpark 没有理想的方案支持向 TiDB 原生写入数据的方案。用户可以选择的是：  
* 使用 Spark 原生的 JDBC 方案，将 TiDB 当做 MySQL 写入数据，具体方案请参考[文档](https://github.com/pingcap/tispark#write-data-to-tidb-using-tidb-connector)。这个方案的缺陷是，数据必须被拆分为小批次插入，而这些批次之间无法维持事务原子性。换句话说，如果插入在中途失败，那么已经写入的数据并不会自动回滚，而需要人工干预。  
* 第二个方案是使用 TiSpark 的[大批写入](https://github.com/pingcap/tispark/blob/master/docs/datasource_api_userguide.md)，这个方案可以导入大量数据且维持事务的原子性，但是由于缺少锁表和大事务支持，并不推荐在生产环境使用。 

在 TiSpark 完成对应 TiDB 4.0 大事务对应的支持后，用户就可以使用 TiSpark 作为一种主要的 TiDB 跑批方案，无论是向 TiDB 写入还是由 TiDB 向其他系统写出。在本文写作的时间点，此功能尚未完成，如有相关需要，请关注官方 [Github 页面](https://github.com/pingcap/tispark)更新 TiSpark 版本。

#### 2. 库重名问题      
TiDB 和 Hive 重名的情况，需要为 TiSpark 开启表名前缀模式，该模式会为所有 TiDB 表在 TiSpark 中加入前缀（而并不会改变 TiDB 内实际的表名）。例如，希望 TiDB 表在 TiSpark 中以 tidb_ 作为前缀使用，则增加如下配置（这并不会实际改变 TiDB 的表名）：
```
spark.tispark.db_prefix  "tidb_"
```

### 11.4.4TiSpark 与其他系统协同
由于 TiSpark 没有直接修改 Apache Spark 代码，因此 Spark 原生兼容的大多数功能仍可正常运行。可以参考 Apache Spark 如何访问各个系统的文档正常使用，这里不做赘述。
