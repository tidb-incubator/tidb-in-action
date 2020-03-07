# 开源项目简介

## Tools

### 分布式导出工具 Dumpling

[`Dumpling`](https://github.com/pingcap/dumpling)是`Mydumper`的替代工具，能够从任何兼容`MySQL`协议的的数据库中导出数据，`Dumpling`的导出速度和`Mydumper`不相上下，由于能够生成二进制的输出文件，在使用`Lightning`将数据导入到`TiDB`时会加快速度。此外，`Dumpling`还支持云存储功能。

### TiDB 数据导入工具 Lightning

[`TiDB Lightning`](https://github.com/pingcap/tidb-lightning)是一个将全量数据高速导入到`TiDB`集群的工具，其特点是将`DDL`和其他数据记录分离开，`DDL`依旧通过`TiDB`进行执行，而其他数据则直接通过`KV`的形式导入到`TiKV`内部。支持`Mydumper`或`CSV`输出格式的数据源，尤其适用于对于需要从`MySQL`将大量数据导入到`TiDB`上的场景。

### 增量数据订阅 CDC

[`ticdc`](https://github.com/pingcap/ticdc) 是一个`TiDB`的事件日志复制工具，用于数据备份，下游支持`MySQL`, `TiDB`, `Kafka`等。`ticdc`会捕获上游`TiKV`的`KV`变化日志，将其还原为`SQL`之后由下游的`MySQL`或`TiDB`进行消费；写入`Kafka`的`KV`日志会在`Kafkf`的下游进行`SQL`还原。

### 一体化数据同步平台 DM

[`DM`](https://github.com/pingcap/dm)是一体化的数据同步任务管理平台，能够支持从`MySQL`到`TiDB`的全量数据同步，主要包括`DM-master`, `DM-worker`和`dmctl`三个组件，其中`DM-master`负责管理和调度数据同步任务的各项操作，`DM-worker`负责执行具体的数据同步任务，`dmctl`用于控制`DM`集群。上游`MySQL`产生的`binlog`由`DM-worker`进行消费后插入到下游的`TiDB`里。

### 分布式备份恢复工具 BR

[`BR`](https://github.com/pingcap/br)是`TiDB`专用的备份恢复工具，`BR`的备份和恢复速度都远超过一般通过`SQL`进行的数据备份恢复，适合在大数据量场景下使用。在备份时，`BR`会从`PD`服务器获取一个时间戳作为备份时间点，`TiKV`会将自己节点上所有 region leader 中符合要求的`KV`写入给定的路径生成`sst`文件，恢复时，`TiKV`会读取其生成的`sst`文件，并且通过`raft`协议保证数据的一致性。
