# 使用
用户可以使用 TiDB 或者 TiSpark 读取 TiFlash，TiDB 适合用于中等规模的 OLAP 计算，而
TiSpark 适合大规模的 OLAP 计算，用户可以根据自己的场景和使用习惯自行选择。

## TiDB 读取 TiFlash
TiDB 提供三种读取 TiFlash 副本的方式。如果添加了 TiFlash 副本，而没有做任何 engine 的 配置，则默认使用 CBO 方式。


## CBO
对于创建了 TiFlash 副本的表，TiDB 的 CBO 优化器会自动根据代价选择是否使用 TiFlash 副 本，具体有没有选择 TiFlash 副本，可以通过 explain analyze 语句查看，见下图:
![1.png](/res/session1/chapter9/tiflash-in-action/1.png)


## Engine 隔离
Engine 隔离是通过配置变量来指定所有的查询均使用指定 engine 的副本，可选 engine 为 tikv 和 tiflash，分别有 3 个配置级别:
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

2. 会话级别，即SESSION级别。如果没有指定，会继承GLOBAL的配置。 set @@session.tidb_isolation_read_engines = "逗号分隔的 engine list"; 或者

`set SESSION tidb_isolation_read_engines = "逗号分隔的 engine list";`

3. TiDB 实例级别，即 INSTANCE 级别，和以上配置是 ​交集​ 关系。比如 INSTANCE 配 置了 "tikv, tiflash"，而 SESSION 配置了 "tikv"，则只会读取 tikv。如果没有指定，默 认继承会话级别配置。在 TiDB 的配置文件添加如下配置项

```
[isolation-read]
engines = ["tikv", "tiflash"]
```

默认值为"tikv, tiflash"，即可以同时读取 tikv 和 tiflash 副本，CBO 会自动选择。
指定了 engine 后，对于查询中的表没有对应 engine 副本的情况(因为 tikv 副本是必定存在 的，因此只有配置了 engine 为 tiflash 而 tiflash 副本不存在这一种情况)，查询会报该表不存 在该 engine 副本的错。
Engine 隔离的优先级高于 CBO，即 CBO 仅会选取指定 engine 的副本。

## 手工 Hint
手工 hint 可以强制 TiDB 对于某张或某几张表使用 TiFlash 副本，其优先级高于 CBO 和
engine 隔离，使用方法为:

```
select /*+ read_from_storage(tiflash[t]) */ * from t;
```

同样的，对于指定 hint 的表，如果没有 tiflash 副本，查询会报该表不存在该 tiflash 副本的 错。

## TiSpark 读取 TiFlash

TiSpark 目前提供类似 TiDB 中 engine 隔离的方式读取 TiFlash，方式是通过配置参数: spark.tispark.use.tiflash
为 true(或 false)
可以使用以下任意一种方式进行设置:

1. 在spark-defaults.conf文件中添加spark.tispark.use.tiflashtrue
2. 在启动 spark shell 或 thrift server 时，启动命令中添加 --conf
spark.tispark.use.tiflash=true
3. Spark shell 中实时设置:spark.conf.set("spark.tispark.use.tiflash", true)
4. Thrift server 通过 beeline 连接后实时设置:set spark.tispark.use.tiflash=true;
注意，设为 true 时，所有查询的表都会只读取 TiFlash 副本，设为 false 则只读取 TiKV 副 本。设为 true 时，要求查询所用到的表都必须已创建了 TiFlash 副本，对于未创建 TiFlash 副 本的表的查询会报错。
