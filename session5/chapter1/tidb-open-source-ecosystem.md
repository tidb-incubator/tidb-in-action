# TiDB 开源生态介绍

## TiDB 相关项目

### [tidb-server](https://github.com/pingcap/tidb)

[tidb-server](https://github.com/pingcap/tidb) 为整个 TiDB 分布式数据库的 SQL 处理层。 
这一层最重要的工作是处理用户请求，执行 SQL 运算逻辑，用户的 SQL 请求会直接或者通过 Load Balancer 发送到 tidb-server 
tidb-server 会解析 MySQL Protocol Packet，获取请求内容，然后做语法解析、查询计划制定和优化、执行查询计划获取和处理数据。
tidb-server 是无状态节点，本身并不存储数据，数据全部存储在 TiKV 集群中，所以在这个过程中 tidb-server 需要和 TiKV Server 交互，
获取数据。最后 tidb-server 需要将查询结果返回给用户。 

### [PD](https://github.com/pingcap/pd)

[PD](https://github.com/pingcap/pd) ( Placement Driver ) 是 TiDB 里面全局中心总控节点，它负责整个集群的调度，负责全局 ID 的生成，以及全局时间戳 TSO 的生成等。
PD 还保存着整个集群 [TiKV](https://github.com/tikv/tikv) 的元信息，负责给 client 提供路由功能。

### [Parser](https://github.com/pingcap/parser)

[Parser](https://github.com/pingcap/parser) 是由 [Yacc](http://dinosaur.compilertools.net/) 生成的解析器，并且与 MySQL 语法高度兼容。Parser 的功能是把 SQL 语句按照 SQL 语法规则进行解析，
将文本转换成抽象语法树（AST）。

### [TiSpark](https://github.com/pingcap/parser)

[TiSpark](https://github.com/pingcap/tispark) 是 PingCAP 为解决用户复杂 OLAP 需求而推出的产品。它借助 [Spark](https://spark.apache.org/) 平台，
同时融合 [TiKV](https://github.com/tikv/tikv) 分布式集群的优势，和 TiDB 一起为用户一站式解决 HTAP (Hybrid Transactional/Analytical Processing) 的需求。
TiSpark 依赖于 TiKV 集群和 Placement Driver (PD)，也需要你搭建一个 Spark 集群。

## TiKV 相关项目

### [TiKV](https://github.com/tikv/tikv)

TiKV 是一个分布式、支持事物的 K-V 数据库。它通过 [RocksDB](https://rocksdb.org/) 进行本地储存，使用 Raft 协议来维护一致性，依照 Percolator 事务模型。在 Raft 和 pd-server 的帮助下，它能够支持横向扩展和异地副本。它既能够作为普通的分布式 K-V 数据库使用，也提供了能够满足 ACID 的事务接口。TiDB 使用它完成底层储存、分布式下推计算。与此同时， TiKV 也提供 java、c 等客户端库可供使用。

### [grpc-rs](https://github.com/tikv/grpc-rs)

grpc-rs 是为 [gRPC Core](https://github.com/grpc/grpc) 提供的 rust 包装层。它已经支持了朴素的异步调用、流式调用、SSL等常用功能。TiKV 使用它完成与 TiDB 中其他部分的通信。

### [raft-rs](https://github.com/tikv/raft-rs)

raft-rs 是 Raft 协议的 rust 实现。它借鉴了 [etcd 的 Raft 实现](https://github.com/etcd-io/etcd/tree/master/raft)的设计。

### [rust-rocksdb](https://github.com/tikv/rust-rocksdb)

rust-rocksdb 是 [Rocksdb](https://rocksdb.org/) 的 rust 包装层。为 Rust 应用程序提供了方便易用的使用 [Rocksdb](https://rocksdb.org/) 的方式。TiKV 使用它完成硬盘存储。

### [rust-prometheus](https://github.com/tikv/rust-prometheus)

rust-prometheus 是为 rust 应用设计的 [Prometheus](https://prometheus.io/) instrumentation 库。赋予 Rust 程序接入 [Prometheus](https://prometheus.io/) 的能力。

### [pprof-rs](https://github.com/tikv/pprof-rs)

pprof-rs 是 rust 程序在线 profiling 工具。TiKV 使用它提供了在线 profiling、采样生成火焰图的能力。

## Tools 相关项目

### [TiDB Lightning](https://github.com/pingcap/tidb-lightning)

TiDB Lightning 是一个将全量数据高速导入到 TiDB 集群的工具，其特点是将 DDL 和其他数据记录分离开，DDL 依旧通过 TiDB 进行执行，而其他数据则直接通过 KV 的形式导入到 TiKV 内部。支持 Mydumper 或 CSV 输出格式的数据源，尤其适用于对于需要从 MySQL 将大量数据导入到 TiDB 上的场景。

### [Dumpling](https://github.com/pingcap/dumpling)

Dumpling 是 Mydumper 的替代工具，能够从任何兼容 MySQL 协议的的数据库中导出数据，Dumpling 的导出速度和 Mydumper 不相上下，由于能够生成二进制的输出文件，在使用 Lightning 将数据导入到 TiDB 时会加快速度。此外，Dumpling 还支持云存储功能。

### [ticdc](https://github.com/pingcap/ticdc)

ticdc 是一个 TiDB 的事件日志复制工具，用于数据备份，下游支持 MySQL, TiDB, Kafka 等。ticdc 会捕获上游 TiKV 的 KV 变化日志，将其还原为 SQL 之后由下游的 MySQL 或 TiDB 进行消费；写入 Kafka 的 KV 日志会在 Kafka 的下游进行 SQL 还原。

### [DM](https://github.com/pingcap/dm)

DM 是一体化的数据同步任务管理平台，能够支持从 MySQL 到 TiDB 的全量数据同步，主要包括 DM-master, DM-worker 和 dmctl 三个组件，其中 DM-master 负责管理和调度数据同步任务的各项操作，DM-worker 负责执行具体的数据同步任务，dmctl 用于控制 DM 集群。上游 MySQL 产生的 binlog 由 DM-worker 进行消费后插入到下游的 TiDB 里。

### [BR](https://github.com/pingcap/br)

BR 是 TiDB 专用的备份恢复工具，BR 的备份和恢复速度都远超过一般通过 SQL 进行的数据备份恢复，适合在大数据量场景下使用。在备份时，BR 会从 PD 服务器获取一个时间戳作为备份时间点，TiKV 会将自己节点上所有 region leader 中符合要求的 KV 写入给定的路径生成 sst 文件，恢复时，TiKV 会读取其生成的 sst 文件，并且通过 Raft 协议保证数据的一致性。

### [tidb-binlog](https://github.com/pingcap/tidb-binlog)

tidb-binlog 是 TiDB 的 binlog 搜集工具，TiDB 中执行成功的 SQL 会被 Pump 实时记录，Drainer 会从 Pump 中收集 binlog 并进行归并后同步给下游，Tidb Binlog 组件能够对接 TiDB, MySQL, Kafka，是基于 SQL 的数据备份和同步方案。
