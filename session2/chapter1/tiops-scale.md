# TiOps 扩缩容

在 TiOps 之前，扩缩容是通过 Ansible 完成，但操作颇为繁琐。现在用 TiOps 可以优雅的完成这些。

## 扩容

扩容的过程如同部署一样，TiOps 会先保证节点的 ssh 连接，在目标节点上创建必要的目录，然后执行部署。其中 PD 节点的扩容会通过 join 方式加入到集群中，并且会更新与 PD 有关联的服务的配置，其他服务直接启动加入到集群中。所有服务在扩容时都会验证是否扩容成功，然后返回命令执行是否成功。

例如在集群 tidb-test 中扩容一个 TiKV 的节点和一个 PD 节点：

1. 新建 scale.yaml 文件，添加 TiKV 和 PD 节点 IP，注意新建一个文件，不要在原来的拓扑文件上修改。

```yaml
---

pd_servers:
  - ip: 10.9.20.15

tikv_servers:
  - ip: 10.9.20.15
```

1. 执行扩容

```
$ tiops scale-out -c tidb-test -T scale.yaml
```

`-c` 和 `-T` 是必选参数，其他可选参数为：
```
--check-cpu 检查 CPU vcores 数量是否符合要求，默认：disable
--enable-check-mem 检查 Memory Size 是否符合要求，默认：disable
--enable-check-disk 检查 Disk Available Space 是否符合要求 ，默认：disable
--enable-check-iops 检查数据盘 IOPS 以及 latency 是否符合要求，默认：disable
--enable-check-all  检查 CPU、Memory、Disk、IOPS 是否符合要求，默认：disable
--local-pkg 若无外网，可将安装包拷贝中控机本地，通过此参数指相关路径进行离线安装
-f | --forks 并发执行数量，默认：5
```

完成之后通过 `tiops display -c tidb-test --status` 可以检查扩容后的集群状态。

## 缩容

缩容即下线服务，只停止服务，不会删除数据。TiKV 和 binlog 组件下线过程耗时较长，TiOps 通过 API 将其下线后直接退出而不等待下线完成，其他组件都是直接将服务下线后更新 topolygy。后续执行 tiops 命令时会检查 TiKV 和 binlog 是否下线完成，下线完成则执行清理和更新 topolygy。整个下线过程都可以通过 `diaplay` 命令查看状态，确认是否下线完成。

1. 选择下线节点

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
这里选择节点 ID 为 `d294683d` 的 PD 节点。

1. 执行缩容

```
$ tiops scale-in -c tidb-test -n d294683d
```

`-c` 和 `-n` 是必选参数，其他可选参数为：
```
-f | --forks 并发执行数量，默认：5
```

完成之后通过 `tiops display -c tidb-test --status` 可以检查缩容后的集群状态。
