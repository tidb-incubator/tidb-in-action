# TiDB 开源社区主要项目介绍

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
