# 使用
用户可以使用TiDB或者TiSpark读取TiFlash，TiDB适合用于中等规模的OLAP计算，而
TiSpark适合大规模的OLAP计算，用户可以根据自己的场景和使用习惯自行选择。

## 按表构建TiFlash副本
TiFlash接入TiKV集群后，默认不会开始同步数据，可通过mysql客户端向TiDB发送DDL命令来为特定的表建立TiFlash副本:
```
ALTER TABLE ​table_name​ SET TIFLASH REPLICA ​count​ [LOCATION LABELS location_labels​]
```
count表示副本数，0则表示删除
location_labels为一组由用户指定字符串用于标识label，是为了pd调度的topology隔离，可以不填
对于相同表的多次DDL命令，仅保证最后一次能生效
例如:
为表建立1个TiFlash副本并带有2个locationlabel
```
ALTER TABLE `tpch50`.`lineitem` SET TIFLASH REPLICA 1 LOCATION LABELS "zone", "rack"
```

为表建立2个副本，无locationlabel
```
ALTER TABLE `tpch50`.`partsupp` SET TIFLASH REPLICA 2
```
删除副本
```
ALTER TABLE `tpch50`.`lineitem` SET TIFLASH REPLICA 0
```
可通过如下SQL语句查看特定表(通过WHERE语句指定，去掉WHERE语句则查看所有表)的TiFlash副本的状态:
```
SELECT * FROM information_schema.tiflash_replica WHERE TABLE_SCHEMA = '<db_name>' and TABLE_NAME = '<table_name>'
```
查询结果中的AVAILABLE字段表示该表的TiFlash副本是否可用。
注意事项:
假设有一张表t已经通过上述的DDL语句同步到TiFlash，则通过以下语句创建的表也会自动同步到TiFlash:
```
CREATE TABLE table_name like t
```

## TiDB读取TiFlash
TiDB提供三种读取TiFlash副本的方式。如果添加了TiFlash副本，而没有做任何engine的配置，则默认使用CBO方式。


## CBO
对于创建了TiFlash副本的表，TiDB的CBO优化器会自动根据代价选择是否使用TiFlash副本，具体有没有选择TiFlash副本，可以通过explainanalyze语句查看，见下图:
![1.png](/res/session1/chapter9/tiflash-in-action/1.png)


## Engine隔离
Engine隔离是通过配置变量来指定所有的查询均使用指定engine的副本，可选engine为tikv和tiflash，分别有3个配置级别:
1. 全局配置级别，即GLOBAL级别。

```
set @@global.tidb_isolation_read_engines = "逗号分隔的 engine list"; 
```
或者
```
set GLOBAL tidb_isolation_read_engines = "逗号分隔的 engine list";
```

例如：

```
set GLOBAL tidb_isolation_read_engines = "tiflash,tikv";
```

2. 会话级别，即SESSION级别。如果没有指定，会继承GLOBAL的配置。set@@session.tidb_isolation_read_engines="逗号分隔的enginelist";或者

`set SESSION tidb_isolation_read_engines = "逗号分隔的 engine list";`

3. TiDB实例级别，即INSTANCE级别，和以上配置是​交集​关系。比如INSTANCE配置了"tikv,tiflash"，而SESSION配置了"tikv"，则只会读取tikv。如果没有指定，默认继承会话级别配置。在TiDB的配置文件添加如下配置项

```
[isolation-read]
engines = ["tikv", "tiflash"]
```

默认值为"tikv,tiflash"，即可以同时读取tikv和tiflash副本，CBO会自动选择。
指定了engine后，对于查询中的表没有对应engine副本的情况(因为tikv副本是必定存在的，因此只有配置了engine为tiflash而tiflash副本不存在这一种情况)，查询会报该表不存在该engine副本的错。
Engine隔离的优先级高于CBO，即CBO仅会选取指定engine的副本。

## 手工Hint
手工hint可以强制TiDB对于某张或某几张表使用TiFlash副本，其优先级高于CBO和
engine隔离，使用方法为:

```
select /*+ read_from_storage(tiflash[t]) */ * from t;
```

同样的，对于指定hint的表，如果没有tiflash副本，查询会报该表不存在该tiflash副本的错。

## TiSpark读取TiFlash

TiSpark目前提供类似TiDB中engine隔离的方式读取TiFlash，方式是通过配置参数:
spark.tispark.use.tiflash为true(或false)
可以使用以下任意一种方式进行设置:

1. 在spark-defaults.conf文件中添加spark.tispark.use.tiflashtrue

2. 在启动sparkshell或thriftserver时，启动命令中添加--conf spark.tispark.use.tiflash=true

3. Sparkshell中实时设置:spark.conf.set("spark.tispark.use.tiflash",true)

4. Thriftserver通过beeline连接后实时设置:setspark.tispark.use.tiflash=true;

注意，设为true时，所有查询的表都会只读取TiFlash副本，设为false则只读取TiKV副本。设为true时，要求查询所用到的表都必须已创建了TiFlash副本，对于未创建TiFlash副本的表的查询会报错。
