# 在京东云上部署 TiDB 集群 

## 创建 Kubernetes 集群

参考官方文档 <https://docs.jdcloud.com/cn/jcs-for-kubernetes/create-to-cluster> 

## 连接集群

参考官方文档 https://docs.jdcloud.com/cn/jcs-for-kubernetes/connect-to-cluster

## 安装 Helm

1. 通过 <https://github.com/helm/helm/releases>  找到要下载的 helm 版本， TiDB Operator  要求 Helm 版本 < 3.0

   `wget https://get.helm.sh/helm-v2.16.1-linux-amd64.tar.gz`

2. 解压缩

   `tar -zxvf helm-v2.16.1-linux-amd64.tar.gz`

3. 在解压后的目录中找到二进制文件，并将其移动到所需的位置

   `mv linux-amd64/helm /usr/local/bin/helm`

4. 运行以下命令

   `helm help`

5. 为 Tiller 添加权限，详见 [Role-based Access Control](https://docs.helm.sh/using_helm/#role-based-access-control)，新建 rbac-config.yaml ，内容如下：

```
apiVersion: v1
kind: ServiceAccount
metadata:
  name: tiller
  namespace: kube-system
---
apiVersion: rbac.authorization.k8s.io/v1beta1
kind: ClusterRoleBinding
metadata:
  name: tiller
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
  - kind: ServiceAccount
    name: tiller
    namespace: kube-system
```

6. 初始化 Helm 并安装 Tiller 服务

```helm init --upgrade --service-account tiller```

如果无法下载镜像，可以用 `--tiller-image` 参数替换镜像地址

7. 运行以下命令

`helm version`

出现以下信息，确认安装成功

```
Client: &version.Version{SemVer:"v2.16.1", GitCommit:"bbdfe5e7803a12bbdf97e94cd847859890cf4050", GitTreeState:"clean"}
Server: &version.Version{SemVer:"v2.16.1", GitCommit:"bbdfe5e7803a12bbdf97e94cd847859890cf4050", GitTreeState:"clean"}
```

8. 配置 PingCAP 官方 chart 仓库 

```helm repo add pingcap https://charts.pingcap.org/```

## 安装 TiDB Operator

TiDB Operator 使用 [CRD (Custom Resource Definition)](https://kubernetes.io/docs/tasks/access-kubernetes-api/custom-resources/custom-resource-definitions/) 扩展 Kubernetes，所以要使用 TiDB Operator，必须先创建 `TidbCluster` 自定义资源类型。只需要在你的 Kubernetes 集群上创建一次即可。

```bash
kubectl apply -f https://raw.githubusercontent.com/pingcap/tidb-operator/master/manifests/crd.yaml && kubectl get crd tidbclusters.pingcap.com
```

创建 `TidbCluster` 自定义资源类型后，接下来在 Kubernetes 集群上安装 TiDB Operator。

1. 获取你要安装的 `tidb-operator` chart 中的 `values.yaml` 文件：

```
mkdir -p /home/tidb/tidb-operator && \
helm inspect values pingcap/tidb-operator --version=<chart-version> > /home/tidb/tidb-operator/values-tidb-operator.yaml
```

> **注意：**
>
> ```<chart-version>``` 在后续文中代表 chart 版本，例如 `v1.0.0`，可以通过  ```helm search -l tidb-operator``` 查看当前支持的版本

2. 配置 TiDB Operator

TiDB Operator 里面会用到 k8s.gcr.io/kube-scheduler 镜像，如果下载不了该镜像，可以通过修改 `/home/tidb/tidb-operator/values-tidb-operator.yaml` 文件中的 `scheduler.kubeSchedulerImageName` 替换镜像。

3. 安装 TiDB Operator

```
helm install pingcap/tidb-operator --name=tidb-operator --namespace=tidb-admin --version=<chart-version> -f /home/tidb/tidb-operator/values-tidb-operator.yaml && \
kubectl get po -n tidb-admin -l app.kubernetes.io/name=tidb-operator
```

## 自定义 TiDB Operator

通过修改 `/home/tidb/tidb-operator/values-tidb-operator.yaml` 中的配置自定义 TiDB Operator。后续文档使用 `values.yaml`  指代 `/home/tidb/tidb-operator/values-tidb-operator.yaml`。

TiDB Operator 有两个组件：

- tidb-controller-manager
- tidb-scheduler

这两个组件是无状态的，通过 `Deployment` 部署。你可以在 `values.yaml` 中自定义资源 `limit` 、`request` 和 `replicas`。

修改为 `values.yaml` 后，执行下面命令使配置生效：

```bash
helm upgrade tidb-operator pingcap/tidb-operator --version=<chart-version> -f /home/tidb/tidb-operator/values-tidb-operator.yaml
```

## 设置 ulimit 

TiDB 默认会使用很多文件描述符，工作节点和上面的 Docker 进程的 `ulimit` 必须设置大于等于 `1048576`：

- 重置京东云 Kubernetes 集群所有 Node 的登录密码

 ![重置登陆密码](/res/session2/chapter1/tidb-operator-deployment-public-jdcloud/1.png)

- 控制台登陆 Node

- 设置工作节点的 `ulimit` 值，详情可以参考[如何设置 ulimit](https://access.redhat.com/solutions/61334) 

`
  sudo vim /etc/security/limits.conf
`

  设置 root 账号的 `soft` 和 `hard` 的 `nofile` 大于等于 `1048576` 。

- 设置 Docker 服务的 `ulimit`
  `
  sudo vim /etc/systemd/system/docker.service
  `
设置 `LimitNOFILE` 大于等于 `1048576`

- 修改完后重启Node节点

> **注意：**
>
> `LimitNOFILE` 需要显式设置为 `1048576` 或者更大，而不是默认的 `infinity`，由于 `systemd` 的 [bug](https://github.com/systemd/systemd/commit/6385cb31ef443be3e0d6da5ea62a267a49174688#diff-108b33cf1bd0765d116dd401376ca356L1186)，`infinity` 在 `systemd` 某些版本中指的是 `65536`。

## 配置 TiDB 集群

### 配置 StorageClass

京东云为 Kubernetes 集群提供了自定义卷插件 [kubernetes.io/jdcloud-ebs](https://kubernetes.io/docs/concepts/storage/storage-classes/) ， 将 provisioner 定义为京东云自定义卷插件，可以使用京东云云硬盘为 Kubernetes 集群提供持久化存储。目前，在 Kubernetes 集群服务中，提供三种 StorageClass:

```bash
kubectl get storageclass
NAME                PROVISIONER                 AGE
default (default)   kubernetes.io/jdcloud-ebs   39d
jdcloud-hdd         kubernetes.io/jdcloud-ebs   39d
jdcloud-ssd         kubernetes.io/jdcloud-ebs   39d
```

您也可以创建自定义的 StorageClass ：

```
kind: StorageClass
apiVersion: storage.k8s.io/v1
metadata:
  name: mystorageclass-hdd1
provisioner: kubernetes.io/jdcloud-ebs
parameters:
  zones: cn-north-1a, cn-north-1b
  fstype: ext4
reclaimPolicy: RetainTiDB
```

参数说明：

1. provisioner ：设置参数值kubernetes.io/jdcloud-ebs，且不可修改，标识使用京东云云硬盘Provisioner插件创建。

2. reclaimPolicy ：由 storage class 动态创建的 Persistent Volume 会在的 reclaimPolicy 字段中指定回收策略，可以是 Delete 或者 Retain。如果 storageClass 对象被创建时没有指定 reclaimPolicy ，它将默认为 Delete。

3. parameters

type：设置参数值为 ssd.gp1 、ssd.io1 或 hdd.std1 ，分别对应京东云的通用型 SSD 云盘、性能型 SSD 云盘和容量型 HDD 云盘

|StorageClass type|	云硬盘类型	|容量范围	|步长|
| ---- | ---- | ---- | ---- |
|hdd.std1|	容量型hdd	|[20-16000]GiB|	10GiB|
|ssd.gp1	|通用型ssd	|[20-16000]GiB	|10GiB|
|ssd.io1	|性能型ssd	|[20-16000]GiB	|10GiB|

fstype ：设置文件系统类型，可选参数值为 xfs 和 ext4 ，如未指定 fstype ，将使用 ext4 作为默认的文件系统类型；例如： fstype=ext4 

更多参数说明，参考参数说明 <https://docs.jdcloud.com/cn/jcs-for-kubernetes/deploy-storageclass>  。

### 获取 Values 文件

通过下面命令获取待安装的 tidb-cluster chart 的 `values.yaml` 配置文件：

```bash
mkdir -p /home/tidb/<release-name> && \
helm inspect values pingcap/tidb-cluster --version=<chart-version> > /home/tidb/<release-name>/values-<release-name>.yaml
```

> **注意：**
>
> - `/home/tidb` 可以替换为你想用的目录。
> - `release-name` 将会作为 Kubernetes 相关资源（例如 Pod，Service 等）的前缀名，可以起一个方便记忆的名字，要求全局唯一，通过 `helm ls -q` 可以查看集群中已经有的 `release-name`。
> - `chart-version` 是 tidb-cluster chart 发布的版本，可以通过 `helm search -l tidb-cluster` 查看当前支持的版本。
> - 下文会用 `values.yaml` 指代 `/home/tidb/<release-name>/values-<release-name>.yaml`。

### 集群拓扑

默认部署的集群拓扑是：3 个 PD Pod，3 个 TiKV Pod，2 个 TiDB Pod 和 1 个监控 Pod。在该部署拓扑下根据数据高可用原则，TiDB Operator 扩展调度器要求 Kubernetes 集群中至少有 3 个节点。如果 Kubernetes 集群节点个数少于 3 个，将会导致有一个 PD Pod 处于 Pending 状态，而 TiKV 和 TiDB Pod 也都不会被创建。

Kubernetes 集群节点个数少于 3 个时，为了使 TiDB 集群能启动起来，可以将默认部署的 PD 和 TiKV Pod 个数都减小到 1 个，或者将 `values.yaml` 中 `schedulerName` 改为 Kubernetes 内置调度器 `default-scheduler`。

> **警告：**
>
> `default-scheduler` 仅适用于演示环境，改为 `default-scheduler` 后， TiDB 集群的调度将无法保证数据高可用，另外一些其它特性也无法支持，例如 [TiDB Pod StableScheduling](https://github.com/pingcap/tidb-operator/blob/master/docs/design-proposals/tidb-stable-scheduling.md) 等。

其它更多配置参数请参考 [TiDB 集群部署配置文档](/tidb-in-kubernetes/reference/configuration/tidb-cluster.md)。

## 部署 TiDB 集群

> **注意：**
> 
> - 京东云硬盘支持创建的磁盘大小范围为 `[20-16000]GiB` ,步长  `10G` ,  `values.yaml` 里 `PD`、`TiKV`、`Monitor`、`Drainer` 默认的磁盘大小不满足京东云盘的最小磁盘要求，需要修改为磁盘范围内的大小才可以正确创建 PV 。
>
> - 如果要使用京东云的 `LoadBalance` 服务，修改 `values.yaml` 中的 `Service` 类型为 `LoadBalancer`，更多 `LoadBalance` 的配置参考官方文档 <https://docs.jdcloud.com/cn/jcs-for-kubernetes/deploy-service> 

创建 Secret

```bash
kubectl create secret generic <tidb-secretname> --from-literal=root=<password> --namespace=<namespace>
```

修改 `values.yaml` 的 tidb 下的 `passwordSecretName`  为 `<tidb-secretname>` 设置 TiDB 的初始密码。

`values.yaml` 文件修改好以后，用以下命令创建 TiDB 集群

```bash
helm install pingcap/tidb-cluster --name=<release-name> --namespace=<namespace> --version=<chart-version> -f /home/tidb/<release-name>/values-<release-name>.yaml
```

> **注意：**
>
> `namespace` 是[命名空间](https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/)，你可以起一个方便记忆的名字，比如和 `release-name` 相同的名称。

通过下面命令可以查看 Pod 状态：
```bash
kubectl get po -n <namespace> -l app.kubernetes.io/instance=<release-name>
```

单个 Kubernetes 集群中可以利用 TiDB Operator 部署管理多套 TiDB 集群，重复以上命令并将 `release-name` 替换成不同名字即可。不同集群既可以在相同 `namespace` 中，也可以在不同 `namespace` 中，可根据实际需求进行选择。

TiDB 集群创建好后，通过下面的命令查看 TiDB Service 的 ClusterIP ：

```bash
$kubectl -n jddb-tidb get svc -l app.kubernetes.io/instance=jddb-tidb

NAME                       TYPE           CLUSTER-IP        EXTERNAL-IP                    PORT(S)                          AGE
jddb-tidb-discovery          ClusterIP      192.168.189.30    <none>                         10261/TCP                        13m
jddb-tidb-grafana            NodePort       192.168.190.3     <none>                         3000:32444/TCP                   13m
jddb-tidb-monitor-reloader   NodePort       192.168.186.142   <none>                         9089:31065/TCP                   13m
jddb-tidb-pd                 ClusterIP      192.168.191.21    <none>                         2379/TCP                         13m
jddb-tidb-pd-peer            ClusterIP      None              <none>                         2380/TCP                         13m
jddb-tidb-prometheus         NodePort       192.168.184.144   <none>                         9090:31907/TCP                   13m
jddb-tidb-tidb               LoadBalancer   192.168.186.9     116.196.66.243,192.168.176.4   4000:30859/TCP,10080:31266/TCP   13m
jddb-tidb-tidb-peer          ClusterIP      None              <none>                         10080/TCP                        11m
jddb-tidb-tikv-peer          ClusterIP      None              <none>                         20160/TCP                        12m
```

其中 jddb-tidb-tidb 即是 TiDB 的 Svc ，在公网可以通过 EXTERNAL-IP 中的公网 IP 访问，同一 VPC 下的云主机可以通过EXTERNAL-IP 中的公网 IP 或内网 IP 访问 TiDB 服务。