## 1.1.3 TiOps 简介

### 1. TiOps 简介

#### 1.1 背景

众所周知，从 TiDB 问世以来一直都是使用 TiDB Ansible 部署、运维 TiDB。TiDB Ansible 提供基础的集群部署、升级、重启、扩容、缩容等功能，支撑着非常多的用户部署和管理 TiDB 集群，但是它的复杂性、糟糕的用户体验，导致用户使用成本较高、效率低下，这就将很多的用户挡在了门外。为了解决这一系列的问题，TiOps 应运而生。

#### 1.2 介绍

TiOps 是一款部署、运维 TiDB 的命令行工具，通过简单易用的操作命令来提升 TiDB 的运维效率。

### 2. 功能说明

#### 2.1 集群初始化

在初次使用 TiOps 部署 TiDB 集群之前，需要进行相关的系统初始化操作，其中包括：中控机初始化、打通节点之间的网络 (SSH) 配置、部署节点初始化。

#### 2.2 集群日常运维

提供 TiDB 集群常见的部署、运维管理操作，其中包括：集群/角色/组件的部署、启动、停止、重启、扩容、缩容、升级、销毁、修改配置、重新加载配置、查询集群状态等功能。

### 3. 准备工作

**基本要求：**

* 操作系统：仅支持 CentOS 7.3 及以上 Linux 操作系统 （建议使用 el7 系列最新版）
* 软件源：系统需已安装 epel-release 包，或通过其他方式添加了 EPEL 源
* 磁盘空间：中控机执行用户的 `$HOME` 目录可用空间 > 10GB
* 网络：中控机有互联网访问，且与部署机处在同一网络环境中

(1) 在中控机上安装第三方包管理库

```sh
yum install -y epel-release
```

(2) 安装 TiOps 

当前只提供 rpm 包，后续会考虑使用 tiup ，通过指定 nightly 等参数来进行下载安装。

为方便实验，这里就写提供一个 v0.2.0 的下载链接。

```sh
wget https://download.pingcap.org/tiops-v0.2.0-1.el7.x86_64.rpm
yum localinstall -y tiops-v0.2.0-1.dev.el7.x86_64.rpm
```

(3) 测试 TiOps 安装是否成功

在命令行输入 `tiops -h` 后，输出如下内容即表示 TiOps 已经安装成功。

```sh
tiops -h
usage: tiops [-h] [-v]


{bootstrap-local,bootstrap-ssh,bootstrap-host,deploy,start,stop,restart,upgrade,display,destroy,reload,edit-config,scale-out,scale-in,exec,quickdeploy,version}
             ...

positional arguments:
  {bootstrap-local,bootstrap-ssh,bootstrap-host,deploy,start,stop,restart,upgrade,display,destroy,reload,edit-config,scale-out,scale-in,exec,quickdeploy,version}
                        tidb cluster commands
    bootstrap-local     init localhost
    bootstrap-ssh       init ssh for cluster hosts
    bootstrap-host      init environment for cluster hosts
    deploy              create tidb cluster
    start               start tidb cluster
    stop                stop tidb cluster
    restart             restart tidb cluster
    upgrade             upgrade tidb cluster
    display             display tidb cluster
    destroy             destroy tidb cluster
    reload              reload tidb cluster
    edit-config         edit tidb cluster configuration
    scale-out           scale out tidb cluster
    scale-in            scale in tidb cluster
    exec                run shell command on host in the tidb cluster
    quickdeploy         deploy a tidb cluster in demo mode
    version             show TiOps version and exit


optional arguments:
  -h, --help            show this help message and exit
  -v, --verbose         Print verbose output.
```

(4) 初始化中控机

工具会自动生成中控机当前用户的 ssh key，它默认会存放在 `~/.ssh/id_rsa` 和 `~/.ssh/id_rsa.pub`，生成 ssh key 将被用于中控机和目标机器的 ssh 通讯。

**命令：**

```sh
tiops bootstrap-local
```

(5) 初始化中控机器与目标机器之间的网络

指定目标机器 IP 和用户名，然后会在目标机器上创建运行 TiDB 服务的用户，并赋予 sudo 权限。

**命令：**

```sh
tiops bootstrap-ssh -H 10.9.1.1,10.9.1.2,10.9.1.3 -u root -d tidb
```

**参数说明：**

```sh
-H |--host hosts：必选参数，目机机器 IP 地址列表，多个 IP 之间采用 `,` 分割；也可直接传一个由多 IP 地址组成的文件，文件中每一行是一个 IP 地址，可参考 /usr/share/tiops/hosts.yaml.example
-u | --user 必选参数，目标机器的用户名，默认： root 
-p | --password 可选参数，目标机器用户名的密码
-d |--deploy-user  必选参数，目标机器上运行 TiDB 服务的用户
-s | --ssh-port 可选参数，目标机器上 SSH 通信的端口号，默认： 22
-f | --forks 可选参数，并发执行数量，默认：5
```

**注意事项：**

* 因为中控机与目标机器之间通过 ssh 通信，所以 TiOps 工具需要打通中控机与目标机器之间的免密码通信。
* 目标机器的用户名除 root 外，也可以是具有 root 权限的普通用户。
* 传入的密码若包含特殊字符，可以将密码字符串用单引号包起来。

(6) 初始化目标机器

根据传入的参数，检查、修改目标机器配置、NTP 服务、防火墙、时区、Swap、irqbalance 等。

**命令：**

```sh
tiops bootstrap-host -H 10.9.1.1,10.9.1.2,10.9.1.3 -d tidb
```

**参数说明：**

```sh
-H |--host hosts：必选参数，目机机器 IP 地址列表，多个 IP 之间采用 `,` 分割；也可直接传一个由多 IP 地址组成的文件，文件中每一行是一个 IP 地址，可参考 /usr/share/tiops/hosts.yaml.example
-d |--deploy-user  必选参数，目标机器上运行 TiDB 服务的用户
-s | --ssh-port 可选参数，目标机器上 SSH 通信的端口号，默认： 22
--enable-check-ntp 可选参数，是否检查 NTP 服务，默认： disable 
--ntp-server 可选参数，用户的 NTP 服务，可传多个 NTP 地址，逗号分割。example: 10.0.0.10 or 10.0.0.10,10.0.0.11
--timezone 可选参数，设置服务时区，默认： Asia/Shanghai
--enable-swap 可选参数，是否开启 swap，默认：disable 
--disable-irqbalance 可选参数，是否开启 irqbalance，默认：enable
--enable-checks 可选参数，是否做环境检查，默认：disable
-f | --forks 可选参数，并发执行数量，默认：5
```

**注意事项：**

* 一定要指定上一步你所创建的运行 TiDB 服务的用户

(7) 配置和修改集群拓扑信息

通过如下命令，可查看 TiOps 拓扑配置文件示例。

```sh
cat /usr/share/tiops/topology.yaml.example
```

**注意事项：**

* pd_servers、tidb_servers、tikv_servers、monitoring_server、grafana_server 为必配项。
* 配置时除必须配置 `IP` 外，还可以配置 `data_dir`、`deploy_dir`、`port` 等配置项，详细的配置项可以参考`/usr/share/tiops/topology.yaml.example.full`。

### 4. TiOps 部署

#### 4.1 准备集群所需拓扑文件

根据实际情况来规划集群的拓扑信息，一般可以直接用 `/usr/share/tiops/topology.yaml.example` 或 `/usr/share/tiops/topology.yaml.example.full` 来进行对应修改。

**命令：**

```sh
cp /usr/share/tiops/topology.yaml.example topology.yaml
```

```sh
vim topology.yaml
```

将 pd_servers、tidb_servers、tikv_servers、monitoring_server、grafana_server 填上提前准备好的 IP 地址，详细信息如下：

```yaml
---

pd_servers:
  - ip: 10.9.1.1
  - ip: 10.9.1.2
  - ip: 10.9.1.3

tidb_servers:
  - ip: 10.9.1.1
  - ip: 10.9.1.2

tikv_servers:
  - ip: 10.9.1.1
  - ip: 10.9.1.2
  - ip: 10.9.1.3

monitoring_server:
  - ip: 10.9.1.1

grafana_server:
  - ip: 10.9.1.1
```

#### 4.2 部署集群

根据 `-T` 所指定的集群拓扑文件，使用 TiOps 部署一个名称为 `mai` 的集群，部署完成后系统处于未启动状态，需要通过 `start` 命令启动它。

**命令：**

```sh
tiops deploy -c mai -T topology.yaml -d tidb
```

**参数说明：**

```sh
-c | --cluster_name name 必选参数，集群名称
-T | --topology 必选参数，集群拓扑信息文件
-t | --tidb-version 可选参数，TiDB 的版本号，默认： 3.0.5
-d | --deploy-user  必选参数，目标机器上运行 TiDB 服务的用户
--enable-check-cpu 可选参数，检查 CPU vcores 数量是否符合要求，默认：disable
--enable-check-mem 可选参数，检查 Memory Size 是否符合要求，默认：disable
--enable-check-disk 可选参数，检查 Disk Available Space 是否符合要求 ，默认：disable
--enable-check-iops 可选参数，检查数据盘 IOPS 以及 latency 是否符合要求，默认：disable
--enable-check-all  可选参数，检查 CPU、Memory、Disk、IOPS 是否符合要求，默认：disable
--enable-firewall：可选参数，目标机器是否开启防火墙，默认：disable
--enable-check-config：可选参数，检查配置文件是否合法，默认：disable
--local-pkg 可选参数，若无外网，可将安装包拷贝中控机本地，通过此参数指相关路径进行离线安装
-f | --forks 可选参数，并发执行数量，默认：5
```

### 5. TiOps 运维

#### 5.1 启动集群/角色/节点

**命令：**

```sh
tiops start -c mai
```

当输出 `Finished start.` 后，可以使用 mysql client 来验证 TiDB 集群是否运行成功。

```sh
mysql -h 10.9.1.1 -P4000 -u root
```

输出类似 `Server version: 5.7.25-TiDB-v3.0.9 MySQL Community Server (Apache License 2.0)` 的字符串，即表示当前 TiDB 已经连接成功。

**参数说明：**

```sh
-c | --cluster_name name 必选参数，集群名称
-T | --topology 必选参数，集群拓扑信息文件
-t | --tidb-version 可选参数，TiDB 的版本号，默认： 3.0.5
-d | --deploy-user  必选参数，目标机器上运行 TiDB 服务的用户
--enable-check-cpu 可选参数，检查 CPU vcores 数量是否符合要求，默认：disable
--enable-check-mem 可选参数，检查 Memory Size 是否符合要求，默认：disable
--enable-check-disk 可选参数，检查 Disk Available Space 是否符合要求 ，默认：disable
--enable-check-iops 可选参数，检查数据盘 IOPS 以及 latency 是否符合要求，默认：disable
--enable-check-all  可选参数，检查 CPU、Memory、Disk、IOPS 是否符合要求，默认：disable
--enable-firewall：可选参数，目标机器是否开启防火墙，默认：disable
--enable-check-config：可选参数，检查配置文件是否合法，默认：disable
--local-pkg 可选参数，若无外网，可将安装包拷贝中控机本地，通过此参数指相关路径进行离线安装
-f | --forks 可选参数，并发执行数量，默认：5
```

**注意事项：**

* 集群不是第一次启动的时候才可以根据节点 ID 启动
* 慎重使用按照角色启动

#### 5.2 重启集群/角色/节点

**命令：**

```sh
tiops restart -c mai
```

TiOps 将会先停止 grafana, blackbox_exporter, node_exporter, prometheus, tidb, tikv, pd 等组件，然后再启动它们。

**参数说明：**

```sh
-c | --cluster_name cluster_name 必选参数，集群名称
-r | --role role 可选参数，按照 TiDB 服务的角色类型，分别启动，取值："pd", "tikv", "pump", "tidb",  "drainer", "monitoring", "monitored", "grafana", "alertmanager"
-n | --node-id node_id 可选参数，根据节点 ID 启动服务，节点 ID 可通过 display 命令获得
-f | --forks 可选参数，并发执行数量，默认：5
```

#### 5.3 停止集群/角色/节点

**命令：**

```sh
tiops stop -c mai
```

TiOps 将会停止 grafana, blackbox_exporter, node_exporter, prometheus, tidb, tikv, pd 等组件。

**参数说明：**

```sh
-c | --cluster_name cluster_name 必选参数，集群名称
-r | --role role 可选参数，按照 TiDB 服务的角色类型，分别启动，取值："pd", "tikv", "pump", "tidb",  "drainer", "monitoring", "monitored", "grafana", "alertmanager"
-n | --node-id node_id 可选参数，根据节点 ID 启动服务，节点 ID 可通过 display 命令获得
-f | --forks 可选参数，并发执行数量，默认：5
```

#### 5.4 销毁集群

**命令：**

```sh
tiops destroy -c mai
```

**参数说明：**

```sh
-c | --cluster_name cluster_name 必选参数，集群名称
-f | --forks 可选参数，并发执行数量，默认：5
```

**注意事项：**

- 销毁集群会删除整个集群的数据。

#### 5.5 版本升级

**命令：**

```sh
tiops upgrade -c mai -d tidb
```

**参数说明：**

```sh
-c | --cluster_name cluster_name 必选参数，集群名称
-r | --role role 可选参数，按照 TiDB 服务的角色类型，分别启动，取值："pd", "tikv", "pump", "tidb",  "drainer", "monitoring", "monitored", "grafana", "alertmanager"
-n | --node-id node_id 可选参数，根据节点 ID 启动服务，节点 ID 可通过 display 命令获得
--force 可选参数，常规情况是滚动升级，设置此参数，升级时会强制停机、重启
--local-pkg 可选参数，若无外网，可将安装包拷贝中控机本地，通过此参数指相关路径进行离线安装
--enable-check-config：可选参数，检查配置文件是否合法，默认：disable
-f | --forks 可选参数，并发执行数量，默认：5
```

#### 5.6 扩容

**命令：**

```sh
tiops scale-out -c mai -T topology.yaml
```

**参数说明：**

```sh
-c | --cluster_name name 必选参数，集群名称
-T | --topology 必选参数，集群拓扑信息文件
--check-cpu 可选参数，检查 CPU vcores 数量是否符合要求，默认：disable
--enable-check-mem 可选参数，检查 Memory Size 是否符合要求，默认：disable
--enable-check-disk 可选参数，检查 Disk Available Space 是否符合要求 ，默认：disable
--enable-check-iops 可选参数，检查数据盘 IOPS 以及 latency 是否符合要求，默认：disable
--enable-check-all  可选参数，检查 CPU、Memory、Disk、IOPS 是否符合要求，默认：disable
--local-pkg 可选参数，若无外网，可将安装包拷贝中控机本地，通过此参数指相关路径进行离线安装
-f | --forks 可选参数，并发执行数量，默认：5
```

#### 5.7 缩容或者下线节点

**命令：**

```sh
tiops scale-in -c mai
```

**参数说明：**

```sh
-c | --cluster_name name 必选参数，集群名称
-n |  --node-id nodes 可选参数，根据节点 ID 启动服务，节点 ID 可通过 display 命令获得
-f | --forks 并发执行数量，默认：5
```

#### 5.8 重新加载配置文件

**命令：**

```sh
tiops reload -c mai
```

**参数说明：**

```sh
-c | --cluster_name cluster_name 必选参数，集群名称
-r | --role role 可选参数，按照 TiDB 服务的角色类型，分别启动，取值："pd", "tikv", "pump", "tidb",  "drainer", "monitoring", "monitored", "grafana", "alertmanager"
-n | --node-id node_id 可选参数，根据节点 ID 启动服务，节点 ID 可通过 display 命令获得
-f | --forks 可选参数，并发执行数量，默认：5
```

#### 5.9 编辑配置文件

**命令：**

```sh
tiops edit-config -c mai
```

**参数说明：**

```sh
-c | --cluster_name cluster_name 必选参数，集群名称
```

**注意事项：**

* 编辑配置需要 reload 配置才会生效。

#### 5.10 查看集群详细信息

**命令：**

查看集群/角色/节点的详细信息。

```sh
tiops display -c mai
```

**参数说明：**

```sh
-c | --cluster_name cluster_name 必选参数，集群名称
-r | --role role 可选参数，按照 TiDB 服务的角色类型，分别启动，取值："pd", "tikv", "pump", "tidb",  "drainer", "monitoring", "monitored", "grafana", "alertmanager"
-n | --node-id node_id 可选参数，根据节点 ID 启动服务，节点 ID 可通过 display 命令获得
 --status 可选参数，输出节点状态详细信息
```

**输出说明：**

当设置 `--status` 参数时，会输出 TiDB 各个组件当前的简单状态信息。

```sh
TiDB cluster mai, version 3.0.9
Node list:
ID        Role        Host          Ports        Status    Data Dir                                 Deploy Dir
f5961fad  Monitoring  10.9.1.1   9090/9091    -         /home/tidb/data/mai/monitoring-f5961fad  /home/tidb/deploy/mai/monitoring-f5961fad
eb57cedb  PD          10.9.1.1   2379/2380    Health    /home/tidb/data/mai/pd-eb57cedb          /home/tidb/deploy/mai/pd-eb57cedb
hb6289b2  PD          10.9.1.2  2379/2380    Health|L  /home/tidb/data/mai/pd-hb6289b2          /home/tidb/deploy/mai/pd-hb6289b2
dd25d798  PD          10.9.1.3  2379/2380    Health    /home/tidb/data/mai/pd-dd25d798          /home/tidb/deploy/mai/pd-dd25d798
dded5656  TiDB        10.9.1.1  4000/10080   Up        -                                        /home/tidb/deploy/mai/tidb-dded5656
dedfd1cb  TiDB        10.9.1.2  4000/10080   Up        -                                        /home/tidb/deploy/mai/tidb-dedfd1cb
jbab8302  Monitored   10.9.1.1  9100/9115    -         -                                        /home/tidb/deploy/mai/monitored-jbab8302
db46f98f  Monitored   10.9.1.2   9100/9115    -         -                                        /home/tidb/deploy/mai/monitored-db46f98f
h1f9fce0  Monitored   10.9.1.3  9100/9115    -         -                                        /home/tidb/deploy/mai/monitored-h1f9fce0
g0418cd7  TiKV        10.9.1.1   20160/20180  Up        /home/tidb/data/mai/tikv-g0418cd7        /home/tidb/deploy/mai/tikv-g0418cd7
c7e55608  TiKV        10.9.1.2  20160/20180  Up        /home/tidb/data/mai/tikv-c7e55608        /home/tidb/deploy/mai/tikv-c7e55608
hf2c6bb4  TiKV        10.9.1.3  20160/20180  Up        /home/tidb/data/mai/tikv-hf2c6bb4        /home/tidb/deploy/mai/tikv-hf2c6bb4
i701ff8d  Grafana     10.9.1.1   3000         -         -                                        /home/tidb/deploy/mai/grafana-i701ff8d
```

它的一些状态含义解释如下：

```sh
TiDB：它的值有 Up/Down
PD 健康状态：它的值有 Health/Unhealth,如果 PD 的状态接口请求失败则为 Down; 其中，PD Leader 会在状态后标记 L
TiKV Store 状态：它的值有 Up/Offline/Tombstone 等，如果 TiKV 的状态接口请求失败则为 Down
Pump Node 状态：如果 Pump 的状态接口请求失败则为 Down
Drainer Node 状态，如果 Drainer 的状态接口请求失败则为 Down
```

若 Status 列显示为 `-` ，则表示该组件尚不支持实时状态显示。

#### 5.11 查看 TiOps 版本信息

**命令：**

```sh
tiops version
```

显示 TiOps 命令行工具的版本号。

#### 5.12 quickdeploy

**命令：**

快速部署一个集群。

```sh
tiops quickdeploy -c mai -d tidb -H 10.9.1.1,10.9.1.2,10.9.1.3 -T topology.yaml
```

**参数说明：**

```sh
-c | --cluster_name name 必选参数，集群名称
-T | --topology 必选参数，集群拓扑信息文件
-H | --host hosts：必选参数，目机机器 IP 地址列表，多个 IP 之间采用 `,` 分割；也可直接传一个由多 IP 地址组成的文件，文件中每一行是一个 IP 地址，可参考 /usr/share/tiops/hosts.yaml.example
-u | --user 必选参数，目标机器的用户名，默认： root 
-d | --deploy-user  必选参数，目标机器上运行 TiDB 服务的用户
-t | --tidb-version 可选参数，TiDB 的版本号，默认： 3.0.5
-p | --password 可选参数，目标机器用户名的密码
-s | --ssh-port 可选参数，目标机器上 SSH 通信的端口号，默认： 22
--enable-check-cpu 可选参数，检查 CPU vcores 数量是否符合要求，默认：disable
--enable-check-mem 可选参数，检查 Memory Size 是否符合要求，默认：disable
--enable-check-disk 可选参数，检查 Disk Available Space 是否符合要求 ，默认：disable
--enable-check-iops 可选参数，检查数据盘 IOPS 以及 latency 是否符合要求，默认：disable
--enable-check-all  可选参数，检查 CPU、Memory、Disk、IOPS 是否符合要求，默认：disable
--enable-firewall：可选参数，目标机器是否开启防火墙，默认：disable
--enable-check-config：可选参数，检查配置文件是否合法，默认：disable
--local-pkg 可选参数，若无外网，可将安装包拷贝中控机本地，通过此参数指相关路径进行离线安装
-f | --forks 可选参数，并发执行数量，默认：5
```

### 6.其他

TiOps 暂时不支持 TiSpark 和 TiFlash 的部署运维操作。

