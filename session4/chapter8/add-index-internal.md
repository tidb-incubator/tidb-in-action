# 8.3.1 TiDB 增加索引原理

在普通关系型数据库中增加索引通常会有时间过长，锁表等风险。特别是在一张频繁更新的海量数据表加索引时候，风险变得很大且不可控。TiDB 的 DDL 通过实现 Google F1 的在线异步 schema 变更算法，来完成在分布式场景下的无锁，在线 schema 变更。从TiDB 2.1开始实现了并行DDL，新增了添加索引队列（add index job queue）以及添加索引执行（add index worker）用以加速增加索引的执行速度，整个添加索引流程如下图：

![图片](https://uploader.shimo.im/f/gniP9JygA9AG4NHH.png!thumbnail)


添加索引主要有两个核心操作:

  1. 将索引信息添加进表中。 
   2. 将已有了的数据行，构建成索引。

添加索引主要流程

  1. 客户端发送添加索引请求到TiDB，TiDB会检查表、索引等是否符合规范。
   2. 将添加索引请求转化成Job发送到添加索引的队列中（add index job queue）。
   3. TiDB会启动Worker，将Job从添加索引的队列中取出，并且写入到对应表信息中。
   4. 这时候Worker从PD中获取需要添加表的所有region范围，并且默认分成256个子Job，并发的去扫region中的所有数据，根据生成索引信息。
   5. 当所有子Job都完成之后，会将该Job放入 历史队列中（history ddl job）。 
