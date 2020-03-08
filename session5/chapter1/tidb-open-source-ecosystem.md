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
