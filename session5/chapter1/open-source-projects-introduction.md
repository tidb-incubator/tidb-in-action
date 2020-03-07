# TiDB 开源社区主要项目介绍 

* https://github.com/pingcap/tidb  

一般来说我们提到 TiDB 是指整个分布式数据库，包括 tidb-server/pd-server/tikv-server 三大组件，
此仓库为 tidb-server 组件的源码仓库，tidb-server 为整个分布式数据库的 SQL 层处理层。 
这一层最重要的工作是处理用户请求，执行 SQL 运算逻辑，用户的 SQL 请求会直接或者通过 Load Balancer 发送到 tidb-server，
tidb-server 会解析 MySQL Protocol Packet，获取请求内容，然后做语法解析、查询计划制定和优化、执行查询计划获取和处理数据。
tidb-server 是无状态节点，本身并不存储数据，数据全部存储在 TiKV 集群中，所以在这个过程中 tidb-server 需要和 tikv-server 交互，
获取数据。最后 tidb-server 需要将查询结果返回给用户。 

* https://github.com/pingcap/pd 

PD ( Placement Driver ) 是 TiDB 里面全局中心总控节点，它负责整个集群的调度，负责全局 ID 的生成，以及全局时间戳 TSO 的生成等。
PD 还保存着整个集群 TiKV 的元信息，负责给 client 提供路由功能。

* https://github.com/pingcap/tispark  

TiSpark 是 PingCAP 为解决用户复杂 OLAP 需求而推出的产品。它借助 [Spark](https://spark.apache.org/) 平台，
同时融合 [TiKV](https://github.com/tikv/tikv) 分布式集群的优势，和 TiDB 一起为用户一站式解决 HTAP (Hybrid Transactional/Analytical Processing) 的需求。
TiSpark 依赖于 TiKV 集群和 Placement Driver (PD)，也需要你搭建一个 Spark 集群。

* https://github.com/pingcap/parser  

Parser 是由 [Yacc](http://dinosaur.compilertools.net/) 生成的解析器，并且与 MySQL 语法高度兼容。Parser 的功能是把 SQL 语句按照 SQL 语法规则进行解析，
将文本转换成抽象语法树（AST）。

* https://github.com/pingcap/tidb-ctl  

tidb-ctl 是 tidb-server 的命令行工具，用于获取 TiDB 状态信息，多用于调试。

* https://github.com/pingcap/tipb 

tipb 仓库主要用来存储 tidb-server [protobuf](https://developers.google.com/protocol-buffers) 文件。TiDB 使中用 [gRPC](https://grpc.io/) 作为通信协议，
此仓库用来保存 tidb-server 组件中使用到的通信相关的 protobuf 文件。

* https://github.com/pingcap/docs-cn

存放 [PingCAP 官网 TiDB 中文文档](https://pingcap.com/docs-cn/stable/) 源文件仓库。

* https://github.com/pingcap/docs   

存放 [PingCAP 官网 TiDB 英文文档](https://pingcap.com/docs/stable/) 源文件仓库。