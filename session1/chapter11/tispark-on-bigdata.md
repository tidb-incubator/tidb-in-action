作为新兴的存储引擎，TiDB虽然在架构上比大多数传统主流的大技术体系要相对优雅和先进，但由于技术生态以及迁移成本等问题，不可能在短时间内取而代之，因此必然面临和前辈共处一室的尴尬场景。毕竟谁也拉不下面子把自己辛苦收集和处理的数据再抽取一次丢给对方使用，但老板又说要实现数据协同效应，怎么办呢？下面介绍一些皆大欢喜的解决办法。  
# 与Hive表混和读写  
但凡有些规模和积累的公司一定不会对基于Hadoop集群的Hive表陌生，毕竟廉价，稳定且成熟。但Hive表不适合存放频繁变化的数据，而这却是TiDB的强项，这就导致了多业务公司可能既有Hadoop集群又有TiDB集群。要实现完美的混和访问，我们希望达到以下两个核心目标：  
1，对业务SQL来讲，不能有Hive/TiDB表的区分，都按库名+表名进行访问，不要有多余操作；    
2，由于访问Hive表可能需要消耗巨大资源，因此最好可以使用与之配套的计算集群资源。  
以下是其中一个具体的例子。   
## 使用beeline+Livy+Spark+Tispark实现混访    
### 软件环境清单：     
1，Livy服务，版本：基于0.6版本的改动版，作用：提交原始任务到Spark客户端；    
2，beeline客户端，版本：3.1.1，作用：连接Livy服务的客户端；    
3，Spark客户端，版本：2.4.0，作用：向yarn集群提交Spark作业；     
4，Tispark Jar包，版本：2.1.8，作用：提供与TiKV交互的能力；    
5，yarn集群，作用：提供计算资源。     
### 函数封装代码：   
``` 
function runMixSQLOnLivy(){  
export HIVE_HOME=/usr/local/share/apache-Hive-3.1.1-bin  
/usr/local/share/apache-Hive-3.1.1-bin/bin/beeline -n hdfs_user_name -p hdfs_user_pwd --verbose=false --color=false \  
     -u "jdbc:Hive2://bj0000,bj0001,bj0002:2222/;serviceDiscoveryMode=zooKeeper;zooKeeperNamespace=mix-livy" \  
     --Hiveconf livy.session.conf.spark.sql.extensions=org.apache.spark.sql.TiExtensions \  
     --Hiveconf livy.session.conf.spark.tispark.pd.addresses=10.10.10.10:2379,10.10.10.10:2379,10.10.10.10:2379 \  
     --Hiveconf livy.session.conf.spark.jars=hdfs://com-hdfs/user/spark/tispark-core-2.1.4-spark_2.4-jar-with-dependencies.jar \  
     --Hiveconf livy.session.name=session_name_${RANDOM}_$2 \  
     --Hiveconf livy.session.queue=your_yarn_queue_name \  
     -e "$1"  
}  
```   
### 封装函数说明：   
1，上述函数为封装的shell脚本函数，接收2个参数，$1是SQL代码，$2是可选的参数用以进行任务标识，本身使用了$RANDOM保证session名称不重复；       
2，beeline本身支持多种用户认证的方式，因此可以根据环境的具体情况变化，详情不在这里讲述。这里使用的是使用hdfs用户来认证；     
3，-u是指JDBC URL，用来连接livy服务；  
4，TiDB相关参数（请马老师看是否补充说明）：    
   a) spark.sql.extensions=org.apache.spark.sql.TiExtensions   
   b) spark.tispark.pd.addresses=10.10.10.10:2379,10.10.10.10:2379,10.10.10.10:2379  
   c) spark.jars=hdfs://com-hdfs/user/spark/tispark-core-2.1.4-spark_2.4-jar-with-dependencies.jar    
5，livy.session.name需要保证唯一，因此加了随机数及$2；  
6，livy.session.queue是yarn的队列名称；  
7，如果不加 -e "$1" 即可以实现交互查询。  
### 实际效果演示：  
#### 查看库：
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
上面sales_db是Hive库，db_em及以下是TiDB库。   
#### 单独查询TiDB库表：  
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
#### 单独查Hive表：  
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
#### 混全查询并写入Hive表: 
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
检查结果：  
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
### 改进地方：    
#### 写回TiDB     
目前直接写回TiDB理论上是可以实现的，但因暂时没有需求，因此未去实现。最直观的办法是把结果写到hdfs目录后入库TiDB。请马老师补充这部分的说明。   
#### 库重名问题      
目前尚未进行验证Hive库名和TiDB库名重复了会怎么样，请马老师补充这部分。   

# 与HBase表混和读写   
待补充   
# 与ClickHouse表混和读写  
待补充   
# 与Druid表混和读写  
待补充   
# 与ES表混和读写  
待补充   
