 # 3.2 TPC-C 基准性能测试
 
 本文介绍如何对 TiDB 进行 [TPC-C](http://www.tpc.org/tpcc/) 测试。
 
 ## 1. TPC-C 简介 
 
TPC 是一系列事务处理和数据库基准测试的规范。其中TPC-C（Transaction Processing Performance Council）是针对 OLTP 的基准测试模型。TPC-C 测试模型给基准测试提供了一种统一的测试标准，可以大体观察出数据库服务稳定性、性能以及系统性能等一系列问题。对数据库展开 TPC-C 基准性能测试，一方面可以衡量数据库的性能，另一方面可以衡量采用不同硬件软件系统的性价比，也是被业内广泛应用并关注的一种测试模型。

我们这里以经典的开源数据库测试工具 BenchmarkSQL 为例，其内嵌了 TPCC 测试脚本，可以对 PostgreSQL、MySQL、Oracle、TIDB 等行业内主流的数据库产品直接进行测试。

## 2. BenchmarkSQL 

TPC-C 是一个对 OLTP（联机交易处理）系统进行测试的规范，使用一个商品销售模型对 OLTP 系统进行测试，其中包含五类事务：

* NewOrder – 新订单的生成
* Payment – 订单付款
* OrderStatus – 最近订单查询
* Delivery – 配送
* StockLevel – 库存缺货状态分析

在测试开始前，TPC-C Benchmark 规定了数据库的初始状态，也就是数据库中数据生成的规则，其中 ITEM 表中固定包含 10 万种商品，仓库的数量可进行调整，假设 WAREHOUSE 表中有 W 条记录，那么：

* STOCK 表中应有 W \* 10 万条记录（每个仓库对应 10 万种商品的库存数据）
* DISTRICT 表中应有 W \* 10 条记录（每个仓库为 10 个地区提供服务）
* CUSTOMER 表中应有 W \* 10 \* 3000 条记录（每个地区有 3000 个客户）
* HISTORY 表中应有 W \* 10 \* 3000 条记录（每个客户一条交易历史）
* ORDER 表中应有 W \* 10 \* 3000 条记录（每个地区 3000 个订单），并且最后生成的 900 个订单被添加到 NEW-ORDER 表中，每个订单随机生成 5 ~ 15 条 ORDER-LINE 记录。

TPC-C 使用 tpmC 值（Transactions per Minute）来衡量系统最大有效吞吐量（MQTh，Max Qualified Throughput），其中 Transactions 以 NewOrder Transaction 为准，即最终衡量单位为每分钟处理的新订单数。

## 3. TIDB测试环境部署

对于 1000 warehouse 我们将在 3 台服务器上部署集群。

在 3 台服务器的条件下，建议每台机器部署 1 个 TiDB，1 个 PD 和 1 个 TiKV 实例。

比如这里采用的机器硬件配置是：

| 类别 | 名称 |
| :-: | :-: |
| OS | Linux (CentOS 7.3.1611) |
| CPU | 40 vCPUs, Intel(R) Xeon(R) CPU E5-2630 v4 @ 2.20GHz |
| RAM | 128GB |
| DISK | Optane 500GB SSD |

因为该型号 CPU 是 NUMA 架构，建议先用 `taskset` 进行绑核，首先用 `lscpu` 查看 NUMA node，比如：

```text
NUMA node0 CPU(s):     0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38
NUMA node1 CPU(s):     1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35,37,39
```

之后可以通过下面的命令来启动 TiDB：

```shell
nohup taskset -c 0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38 bin/tidb-server && \
nohup taskset -c 1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35,37,39 bin/tidb-server
```

最后，可以选择部署一个 HAproxy 来进行多个 TiDB node 的负载均衡，推荐配置 nbproc 为 CPU 核数。

|    | TIDB | TIKV | PD | 
| :-: | :-: | :-: | :-: | 
| node1 | 1 | 1 | 1 | 
| node2 | 1 | 1 | 1 | 
| node3 | 1 | 1 | 1 | 

## 4. TIDB 调优配置

1、升高日志级别，可以减少打印日志数量，对性能有积极影响。       

```text
[log]
level = "error"
```

2、性能相关配置，可以根据机器的 CPU 核数设置，设置 TiDB 的 CPU 使用数量。

```text
performance:
# Max CPUs to use, 0 use number of CPUs in the machine.
  max-procs: 20
```

3、缓存语句数量设置，开启 TiDB 配置中的 prepared plan cache，可减少优化执行计划的开销。

```text
prepared_plan_cache:
  enabled: true
```

4、与 TiKV 客户端相关的设置，默认值为 16；当节点负载比较低时，可适当调大该值。

```text
tikv_client:
# Max gRPC connections that will be established with each tikv-server.
  grpc-connection-count: 4
```

5、本地事务冲突检测设置，并发压测时建议开启，可减少事务的冲突。

```text
txn_local_latches:
# Enable local latches for transactions. Enable it when
# there are lots of conflicts between transactions.
  enabled: true
```

## 5. TIKV调优配置

1、调整日志级别，升高 TiKV 的日志级别同样有利于性能表现。

```text
global:
  log-level = "error"
```

2、关闭 sync-log，由于TiKV 是以集群形式部署，在 Raft 算法的作用下，能保证大多数节点已经写入数据，除了对数据安全极端敏感的场景之外，raftstore 中的 sync-log 选项可以关闭。

```text
[raftstore]
sync-log = false
```

3、块缓存配置，在 TiKV 中需要根据机器内存大小配置 RocksDB 的 block cache，以充分利用内存。以 20 GB 内存的虚拟机部署一个TiKV 为例，其 block cache 建议配置如下。

```text
[storage.block-cache]
capacity = "10GB"
```

3、开始可以使用基本的配置，压测运行后可以通过观察 Grafana 并参考 [TiKV 调优说明]进行调整。如出现单线程模块瓶颈，可以通过扩展 TiKV 节点来进行负载均摊；如出现多线程模块瓶颈，可以通过增加该模块并发度进行调整。

## 6. BenchmarkSQL 配置

修改 benchmarksql/run/props.mysql 文件

```text
conn=jdbc:mysql://{HAPROXY-HOST}:{HAPROXY-PORT}/tpcc?useSSL=false&useServerPrepStmts=true&useConfigs=maxPerformance

warehouses=1000 # 使用 1000 个 warehouse

terminals=500   # 使用 500 个终端

loadWorkers=32  # 导入数据的并发数
```

## 7. 导入数据

（导入数据通常是整个 TPC-C 测试中最耗时，也是最容易出问题的阶段）

1、首先连接到 TiDB-Server 并执行：

```shell
create database tpcc；
```

2、之后在 shell 中运行 BenchmarkSQL 建表脚本：

```shell
cd run && \
./runSQL.sh props.mysql sql.mysql/tableCreates.sql && \
./runSQL.sh props.mysql sql.mysql/indexCreates.sql
```

3、数据导入有两种方式可以选取，主要如下：

（1）直接使用 BenchmarkSQL 导入（根据机器配置这个过程可能会持续几个小时）；

```shell
./runLoader.sh props.mysql
```

（2）通过 TiDB Lightning 导入（由于导入数据量随着 warehouse 的增加而增加，当需要导入 1000 warehouse 以上数据时，可以先用 BenchmarkSQL 生成 csv 文件，再将文件通过 TiDB Lightning（以下简称 Lightning）导入的方式来快速导入。生成的 csv 文件也可以多次复用，节省每次生成所需要的时间）；

  a、修改 BenchmarkSQL 的配置文件
warehouse 的 csv 文件需要 77 MB 磁盘空间，在生成之前要根据需要分配足够的磁盘空间来保存 csv 文件。可以在 `benchmarksql/run/props.mysql` 文件中增加一行：
```text
fileLocation=/home/user/csv/  # 存储 csv 文件的目录绝对路径，需保证有足够的空间
```

因为最终要使用 Lightning 导入数据，所以 csv 文件名需要符合 Lightning 要求，即 `{database}.{table}.csv` 的命名法。可以将以上配置改为：
```text
fileLocation=/home/user/csv/tpcc.  # 存储 csv 文件的目录绝对路径 + 文件名前缀（database）
```

这样生成的 csv 文件名将会是类似 `tpcc.bmsql_warehouse.csv` 的样式，符合 Lightning 的要求。

  b、生成 csv 文件
```shell
./runLoader.sh props.mysql
```

  c、修改 inventory.ini

建议手动指定清楚部署的 IP、端口、目录，避免各种冲突问题带来的异常。
```text
[importer_server]
IS1 ansible_host=172.16.5.34 deploy_dir=/data2/is1 tikv_importer_port=13323 import_dir=/data2/import

[lightning_server]
LS1 ansible_host=172.16.5.34 deploy_dir=/data2/ls1 tidb_lightning_pprof_port=23323 data_source_dir=/home/user/csv
```

  d、修改 conf/tidb-lightning.yml
```text
mydumper:
  no-schema: true
csv:
  separator: ','
  delimiter: ''
  header: false
  not-null: false
  'null': 'NULL'
  backslash-escape: true
  trim-last-separator: false
```

  e、部署 Lightning 和 Importer
```shell
ansible-playbook deploy.yml --tags=lightning
```

  f、启动

* 登录到部署 Lightning 和 Importer 的服务器；
* 进入部署目录；
* 在 Importer 目录下执行 `scripts/start_importer.sh`，启动 Importer；
* 在 Lightning 目录下执行 `scripts/start_lightning.sh`，开始导入数据。

由于是用 ansible 进行部署的，可以在监控页面看到 Lightning 的导入进度，或者通过日志查看导入是否结束。数据导入完成之后，可以运行 `sql.common/test.sql` 进行数据正确性验证，如果所有 SQL 语句都返回结果为空，即为数据导入正确。

## 8. 运行测试

执行 BenchmarkSQL 测试脚本：
```shell
nohup ./runBenchmark.sh props.mysql &> test.log &
```

运行结束后通过 `test.log` 查看结果：
```text
07:09:53,455 [Thread-351] INFO   jTPCC : Term-00, Measured tpmC (NewOrders) = 77373.25

07:09:53,455 [Thread-351] INFO   jTPCC : Term-00, Measured tpmTOTAL = 171959.88

07:09:53,455 [Thread-351] INFO   jTPCC : Term-00, Session Start     = 2019-03-21 07:07:52

07:09:53,456 [Thread-351] INFO   jTPCC : Term-00, Session End       = 2019-03-21 07:09:53

07:09:53,456 [Thread-351] INFO   jTPCC : Term-00, Transaction Count = 345240
```

tpmC 部分即为测试结果。
