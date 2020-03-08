本节将介绍如何使用 TiCDC 在两个 TiDB 集群之间实现数据同步。

[deployment.png](/res/session2/chapter2/cdc-in-action/1.png)


部署结构如上图所示。这里我们假定：
- 上游 TiDB 集群的 PD 节点是 `10.1.1.10:2379`。
- 下游 TiDB 集群的 SQL 节点是 `10.3.1.30:4000`。
- TiCDC 集群由3个 Capture 节点构成，分别是：
  - `10.2.1.20:8300`
  - `10.2.1.21:8300`
  - `10.2.1.22:8300`

### 集群部署

第1步：选择部署目标服务器。
- 推荐使用 CentOS 7.3 及以上版本的 Linux 操作系统，以及x86_64 架构 (amd64）。
- 编译 TiCDC 需要 Go >= 1.13。
- 服务器之间内网互通。

第2步：准备二进制文件。
从 [Github](https://github.com/pingcap/ticdc) 下载源码，并运行以下命令执行编译。编译好的文件会出现在`bin`目录下。
```
$ make
```

第3步：启动集群。
在每一台 TiCDC 服务器上分别运行以下命令启动服务：

```
$ cdc server --pd-endpoints=http://10.1.1.10:2379 --status-addr=127.0.0.1:8300
```

命令参数说明：
- `pd-endpoints`: 上游 TiDB 集群的 PD 节点地址。
- `status-addr`: 本地 Capture 节点地址。

至此，一个 TiCDC 集群就搭建成功了，它现在已经开始监听上游 TiKV 的变更日志了。运行以下命令可以查看 Capture 节点列表：

```
$ cdc ctrl --cmd=query-capture-list --pd-addr=http://10.1.1.10:2379
[{"id":"26f822f4-fe42-4a86-ac76-b5f79d5122ce","is-owner":false},{"id":"4a54c85b-fc1d-4897-9934-1be3b9aa6a45","is-owner":true},{"id":"6035e73a-34a9-490a-9b91-2718654d3382","is-owner":false}]
```

上述命令会返回当前集群包含的全部 Capture 节点。 不难发现，集群中有且仅有一个 Owner，其余节点都是 Processor。

### 同步任务创建
运行以下命令创建一个同步任务：

```
$ cdc cli --pd-addr=http://10.1.1.10:2379 --sink-uri="user:password@tcp(10.3.1.30:4000)/"  --config=~/cdc-config.toml --start-ts=0
```

命令参数说明：
- `pd-addr`：上游 TiDB 集群的 PD 节点地址。
- `sink-url`：下游 TiDB 集群的 DSN。
- `config`：同步任务配置文件，允许指定需要同步的数据库和表，以及需要跳过的 TSO。
- `start-ts`：指定一个 TSO 作为数据同步的起点。若不指定或置为0，则默认使用当前最新的 TSO 作为起点。

下面是一个同步任务配置文件示例。从中可以看到，`test`、`mysql` 和 `information_schema` 等三个数据库的变更日志会被过滤掉，只有 `sns.user` 和 `sns.following` 两个表会被同步到下游。

```
ignore-txn-commit-ts = []
filter-case-sensitive = false

[filter-rules]
ignore-dbs = ["test", "mysql"，"information_schema", ]

[[filter-rules.do-tables]]
db-name = "sns"
tbl-name = "user"

[[filter-rules.do-tables]]
db-name = "sns"
tbl-name = "following"
```

### 同步任务状态查询
运行以下命令可以查询同步任务列表：

```
$ cdc ctrl --cmd=query-cf-list --pd-addr=http://10.1.1.10:2379
[{"id":"136a3bee-621c-42d5-80ec-4c1aaf6ddb53"}]
```

若要查询同步任务的配置信息，则须给出对应的同步任务ID：

```
$ cdc ctrl --cmd=query-cf-info --pd-addr=http://10.1.1.10:2379 --changefeed-id=136a3bee-621c-42d5-80ec-4c1aaf6ddb53
{"sink-uri":"user:password@tcp(10.3.1.30:4000)/","opts":{},"create-time":"2020-03-07T01:17:53.879270699+08:00","start-ts":415108975525625857,"target-ts":0,"admin-job-type":0,"config":{"filter-case-sensitive":false,"filter-rules":{"do-tables":null,"do-dbs":null,"ignore-tables":null,"ignore-dbs":["test","mysql","information_schema"]},"ignore-txn-commit-ts":[]}}
```

运行以下命令可以查询同步任务的状态：

```
$ cdc ctrl --cmd=query-cf-status --pd-addr=http://10.1.1.10:2379  --changefeed-id=136a3bee-621c-42d5-80ec-4c1aaf6ddb53
{"resolved-ts":415109119613075458,"checkpoint-ts":415109119088787458,"admin-job-type":0}
```

还可以查看子任务：

```
$ cdc ctrl --cmd=query-sub-cf --changefeed-id=136a3bee-621c-42d5-80ec-4c1aaf6ddb53 --capture-id=6035e73a-34a9-490a-9b91-2718654d3382 --pd-addr=http://10.1.1.10:2379
{"table-infos":[{"id":57,"start-ts":415108986522566666}],"table-p-lock":null,"table-c-lock":null,"admin-job-type":0}{"resolved-ts":415109119613075458,"checkpoint-ts":415109119088787458,"admin-job-type":0}
```

### HTTP接口
TiCDC 提供了 HTTP 接口，帮助实现一些基础的查询和运维功能。

运行如下命令可以查询某个 Capture 节点的服务状态：

```
$ curl http://10.2.1.20:8300/status
{
 "version": "0.0.1",
 "git_hash": "",
 "id": "4a54c85b-fc1d-4897-9934-1be3b9aa6a45",
 "pid": 31652
}
```

上述输出结果中，`id` 是本地 TiCDC 服务对应的 Capture ID，`pid` 则是本地进程 ID。

有时候需要驱逐当前的 Owner 节点以主动触发 TiCDC 集群选举新的 Owner。运行以下命令驱逐当前 Owner 节点：

```	
$ curl -X POST http://10.2.1.20:8300/capture/owner/resign
```

请注意，上述命令需要向当前的 Owner 节点发出请求，该请求对 Processor 节点无效。

也可以停止、恢复或者删除指定的同步任务，命令如下：

```	
$ curl -X POST -d "admin-job=X&cf-id=136a3bee-621c-42d5-80ec-4c1aaf6ddb53" http://10.2.1.20:8300/capture/owner/admin
```

参数 `admin-job` 表示不同的任务类型：
- `admin-job=1` 表示停止任务。停止任务后所有 Processor 会结束同步并退出。同步任务的配置和同步进度都会保留，后续可以恢复任务。
- `admin-job=2` 表示恢复任务。同步任务将继续同步。
- `admin-job=3` 表示删除任务。将结束所有同步 Processor，并清理同步任务配置。同步状态将被保留，后续只提供查询功能，无法恢复任务。

请注意，上述命令也需要向当前的 Owner 节点发出请求。

最后，可以运行以下命令获取调试信息，例如 Owner 和 Processors 的状态以及 etcd 上存储的内容。

```
$ curl http://10.2.1.20:8300/debug/info
```
