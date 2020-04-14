## 1.3.1 基于 TiUP cluster 的集群扩缩容

在 TiUP cluster 之前，扩缩容是通过 Ansible 实现，但操作颇为繁琐，在易用性上没有很好的符合预期。现在用 TiUP cluster 只需要一两条命令就可以优雅的完成扩缩容操作。

### 1.3.1.1 扩容

扩容的内部逻辑如同部署类似，TiUP cluster 会先保证节点的 SSH 连接，在目标节点上创建必要的目录，然后执行部署并且启动服务。其中 PD 节点的扩容会通过 join 方式加入到集群中，并且会更新与 PD 有关联的服务的配置；其他服务直接启动加入到集群中。所有服务在扩容时都会做正确性验证，最终返回是否扩容成功。

例如在集群 `tidb-test` 中扩容一个 TiKV 的节点和一个 PD 节点：

1. 新建 `scale.yaml` 文件，添加 TiKV 和 PD 节点 IP。

> **注意：**
>
> 注意新建一个拓扑文件，文件中只写入扩容节点的描述信息，不要包含已存在的节点。

```yaml
---

pd_servers:
  - ip: 172.16.5.140

tikv_servers:
  - ip: 172.16.5.140
```

2. 执行扩容操作。TiUP cluster 根据 `scale.yaml` 文件中声明的端口、目录等信息在集群中添加相应的节点。

```
$ tiup cluster scale-out tidb-test scale.yaml
```

```
[root@localhost ~]# tiup cluster scale-out --help
Scale out a TiDB cluster

Usage:
  cluster scale-out <cluster-name> <topology.yaml> [flags]

Flags:
  -h, --help                   help for scale-out
  -i, --identity_file string   The path of the SSH identity file. If specified, public key authentication will be used.
      --user string            The user name to login via SSH. The user must has root (or sudo) privilege. (default "root")
  -y, --yes                    Skip confirming the topology

Global Flags:
      --ssh-timeout int   Timeout in seconds to connect host via SSH, ignored for operations that don't need an SSH connection. (default 5)
```

执行完成之后可以通过 `tiup cluster display tidb-test` 命令检查扩容后的集群状态。

### 1.3.1.2 缩容

有时候业务量降低了，集群再占有原来的资源显得有些浪费，我们会想安全地释放某些节点，减小集群规模，于是需要缩容。缩容即下线服务，最终会将指定的节点从集群中移除，并删除遗留的相关数据文件。由于 TiKV 和 Binlog 组件的下线是异步的（需要先通过 API 执行移除操作）并且下线过程耗时较长（需要持续观察节点是否已经下线成功），所以对 TiKV 和 Binglog 组件做了特殊处理。

+ 对 TiKV 及 Binlog 组件的操作
    - TiUP cluster 通过 API 将其下线后直接退出而不等待下线完成
    - 等之后再执行集群操作相关的命令时会检查是否存在已经下线完成的 TiKV 或者 Binlog 节点。如果不存在，则继续执行指定的操作；如果存在，则执行如下操作：
        - 停止已经下线掉的节点的服务
        - 清理已经下线掉的节点的相关数据文件
        - 更新集群的拓扑，移除已经下线掉的节点
+ 对其他组件的操作
    - PD 组件的下线通过 API 将指定节点从集群中 `delete` 掉（这个过程很快），然后停掉指定 PD 的服务并且清除该节点的相关数据文件
    - 下线其他组件时，直接停止并且清除节点的相关数据文件

1. 缩容需要指定至少两个参数，一个是集群名字，另一个是节点 ID。比如我想要将 172.16.5.140 上的 TiKV 干掉。首先我们通过 `display` 命令查看当前集群节点的信息。

```
[root@localhost ~]# tiup cluster display prod-cluster
Starting /root/.tiup/components/cluster/v0.4.5/cluster display prod-cluster
TiDB Cluster: prod-cluster
TiDB Version: v3.0.12
ID                  Role        Host          Ports        Status     Data Dir              Deploy Dir
--                  ----        ----          -----        ------     --------              ----------
172.16.5.134:3000   grafana     172.16.5.134  3000         Up         -                     deploy/grafana-3000
172.16.5.134:2379   pd          172.16.5.134  2379/2380    Healthy|L  data/pd-2379          deploy/pd-2379
172.16.5.139:2379   pd          172.16.5.139  2379/2380    Healthy    data/pd-2379          deploy/pd-2379
172.16.5.140:2379   pd          172.16.5.140  2379/2380    Healthy    data/pd-2379          deploy/pd-2379
172.16.5.134:9090   prometheus  172.16.5.134  9090         Up         data/prometheus-9090  deploy/prometheus-9090
172.16.5.134:4000   tidb        172.16.5.134  4000/10080   Up         -                     deploy/tidb-4000
172.16.5.139:4000   tidb        172.16.5.139  4000/10080   Up         -                     deploy/tidb-4000
172.16.5.140:4000   tidb        172.16.5.140  4000/10080   Up         -                     deploy/tidb-4000
172.16.5.134:20160  tikv        172.16.5.134  20160/20180  Up         data/tikv-20160       deploy/tikv-20160
172.16.5.139:20160  tikv        172.16.5.139  20160/20180  Up         data/tikv-20160       deploy/tikv-20160
172.16.5.140:20160  tikv        172.16.5.140  20160/20180  Offline    data/tikv-20160       deploy/tikv-20160
```

2. 执行缩容操作。

```
$ tiup cluster scale-in prod-cluster -N 172.16.5.140:20160
```

```
[root@localhost ~]# tiup cluster scale-in --help
Scale in a TiDB cluster

Usage:
  cluster scale-in <cluster-name> [flags]

Flags:
  -h, --help                   help for scale-in
  -N, --node strings           Specify the nodes
      --transfer-timeout int   Timeout in seconds when transferring PD and TiKV store leaders (default 300)
  -y, --yes                    Skip the confirmation of destroying

Global Flags:
      --ssh-timeout int   Timeout in seconds to connect host via SSH, ignored for operations that don't need an SSH connection. (default 5)
```

3. 执行完成之后可以通过 `tiup cluster display prod-cluster` 命令检查缩容后的集群状态。

```
[root@localhost ~]# tiup cluster display prod-cluster
Starting /root/.tiup/components/cluster/v0.4.5/cluster display prod-cluster
TiDB Cluster: prod-cluster
TiDB Version: v3.0.12
ID                  Role        Host          Ports        Status     Data Dir              Deploy Dir
--                  ----        ----          -----        ------     --------              ----------
172.16.5.134:3000   grafana     172.16.5.134  3000         Up         -                     deploy/grafana-3000
172.16.5.134:2379   pd          172.16.5.134  2379/2380    Healthy|L  data/pd-2379          deploy/pd-2379
172.16.5.139:2379   pd          172.16.5.139  2379/2380    Healthy    data/pd-2379          deploy/pd-2379
172.16.5.140:2379   pd          172.16.5.140  2379/2380    Healthy    data/pd-2379          deploy/pd-2379
172.16.5.134:9090   prometheus  172.16.5.134  9090         Up         data/prometheus-9090  deploy/prometheus-9090
172.16.5.134:4000   tidb        172.16.5.134  4000/10080   Up         -                     deploy/tidb-4000
172.16.5.139:4000   tidb        172.16.5.139  4000/10080   Up         -                     deploy/tidb-4000
172.16.5.140:4000   tidb        172.16.5.140  4000/10080   Up         -                     deploy/tidb-4000
172.16.5.134:20160  tikv        172.16.5.134  20160/20180  Up         data/tikv-20160       deploy/tikv-20160
172.16.5.139:20160  tikv        172.16.5.139  20160/20180  Up         data/tikv-20160       deploy/tikv-20160
172.16.5.140:20160  tikv        172.16.5.140  20160/20180  Offline    data/tikv-20160       deploy/tikv-20160
```
