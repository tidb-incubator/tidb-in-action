### 1.1.3 用 TiUP 部署生产集群

上一节介绍了如何使用 TiUP 结合组件 `playground` 快速启动一个本地集群，这样的集群可以用来本地测试，但该集群显然不能用于生产环境。因此我们推出了用于快速部署生产环境的 [`cluster`](https://github.com/pingcap-incubator/tiup-cluster) 组件，该组件像 `playground` 部署本地集群一样快速部署生产集群，对比 `playground`，它提供了更强大的集群管理功能，包括对集群的升级，缩容，扩容甚至操作审计等。下面我们一起看看这个组件的用法。

#### 1. 安装 cluster 组件

当你想用某个软件的时候，第一步当然是安装它，由于 TiUP 是一个包管理工具，安装它的组件并不是什么难事，比如安装 `tiup-cluster` 只需要执行:
```
tiup install cluster
```
然后我们可以通过 `--help` 指令看该组件支持的功能：
```
tiup cluster --help
Deploy a TiDB cluster for production

Usage:
  cluster [flags]
  cluster [command]

Available Commands:
  deploy      Deploy a cluster for production
  start       Start a TiDB cluster
  stop        Stop a TiDB cluster
  restart     Restart a TiDB cluster
  scale-in    Scale in a TiDB cluster
  scale-out   Scale out a TiDB cluster
  destroy     Destroy a specified cluster
  upgrade     Upgrade a specified TiDB cluster
  exec        Run shell command on host in the tidb cluster
  display     Display information of a TiDB cluster
  list        List all clusters
  audit       Show audit log of cluster operation
  import      Import an exist TiDB cluster from TiDB-Ansible
  edit-config Edit TiDB cluster config
  reload      Reload a TiDB cluster's config and restart if needed
  help        Help about any command

Flags:
  -h, --help      help for cluster

Use "cluster [command] --help" for more information about a command.
```
TiDB 集群需要用到的操作可以说应有尽有：部署，启动，停止，重启，缩容，扩容，升级...

#### 2. 部署集群

部署集群使用的命令为 `tiup cluster deploy`:
```
tiup cluster deploy --help
Deploy a cluster for production. SSH connection will be used to deploy files, as well as creating system users for running the service.

Usage:
  cluster deploy <cluster-name> <version> <topology.yaml> [flags]

Flags:
  -h, --help                   help for deploy
  -i, --identity_file string   The path of the SSH identity file. If specified, public key authentication will be used.
      --user string            The user name to login via SSH. The user must has root (or sudo) privilege. (default "root")
  -y, --yes                    Skip confirming the topology
```
该命令需要我们提供集群的名字，集群使用的 TiDB 版本，以及一个集群的拓扑文件，拓扑文件的编写参考[示例](https://raw.githubusercontent.com/pingcap-incubator/tiup-cluster/master/topology.example.yaml)。以一个最简单的拓扑为例：
```yaml
---
  
pd_servers:
  - host: 172.16.5.134
    name: pd-134
  - host: 172.16.5.139
    name: pd-139
  - host: 172.16.5.140
    name: pd-140

tidb_servers:
  - host: 172.16.5.134
  - host: 172.16.5.139
  - host: 172.16.5.140

tikv_servers:
  - host: 172.16.5.134
  - host: 172.16.5.139
  - host: 172.16.5.140

grafana_servers:
  - host: 172.16.5.134

monitoring_servers:
  - host: 172.16.5.134
```
将该文件保存为 `/tmp/topology.yaml`。假如我们想要使用 TiDB 的 `v3.0.12` 版本，集群名字命名为 `prod-cluster`，则执行:
```
tiup cluster deploy prod-cluster v3.0.12 /tmp/topology.yaml
```
执行过程中会再次确认拓扑结构并提示输入目标机器上的 root 密码：
```
Please confirm your topology:
TiDB Cluster: prod-cluster
TiDB Version: v3.0.12
Type        Host          Ports        Directories
----        ----          -----        -----------
pd          172.16.5.134  2379/2380    deploy/pd-2379,data/pd-2379
pd          172.16.5.139  2379/2380    deploy/pd-2379,data/pd-2379
pd          172.16.5.140  2379/2380    deploy/pd-2379,data/pd-2379
tikv        172.16.5.134  20160/20180  deploy/tikv-20160,data/tikv-20160
tikv        172.16.5.139  20160/20180  deploy/tikv-20160,data/tikv-20160
tikv        172.16.5.140  20160/20180  deploy/tikv-20160,data/tikv-20160
tidb        172.16.5.134  4000/10080   deploy/tidb-4000
tidb        172.16.5.139  4000/10080   deploy/tidb-4000
tidb        172.16.5.140  4000/10080   deploy/tidb-4000
prometheus  172.16.5.134  9090         deploy/prometheus-9090,data/prometheus-9090
grafana     172.16.5.134  3000         deploy/grafana-3000
Attention:
    1. If the topology is not what you expected, check your yaml file.
    1. Please confirm there is no port/directory conflicts in same host.
Do you want to continue? [y/N]:
```
输入密码后 `tiup-cluster` 便会下载需要的组件并部署到对应的机器上，当看到以下提示时说明部署成功：
```
Deployed cluster `prod-cluster` successfully
```

#### 3. 查看集群列表

集群一旦部署之后我们就能够通过 `tiup cluster list` 在集群列表中看到它：
```
[root@localhost ~]# tiup cluster list
Starting /root/.tiup/components/cluster/v0.4.5/cluster list
Name          User  Version    Path                                               PrivateKey
----          ----  -------    ----                                               ----------
prod-cluster  tidb  v3.0.12    /root/.tiup/storage/cluster/clusters/prod-cluster  /root/.tiup/storage/cluster/clusters/prod-cluster/ssh/id_rsa
```

#### 4. 启动集群

上一步部署成功后，我们可以执行命令将该集群启动起来，如果忘记了已经部署的集群的名字，可以使用 `tiup cluster list` 查看，启动集群的命令：
```
tiup cluster start prod-cluster
```

#### 5. 查看集群状态

我们经常想知道集群中每个组件的运行状态，如果挨个机器上去看的话显然很低效，这个时候就轮到 `tiup cluster display` 登场了，它的用法很简单:
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
172.16.5.140:20160  tikv        172.16.5.140  20160/20180  Up         data/tikv-20160       deploy/tikv-20160
```
对于普通的组件，Status 列会显示 "Up" 或者 "Down" 表示该服务是否正常，对于 PD，Status 会显示 Healthy 或者 "Down"，同时可能会带有 |L 表示该 PD 是 Leader。

#### 6. 缩容

有时候业务量降低了，集群再占有原来的资源显得有些浪费，我们会想安全地释放某些节点，减小集群规模，于是需要缩容：
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
它需要指定至少两个参数，一个是集群名字，另一个是节点 ID，节点 ID 可以参考上一节使用 `tiup cluster display` 命令获取。
比如我想要将 `172.16.5.140` 上的 TiKV 干掉，于是可以执行:
```
tiup cluster scale-in prod-cluster -N 172.16.5.140:20160
```
通过 `tiup cluster display` 可以看到该 TiKV 已经被标记为 Offline：
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
待 PD 将其数据调度到其他 TiKV 后，该节点会被自动删除。

#### 7. 扩容

与缩容相反，随着业务的增长，原来的集群资源不够用时，我们需要向集群中添加资源，`scale-out` 用法如下：
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
该命令需要提供一个已经存在的集群名字，以及一个增量的拓扑文件，比如，我要扩容一台 TiKV，那就创建一个叫 scale.yaml 的文件:
```
---

tikv_servers:
  - host: 172.16.5.140
```
然后执行:
```
tiup cluster scale-out prod-cluster /tmp/scale.yaml
```
然后再 `display` 就可以看到新的节点了！

#### 8. 升级

软件升级是软件生命周期中常见的操作，对于一套集群软件来说，升级的同时保证服务可用是一件最基本也是最有挑战的事情，它涉及到繁杂的运维操作，好在 `tiup cluster upgrade` 简化了这个操作，从此升级 TiDB 集群只需要一行简单的命令:
```
tiup cluster upgrade prod-cluster v4.0.0-rc
```
这样就能把 `prod-cluster` 这个版本升级到 `v4.0.0-rc` 了。

#### 9. 更新配置

有时候我们会想要动态更新组件的配置，`tiup-cluster` 为每个集群保存了一份当前的配置，如果想要编辑这份配置，则执行 `tiup cluster edit-config <cluster-name>`，例如:
```
tiup cluster edit-config prod-cluster
```
然后 tiup-cluster 会使用 vi 打开配置文件供编辑，编辑完之后保存即可。此时的配置并没有应用到集群，如果想要让它生效，还需要执行:
```
tiup cluster reload prod-cluster
```
该操作会将配置发送到目标机器，重启集群，使配置生效。如果只修改了某个组件的配置（比如 TiDB），可以只重启该组件:
```
tiup cluster reload prod-cluster -R tidb
```

#### 10. 其他

除了上面介绍的以外，tiup-cluster 还有很多功能等待探索，TiUP 自身尽可能提供了帮助信息，可以在任何命令后加上 `--help` 来查看具体的用法，比如我们知道有一个子命令叫 `import` 但是不知道它是干什么的，也不知道它怎么用，于是：
```
[root@localhost ~]# tiup cluster import -h
Import an exist TiDB cluster from TiDB-Ansible

Usage:
  cluster import [flags]

Flags:
  -d, --dir string         The path to TiDB-Ansible directory
  -h, --help               help for import
      --inventory string   The name of inventory file (default "inventory.ini")
  -r, --rename NAME        Rename the imported cluster to NAME

Global Flags:
      --ssh-timeout int   Timeout in seconds to connect host via SSH, ignored for operations that don't need an SSH connection. (default 5)
```
这样就很容易看出这个命令是用来导入一个之前的 TiDB-Ansible 集群的，它的基本用法应该是 `tiup cluster import --dir=<ansible-dir>`

有了这个技巧，相信你可以很快玩转 TiUP 世界。
