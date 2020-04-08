# 1.3.2 基于 TiDB Operator 的集群扩缩容

本节介绍如何对基于 TiDB Operator 部署的 TiDB 集群进行水平和垂直扩缩容。

## 1. 环境准备

- 参考[本地测试环境](/session2/chapter1/tidb-operator-local-deployment.md)或[生产环境](/session2/chapter1/tidb-operator-deployment-private-tidb.md)的部署指引，使用 TiDB Operator 部署 TiDB 集群。

- 在本例中，release 的名称为 `test`，在 `dba-test` 命名空间下，chart 文件放置在 `/home/charts/tidb-cluster` 路径下。初始 TiDB 集群配置：
  - 3 个 PD 节点
  - 2 个 TiDB 节点
  - 3 个 TiKV 节点

## 2. 水平扩缩容

### 水平扩缩容原理

TiDB 集群水平扩缩容操作指的是通过增加或减少节点的数量，来达到集群扩缩容的目的。扩缩容 TiDB 集群时，会按照填入的 `replicas` 值，对 PD、TiKV、TiDB 进行顺序扩缩容操作。扩容操作按照节点编号由小到大增加节点，缩容操作按照节点编号由大到小删除节点。

### 水平扩缩容操作步骤

(1) 修改集群的 `value.yaml` 文件中的 `pd.replicas`、`tidb.replicas`、`tikv.replicas` 至期望值（本例中为 3、3、4）。

(2) 执行 `helm upgrade` 命令进行扩缩容：

    ```shell
    # helm upgrade test /home/charts/tidb-cluster -f /home/charts/tidb-cluster/values.yaml
    Release "test" has been upgraded. Happy Helming!
    LAST DEPLOYED: Sun Mar  8 15:39:57 2020
    NAMESPACE: dba-test
    STATUS: DEPLOYED
    ```

(3) 查看集群水平扩缩容状态：

    ```shell
    # watch kubectl get po -n dba-test
    ```

    当所有组件的 Pod 数量都达到了预设值（本例中为 3 个 PD 节点、3 个 TiDB 节点、4 个 TiKV 节点），并且都进入  `Running` 状态后，水平扩缩容完成。

    ```shell
    NAME                              READY   STATUS    RESTARTS   AGE
    test-discovery-668b48577c-zw4jh   1/1     Running   0          116m
    test-monitor-86797cd996-9ggfh     3/3     Running   0          116m
    test-pd-0                         1/1     Running   0          116m
    test-pd-1                         1/1     Running   0          116m
    test-pd-2                         1/1     Running   1          116m
    test-tidb-0                       2/2     Running   0          112m
    test-tidb-1                       2/2     Running   0          112m
    test-tidb-2                       2/2     Running   0          2m52s
    test-tikv-0                       1/1     Running   0          114m
    test-tikv-1                       1/1     Running   0          114m
    test-tikv-2                       1/1     Running   0          114m
    test-tikv-3                       1/1     Running   0          2m52s
    ```

> **注意：**
>
> - PD、TiKV 组件在滚动升级的过程中不会触发扩缩容操作。
> - TiKV 组件在缩容过程中会调用 PD 接口将对应 TiKV 标记为下线，然后将其上所有 Region 迁移到其它 TiKV 节点，在数据迁移期间 TiKV Pod 依然是 `Running` 状态，数据迁移完成后对应 Pod 才会被删除，缩容时间与待缩容的 TiKV 上的数据量有关，可以通过 `kubectl get tidbcluster -n <namespace> <release-name> -o json | jq '.status.tikv.stores'` 查看 TiKV 是否处于下线 `Offline` 状态。
> - PD、TiKV 组件在缩容过程中被删除的节点的 PVC 会保留，并且由于 PV 的 `Reclaim Policy` 设置为 `Retain`，即使 PVC 被删除，数据依然可以找回。
> - TiKV 组件不支持在缩容过程中进行扩容操作，强制执行此操作可能导致集群状态异常。假如异常已经发生，可以参考 [TiKV Store 异常进入 Tombstone 状态](https://pingcap.com/docs-cn/stable/tidb-in-kubernetes/troubleshoot#tikv-store-异常进入-tombstone-状态) 进行解决。

## 3. 垂直扩缩容

### 垂直扩缩容原理

垂直扩缩容操作指的是通过增加或减少节点的资源限制，来达到集群扩缩容的目的。垂直扩缩容本质上是按照节点编号由大到小的顺序，滚动升级节点的过程。

### 垂直扩缩容操作步骤

(1) 修改 `values.yaml` 文件中的 `tidb.resources`、`tikv.resources`、`pd.resources` 至期望值。

(2) 执行 `helm upgrade` 命令进行升级：

    ```shell
    # helm upgrade test /home/charts/tidb-cluster -f /home/charts/tidb-cluster/values.yaml
    Release "test" has been upgraded. Happy Helming!
    LAST DEPLOYED: Sun Mar  8 15:57:03 2020
    NAMESPACE: dba-test
    STATUS: DEPLOYED
    ```

(3) 查看升级进度：

    ```shell
    # watch kubectl -n <namespace> get pod -o wide
    ```

    当所有 Pod 都重建完毕进入 `Running` 状态后，垂直扩缩容完成。

> **注意：**
>
> - 如果在垂直扩容时修改了资源的 `requests` 字段，由于 PD、TiKV 使用了 `Local PV`，升级后还需要调度回原节点，如果原节点资源不够，则会导致 Pod 一直处于 `Pending` 状态而影响服务。
> - TiDB 作为一个可水平扩展的数据库，推荐通过增加节点个数发挥 TiDB 集群可水平扩展的优势，而不是类似传统数据库升级节点硬件配置来实现垂直扩容。
