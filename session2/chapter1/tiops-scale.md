## 1.3.1 基于 TiOps 的集群扩缩容

在 TiOps 之前，扩缩容是通过 Ansible 实现，但操作颇为繁琐，在易用性上没有很好的符合预期。现在用 TiOps 只需要一两条命令就可以优雅的完成扩缩容操作。

### 1.3.1.1 扩容

扩容的内部逻辑如同部署类似，TiOps 会先保证节点的 SSH 连接，在目标节点上创建必要的目录，然后执行部署并且启动服务。其中 PD 节点的扩容会通过 join 方式加入到集群中，并且会更新与 PD 有关联的服务的配置；其他服务直接启动加入到集群中。所有服务在扩容时都会做正确性验证，最终返回是否扩容成功。

例如在集群 `tidb-test` 中扩容一个 TiKV 的节点和一个 PD 节点：

1. 新建 `scale.yaml` 文件，添加 TiKV 和 PD 节点 IP。

> **注意：**
>
> 注意新建一个拓扑文件，文件中只写入扩容节点的描述信息，不要包含已存在的节点。

```yaml
---

pd_servers:
  - ip: 10.9.20.15

tikv_servers:
  - ip: 10.9.20.15
```

2. 执行扩容操作。TiOps 根据 `scale.yaml` 文件中声明的端口、目录等信息在集群中添加相应的节点。

```
$ tiops scale-out -c tidb-test -T scale.yaml
```

```
-c | --cluster-name 必选参数。用以标识需要扩容的集群
-T | --topology 必选参数。用来指定扩容节点的描述文件
--local-pkg 可选参数。若无外网，可将安装包拷贝中控机本地，通过此参数指相关路径进行离线安装
-f | --forks 可选参数。执行命令时的并发数，默认：5；当节点数比较多时，可以适当调大
--enable-check-cpu 可选参数。检查 CPU vcores 数量是否符合要求，默认：disable
--enable-check-mem 可选参数。检查 Memory Size 是否符合要求，默认：disable
--enable-check-disk 可选参数。检查 Disk Available Space 是否符合要求 ，默认：disable
--enable-check-iops 可选参数。检查 TiKV 数据盘的 IOPS 以及 latency 是否符合要求，默认：disable
--enable-check-all 可选参数。检查 CPU、Memory、Disk、IOPS 是否符合要求，默认：disable
```

执行完成之后可以通过 `tiops display -c tidb-test --status` 命令检查扩容后的集群状态。

### 1.3.1.2 缩容

缩容即下线服务，最终会将指定的节点从集群中移除，并删除遗留的相关数据文件。由于 TiKV 和 Binlog 组件的下线是异步的（需要先通过 API 执行移除操作）并且下线过程耗时较长（需要持续观察节点是否已经下线成功），所以对 TiKV 和 Binglog 组件做了特殊处理。

+ 对 TiKV 及 Binlog 组件的操作
    - TiOps 通过 API 将其下线后直接退出而不等待下线完成
    - 等之后再执行集群操作相关的命令时会检查是否存在已经下线完成的 TiKV 或者 Binlog 节点。如果不存在，则继续执行指定的操作；如果存在，则执行如下操作：
        - 停止已经下线掉的节点的服务
        - 清理已经下线掉的节点的相关数据文件
        - 更新集群的拓扑，移除已经下线掉的节点
+ 对其他组件的操作
    - PD 组件的下线通过 API 将指定节点从集群中 `delete` 掉（这个过程很快），然后停掉指定 PD 的服务并且清除该节点的相关数据文件
    - 下线其他组件时，直接停止并且清除节点的相关数据文件

1. 查看并选择需要下线的节点。为了操作简便，我们采用指定 ID 的方式来下线节点，可以通过 `display` 命令来查看指定集群所有节点的 ID。这里选择 ID 为 `d294683d` 的 PD 节点。

```
$ tiops display -c tidb-test
TiDB cluster tidb-test, version 4.0.0-beta.1
Node list:
ID        Role        Host          Ports        Data Dir                                       Deploy Dir
e5f0e2d2  Monitoring  10.9.26.126   9090/9091    /home/tidb/data/tidb-test/monitoring-e5f0e2d2  /home/tidb/deploy/tidb-test/monitoring-e5f0e2d2
f8cd24a7  PD          10.9.26.126   2379/2380    /home/tidb/data/tidb-test/pd-f8cd24a7          /home/tidb/deploy/tidb-test/pd-f8cd24a7
g993a624  PD          10.9.170.207  2379/2380    /home/tidb/data/tidb-test/pd-g993a624          /home/tidb/deploy/tidb-test/pd-g993a624
d294683d  PD          10.9.20.15    2379/2380    /home/tidb/data/tidb-test/pd-d294683d          /home/tidb/deploy/tidb-test/pd-d294683d
a8e4c35a  TiDB        10.9.26.126   4000/10080   -                                              /home/tidb/deploy/tidb-test/tidb-a8e4c35a
abb1e0ca  TiDB        10.9.170.207  4000/10080   -                                              /home/tidb/deploy/tidb-test/tidb-abb1e0ca
db591398  Monitored   10.9.165.44   9100/9115    -                                              /home/tidb/deploy/tidb-test/monitored-db591398
d444b608  Monitored   10.9.170.207  9100/9115    -                                              /home/tidb/deploy/tidb-test/monitored-d444b608
hcbc7435  Monitored   10.9.26.126   9100/9115    -                                              /home/tidb/deploy/tidb-test/monitored-hcbc7435
de205f0f  TiKV        10.9.26.126   20160/20180  /home/tidb/data/tidb-test/tikv-de205f0f        /home/tidb/deploy/tidb-test/tikv-de205f0f
jd4610dc  TiKV        10.9.170.207  20160/20180  /home/tidb/data/tidb-test/tikv-jd4610dc        /home/tidb/deploy/tidb-test/tikv-jd4610dc
bcb3e186  TiKV        10.9.165.44   20160/20180  /home/tidb/data/tidb-test/tikv-bcb3e186        /home/tidb/deploy/tidb-test/tikv-bcb3e186
h592456d  TiKV        10.9.20.15    20160/20180  /home/tidb/data/tidb-test/tikv-h592456d        /home/tidb/deploy/tidb-test/tikv-h592456d
h5f8ca0d  Grafana     10.9.26.126   3001         -                                              /home/tidb/deploy/tidb-test/grafana-h5f8ca0d
```

1. 执行缩容操作。

```
$ tiops scale-in -c tidb-test -n d294683d
```

```
-c | --cluster-name 必选参数。用以标识需要扩容的集群
-n | --node-id 必选参数。用来指定缩容节点的 ID
-f | --forks 可选参数。执行命令时的并发数，默认：5；当节点数比较多时，可以适当调大
```

执行完成之后可以通过 `tiops display -c tidb-test --status` 命令检查缩容后的集群状态。
