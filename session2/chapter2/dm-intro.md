# 一体化数据同步平台 DM

`DM`是一体化的数据同步任务管理平台，能够支持从`MySQL`到`TiDB`的全量数据同步，主要包括`DM-master`, `DM-worker`和`dmctl`三个组件，其中`DM-master`负责管理和调度数据同步任务的各项操作，`DM-worker`负责执行具体的数据同步任务，`dmctl`用于控制`DM`集群。上游`MySQL`产生的`binlog`由`DM-worker`进行消费后插入到下游的`TiDB`里。
