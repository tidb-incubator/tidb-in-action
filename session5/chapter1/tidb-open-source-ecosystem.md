# TiDB 开源社区主要项目介绍 

## TiKV 相关项目

### TiKV

TiKV 是一个分布式、支持事物的 K-V 数据库。它通过 RocksDB 进行本地储存，使用 Raft 协议来维护一致性，依照 Percolator 事务模型。在 Raft 和 pd-server 的帮助下，它能够支持横向扩展和异地副本。它既能够作为普通的分布式 K-V 数据库使用，也提供了能够满足 ACID 的事务接口。TiDB 使用它完成底层储存、分布式下推计算。与此同时， TiKV 也提供 java、c 等客户端库可供使用。

### grpc-rs

grpc-rs 是为 [gRPC Core](https://github.com/grpc/grpc) 提供的 rust 包装层。它已经支持了朴素的异步调用、流式调用、SSL等常用功能。TiKV 使用它完成与 TiDB 中其他部分的通信。

### raft-rs

raft-rs 是 Raft 协议的 rust 实现。它借鉴了 [etcd 的 Raft 实现](https://github.com/etcd-io/etcd/tree/master/raft)的设计。

### rust-rocksdb

rust-rocksdb 是 Rocksdb 的 rust 包装层。为 Rust 应用程序提供了方便易用的使用 Rocksdb 的方式。TiKV 使用它完成硬盘存储。

### rust-prometheus

rust-prometheus 是为 rust 应用设计的 Prometheus instrumentation 库。赋予 Rust 程序接入 Prometheus 的能力。

### pprof-rs

pprof-rs 是 rust 程序在线 profiling 工具。TiKV 使用它提供了在线 profiling、采样生成火焰图的能力。
