## 3.1 集群信息表

### 3.1.1 背景

为了提升 TiDB 问题定位效率，TiDB 4.0 诊断功能以系统表为统一入口将各种维度的系统信息展现给用户，让用户能够以 SQL 的方式查询各种集群信息。

整个集群的信息拉通之后，信息量会变大，所以需要对信息进行进一步归类和自动化整理和判断。基于此原则，TiDB 4.0 会按照信息的类型将信息组织到不同的系统表。

### 3.1.2 集群信息表总览

TiDB 4.0 新增的集群信息表

* 集群拓扑表 `information_schema.cluster_info` 主要用于获取集群当前的拓扑信息，以及各个节点的版本、版本对应的 Git Hash、启动时间、运行时间信息
* 集群配置表 `information_schema.cluster_config` 用于获取集群当前所有节点的配置。TiDB 4.0 之前的版本必须逐个访问各个节点的 HTTP API
* 集群硬件表 `information_schema.cluster_hardware` 主要用于快速查询集群硬件信息
* 集群负载表 `information_schema.cluster_load` 主要用于查询集群不同节点的不同硬件类型的负载信息
* 集群负载表 `information_schema.cluster_systeminfo` 主要用于查询集群不同节点的内核配置信息，目前支持查询 sysctl 的信息
* 集群日志表 `information_schema.cluster_log` 主要用于集群日志查询。为了降低日志查询对集群的影响，诊断功能会将查询条件下推到各个节点。通过这个优化，日志查询对性能的影响小于等于 grep 命令

TiDB 4.0 之前的以下系统表，只能查看当前节点，TiDB 4.0 实现了对应的集群表，可以在单个 TiDB 节点上拥有整个集群的全局视图。

### 3.1.3 信息表示例

#### 1.集群拓扑表

可以通过集群拓扑表 `information_schema.cluster_info` 查询当前服务器实例运行时间，具体示例如下：

```
mysql> select type, instance, status_address, uptime from cluster_info;
+------+-----------------+-----------------+---------------+
| type | instance        | status_address  | uptime        |
+------+-----------------+-----------------+---------------+
| tidb | 127.0.0.1:4000  | 127.0.0.1:10080 | 11m6.204302s  |
| tidb | 127.0.0.1:4001  | 127.0.0.1:10081 | 11m6.204306s  |
| tidb | 127.0.0.1:4002  | 127.0.0.1:10082 | 11m6.204307s  |
| pd   | 127.0.0.1:2380  | 127.0.0.1:2380  | 11m16.204308s |
| pd   | 127.0.0.1:2381  | 127.0.0.1:2381  | 11m16.20431s  |
| pd   | 127.0.0.1:2382  | 127.0.0.1:2382  | 11m16.204311s |
| tikv | 127.0.0.1:20161 | 127.0.0.1:20181 | 11m11.204312s |
| tikv | 127.0.0.1:20162 | 127.0.0.1:20182 | 11m11.204313s |
| tikv | 127.0.0.1:20160 | 127.0.0.1:20180 | 11m11.204314s |
| tikv | 127.0.0.1:20163 | 127.0.0.1:20183 | 11m11.204315s |
+------+-----------------+-----------------+---------------+
10 rows in set (0.01 sec)
```

字段解释:

* TYPE：节点类型，目前节点的类型为 pd/tikv/tidb，节点类型始终为小写
* INSTANCE：实例地址，始终为 IP:PORT 格式的字符串
* STATUS_ADDRESS：HTTP API 服务地址，部分 tikv-ctl / pd-ctl / tidb-ctl 使用到 HTTP API 的命令会使用这个地址，用户也可以通过这个地址获取一些额外的集群信息，具体 HTTP API 参考官方文档
* VERSION：对应节点的语义版本号，TiDB 版本为了兼容 MySQL 的版本号，以 ${mysql-version}-${tidb-version} 方式展示
* GIT_HASH：对应节点版本编译时的 git commit hash，主要用于识别两个节点是否是绝对一致的版本
* START_TIME：对应节点的启动时间
* UPTIME：对应节点已经运行的时间

#### 2.集群配置表

集群配置表 `information_schema.cluster_config` 用于获取集群当前所有节点的配置，TiDB 4.0 之前的版本中，用户必须逐个访问各个节点的 HTTP API来获取这些信息。通过集群配置表可以查看当前集群任意实例当前生效配置。比如查询查询 TiKV 与 Coprocessor 相关的配置：

```
mysql> select * from cluster_config where type='tikv' and `key`='coprocessor.batch-split-limit';
+------+-----------------+-------------------------------+-------+
| TYPE | INSTANCE        | KEY                           | VALUE |
+------+-----------------+-------------------------------+-------+
| tikv | 127.0.0.1:20163 | coprocessor.batch-split-limit | 10    |
| tikv | 127.0.0.1:20161 | coprocessor.batch-split-limit | 10    |
| tikv | 127.0.0.1:20162 | coprocessor.batch-split-limit | 10    |
| tikv | 127.0.0.1:20160 | coprocessor.batch-split-limit | 10    |
+------+-----------------+-------------------------------+-------+
4 rows in set (2.98 sec)
```

类似的，可以通过这张表来查询所有 TiDB 的配置是否一致，比如以下 SQL 结果表示 `log.file.filename`/`port`/`status.status-port` 的配置在各个实例不一致：

```
mysql> select `key`,count(distinct value) as c from cluster_config where type='tidb' group by `key` having c > 1;
+--------------------+---+
| key                | c |
+--------------------+---+
| log.file.filename  | 3 |
| port               | 3 |
| status.status-port | 3 |
+--------------------+---+
3 rows in set (0.01 sec)
```

字段解释：

* TYPE：对应于节点信息表 `information_schema.cluster_info`  中的 TYPE 字段，可取值为 tidb/pd/tikv，且均为小写
* INSTANCE：对应于节点信息表 `information_schema.cluster_info`  中的 STATUS_ADDRESS 字段
* KEY：配置项名
* VALUE：配置项值

#### 3.集群硬件表

集群硬件表 `information_schema.cluster_hardware` 主要用于快速查询集群硬件信息。可以通过此表查询集群 CPU、内存、网卡、磁盘信息。下面以查询集群各个节点的逻辑处理器数量为例：

```
mysql> select type, instance, name, value from cluster_hardware where name='cpu-logical-cores';
+------+-----------------+-------------------+-------+
| type | instance        | name              | value |
+------+-----------------+-------------------+-------+
| tidb | 127.0.0.1:10080 | cpu-logical-cores | 8     |
| tidb | 127.0.0.1:10081 | cpu-logical-cores | 8     |
| tidb | 127.0.0.1:10082 | cpu-logical-cores | 8     |
| pd   | 127.0.0.1:2380  | cpu-logical-cores | 8     |
| pd   | 127.0.0.1:2381  | cpu-logical-cores | 8     |
| pd   | 127.0.0.1:2382  | cpu-logical-cores | 8     |
| tikv | 127.0.0.1:20160 | cpu-logical-cores | 8     |
| tikv | 127.0.0.1:20163 | cpu-logical-cores | 8     |
| tikv | 127.0.0.1:20161 | cpu-logical-cores | 8     |
| tikv | 127.0.0.1:20162 | cpu-logical-cores | 8     |
+------+-----------------+-------------------+-------+
10 rows in set (0.78 sec)
```

字段解释：

* TYPE：对应于节点信息表 `information_schema.cluster_info`  中的 TYPE 字段，可取值为 tidb/pd/tikv，且均为小写
* INSTANCE：对应于节点信息表 `information_schema.cluster_info`  中的 STATUS_ADDRESS 字段
* DEVICE_TYPE：硬件类型，目前可以查询的硬件类型有 cpu/memory/disk/net
* DEVICE_NAME：硬件名，对于不同的 DEVICE_TYPE，取值不同
  -  cpu：硬件名为 cpu
  -  disk：磁盘名
  -  net：NIC 名
  -  memory：硬件名为 memory
* NAME：硬件不同的信息名，比如 cpu 有 `cpu-logical-cores`/`cpu-physical-cores`，可以通过 `select name from cluster_hardware where device_type='cpu' group by name` 来查询不同硬件类型支持的 NAME
* VALUE：对应硬件信息的值，比如磁盘容量，CPU 核数

#### 4.集群负载表

集群负载表 `information_schema.cluster_load` 主要用于查询集群不同节点的不同硬件类型的当前负载信息。比如以下 SQL 可以查询所有节点最近一分钟的 CPU 平均负载：

```
mysql> select type, instance, name, value from cluster_load where device_type='cpu' and device_name='cpu' and name='load1';
+------+-----------------+-------+-----------+
| type | instance        | name  | value     |
+------+-----------------+-------+-----------+
| tidb | 127.0.0.1:10080 | load1 | 3.10      |
| tidb | 127.0.0.1:10081 | load1 | 3.10      |
| tidb | 127.0.0.1:10082 | load1 | 3.10      |
| pd   | 127.0.0.1:2380  | load1 | 3.10      |
| pd   | 127.0.0.1:2381  | load1 | 3.10      |
| pd   | 127.0.0.1:2382  | load1 | 3.10      |
| tikv | 127.0.0.1:20163 | load1 | 3.1015625 |
| tikv | 127.0.0.1:20161 | load1 | 3.1015625 |
| tikv | 127.0.0.1:20162 | load1 | 3.1015625 |
| tikv | 127.0.0.1:20160 | load1 | 3.1015625 |
+------+-----------------+-------+-----------+
10 rows in set (0.55 sec)
```

字段解释：

* TYPE：对应于节点信息表 `information_schema.cluster_info`  中的 TYPE 字段，可取值为 tidb/pd/tikv，且均为小写
* INSTANCE：对应于节点信息表 `information_schema.cluster_info`  中的 STATUS_ADDRESS 字段
* DEVICE_TYPE：硬件类型，目前可以查询的硬件类型有 cpu/memory/disk/net
* DEVICE_NAME：硬件名，对于不同的 DEVICE_TYPE，取值不同
  -  cpu：硬件名为 cpu
  -  disk：磁盘名
  -  net：NIC 名
  -  memory：硬件名为 memory
* NAME：不同负载类型，比如 cpu 有 `load1/load5/load15` 分别表示 CPU 在 1min/5min/15min 中的平均负载，可以通过 `select name from cluster_load where device_type='cpu' group by name` 来查询不同硬件类型支持的 NAME
* VALUE：对应硬件负载的值，比如 CPU 的 1min/5min/15min 平均负载

#### 5.集群内核配置

集群内核配置表 `information_schema.cluster_systeminfo` 主要用于查询集群不同节点的内核配置信息，目前支持查询 sysctl 的信息。下面以查询 TiDB 实例所在机器内核 fd 相关配置为例：

```
mysql> select type, instance, name, value from cluster_systeminfo where type='tidb' and name like '%fd%';
+------+-----------------+-------------------------------+-------+
| type | instance        | name                          | value |
+------+-----------------+-------------------------------+-------+
| tidb | 127.0.0.1:10080 | net.inet6.ip6.maxifdefrouters | 16    |
| tidb | 127.0.0.1:10080 | net.necp.client_fd_count      | 89    |
| tidb | 127.0.0.1:10080 | net.necp.observer_fd_count    | 0     |
| tidb | 127.0.0.1:10081 | net.inet6.ip6.maxifdefrouters | 16    |
| tidb | 127.0.0.1:10081 | net.necp.client_fd_count      | 89    |
| tidb | 127.0.0.1:10081 | net.necp.observer_fd_count    | 0     |
| tidb | 127.0.0.1:10082 | net.inet6.ip6.maxifdefrouters | 16    |
| tidb | 127.0.0.1:10082 | net.necp.client_fd_count      | 89    |
| tidb | 127.0.0.1:10082 | net.necp.observer_fd_count    | 0     |
+------+-----------------+-------------------------------+-------+
9 rows in set (0.04 sec)
```

字段解释：

* TYPE：对应于节点信息表 `information_schema.cluster_info` 中的 TYPE 字段，可取值为 tidb/pd/tikv，且均为小写
* INSTANCE：对应于节点信息表 `information_schema.cluster_info` 中的 STATUS_ADDRESS 字段
* SYSTEM_TYPE：系统类型，目前可以查询的系统类型有 system
* SYSTEM_NAME：目前可以查询的 SYSTEM_NAME 为 sysctl
* NAME：sysctl 对应的配置名
* VALUE：sysctl 对应配置项的值

#### 6.集群日志表

集群日志表 `information_schema.cluster_log` 表是 TiDB 引入的一张非常重要的系统内存表，主要解决集群日志查询问题。它的实现非常轻量，不需要依赖外部组件，也不会有中央节点保存全局日志，通过将查询条件下推到各个节点，我们降低了日志查询对集群的影响，使其对性能影响小于 grep 命令。下面以通过集群日志表查询集群的 warning 日志为例：

```
mysql> select * from cluster_log where level='warn'\G
*************************** 1. row ***************************
    TIME: 2020/03/08 12:17:41.329
    TYPE: pd
INSTANCE: 127.0.0.1:2382
   LEVEL: WARN
 MESSAGE: [grpclog.go:60] ["transport: http2Server.HandleStreams failed to read frame: read tcp 127.0.0.1:2382->127.0.0.1:57030: use of closed network connection"]
*************************** 2. row ***************************
    TIME: 2020/03/08 12:17:41.338
    TYPE: pd
INSTANCE: 127.0.0.1:2382
   LEVEL: WARN
 MESSAGE: [grpclog.go:60] ["transport: http2Server.HandleStreams failed to read frame: read tcp 127.0.0.1:2382->127.0.0.1:57029: use of closed network connection"]
*************************** 3. row ***************************
    TIME: 2020/03/08 12:17:41.361
    TYPE: pd
INSTANCE: 127.0.0.1:2382
   LEVEL: WARN
 MESSAGE: [grpclog.go:60] ["transport: http2Server.HandleStreams failed to read frame: read tcp 127.0.0.1:2382->127.0.0.1:57031: use of closed network connection"]
3 rows in set (0.01 sec)
```

字段解释：

* TIME：日志打印时间
* TYPE：对应于节点信息表 `information_schema.cluster_info`  中的 TYPE 字段，可取值为 tidb/pd/tikv，且均为小写
* INSTANCE：对应于节点信息表 `information_schema.cluster_info`  中的 INSTANCE 字段
* LEVEL：日志级别
* MESSAGE：日志内容

> **注意事项：**
>日志表的所有字段都会下推到对应节点执行，所以为了降低使用集群日志表的开销，需尽可能地指定更多的条件，比如 select * from cluter_log where instance='tikv-1' 只会在 tikv-1 执行日志搜索。
>message 字段支持 like 和 regexp 正则表达式，对应的 pattern 会编译为 regexp，同时指定多个 message 条件，相当于 grep 命令的 pipeline 形式，例如：select * from cluster_log where message like 'coprocessor%' and message regexp '.*slow.*' 相当于在集群所有节点执行 grep 'coprocessor' xxx.log | grep -E '.*slow.*'。

在TiDB 4.0 之前，要获取集群的日志，需要逐个登录各个节点汇总日志。TiDB 4.0 有了集群日志表后，可以更高效地提供一个全局时间有序的日志搜索结果。这为全链路事件跟踪提供了便利的手段。比如按照某一个 region id 搜索日志，可以查询该 region 生命周期的所有日志。类似的，通过慢日志的 txn id 搜索全链路日志，可以查询该事务在各个节点扫描的 key 数量以及流量等信息。
