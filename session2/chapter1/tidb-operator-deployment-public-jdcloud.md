# 在京东云上部署 TiDB 集群 

## 创建 Kubernetes 集群

### 确认地域及实例配置

**确定实例所在地域**

京东云不同地域之间完全隔离，保证不同地域间最大程度的稳定性和容错性。当前覆盖国内华北-北京、华南-广州、华东-宿迁及华东-上海四地域。

目前 Kubernetes 集群在华北-北京、华南-广州、华东-上海开放服务。

选择地域时建议考虑以下几点：

- 集群与其他京东云产品间的部署关系；
- 不同地域之间的云产品默认不能通过内网通信；
- 集群默认不可跨地域内网互访，默认不可跨地域访问云数据库及云缓存等；
- 在集群中创建云硬盘类型的持久化存储时，仅支持绑定同可用区下的云硬盘；
- 上述内网互通是均指同一账户下的资源互通，不同账户的资源内网完全隔离。

**选择工作节点组规格配置**

正式部署业务前建议您使用按配置计费实例来进行性能测试，找到与您业务量匹配的实例规格及其他资源配置。目前 Kubernetes 集群工作节点组只支持按配置计费的二代实例规格，可参考[实例规格类型](https://docs.jdcloud.com/cn/virtual-machines/instance-type-family)。

### 创建集群

1. 打开控制台，选择[弹性计算>>Kubernetes集群>>集群服务>>集群](https://cns-console.jdcloud.com/host/kubernetes/list)
![新建Kubernetes集群信息](/res/session2/chapter1/tidb-operator-deployment-public-jdcloud/1.png)

2. 选择地域及可用区：建议您根据业务情况选择集群所在地域及可用区；默认选中指定地域下的所有可用区，推荐使用默认模式；也可取消选中某个或某几个可用区，但需要至少保证有一个可用区被选中。

3. 设置名称、描述：名称不可为空，只支持中文、数字、大小写字母、英文下划线 “ _ ”及中划线 “ - ”，且不能超过 32 字符；描述为非必填项，长度不超过 256 字符。

4. 管理节点版本：目前支持 1.12.3 版本。

5. 管理节点 CIDR :与其他私有网络的 CIDR 不可重叠， CIDR 掩码取值范围为 24 ~ 27 。 CIDR 的设置规则参考[ VPC 配置](https://docs.jdcloud.com/cn/virtual-private-cloud/vpc-configuration)帮助文档。

6. 证书认证、基础认证：默认全部开启，建议全部保留；需要至少保留一个为开启状态；

- 证书认证：基于 base64 编码的证书，用于客户端到集群服务端点的认证；建议开启证书认证；
- 基础认证：开启后允许客户端使用用户名、密码在集群服务端点认证。

7. 添加 Accesskey ：选择启动状态下的 Accesskey ；如果无可用 Access Key ，请前往 Access Key 管理页面创建新的 Access Key ，并在开启状态。可参考[ Accesskey 管理](https://docs.jdcloud.com/cn/account-management/accesskey-management)。

8. 集群监控：开启后将提供 Kubernetes 集群基础监控和集群 workload 自定义监控；详情参考[集群监控](https://docs.jdcloud.com/cn/jcs-for-kubernetes/cluster-monitor)。

 ### 新建工作节点组：

创建新集群时需要添加一个工作节点组，在创建集群页面上即可配置工作节点组相关的参数。

![新建集群增加工作节点组](/res/session2/chapter1/tidb-operator-deployment-public-jdcloud/2.png)

1. 私有网络：选择部署工作节点组资源的私有网络：

- 京东云将在选择的私有网络中新建四个子网，包括工作节点子网、 Pod 子网、 Service 子网和 Service-LB 子网，并为每个子网新建一个路由表；
- 上述私有网络中新建的子网 CIDR 与私有网络中其他已创建的子网 CIDR 不能重叠；详情参考[子网配置](https://docs.jdcloud.com/cn/virtual-private-cloud/subnet-configuration)；
- 工作节点组与管理节点将通过 VPC 对等连接网络互通，因此已选择的私有网络 CIDR 与管理节点 CIDR 不能重叠；详情参考[ VPC 对等连接](https://docs.jdcloud.com/cn/virtual-private-cloud/vpc-peering-configuration)；
- 为了避免因 CIDR 重叠导致工作节点相关的子网无法创建，建议[新建私有网络](https://docs.jdcloud.com/cn/virtual-private-cloud/vpc-configuration)；
- 私有网络 CIDR 取值范围为 16 ~ 18 。
- 创建集群时会对私有网络的相关配额进行校验，请保证私有网络相关配额充足，详情参考[私有网络使用限制](https://docs.jdcloud.com/cn/virtual-private-cloud/restrictions)。

2. 选择工作节点组版本：推荐选择与当前管理节点版本匹配的默认工作节点组版本；点击下拉列表显示当前管理节点版本支持的所有工作节点组版本。

3. 规格：根据具体业务情况选择不同工作节点规格类型，支持云主机第二代规格和 GPU 型实例规格。可参考[实例规格类型](https://docs.jdcloud.com/cn/virtual-machines/instance-type-family)。

- 京东云使用云主机做为集群的工作节点；
- 每个工作节点组内的工作节点具有相同的规格类型;
- 您可以为集群[添加多个节点组](https://docs.jdcloud.com/cn/jcs-for-kubernetes/create-nodegroup)，每个节点组指定不同的规格类型，以满足不同类型的应用负载对实例规格的需求；

4. 数量：默认数量为 3 ，可根据需求点击增加、减少按键或者直接输入预期节点数量；工作节点最大数量受当前地域[云主机配额](https://docs.jdcloud.com/cn/virtual-machines/restrictions)、工作节点子网 CIDR 可分配的内网IP数量限制。

- 每增加一个工作节点将在指定地域/可用区内新建一个云主机；
- 如需对集群的节点数量进行调整，您可以对指定节点组进行[手动伸缩](https://docs.jdcloud.com/cn/jcs-for-kubernetes/telescopic-nodegroup)或通过[添加工作节点组](https://docs.jdcloud.com/cn/jcs-for-kubernetes/create-nodegroup)、[删除工作节点组](https://docs.jdcloud.com/cn/jcs-for-kubernetes/delete-nodegroup)的方式进行；

5. 名称：默认名称为 nodegroup1 ，名称不可为空，只支持中文、数字、大小写字母、英文下划线“_”及中划线“-”，且不能超过 32 字符。同一集群下的工作节点组不可重名。

6. 以下为高级选项，非必填项：

- 描述：描述不能超过 256 个字符；
- 系统盘：本地盘，容量默认为 100G ，不可修改；
- 自动修复：开启后将对非 running 或 ready 状态的工作节点进行自动修复。更多详情参考[自动修复说明](https://docs.jdcloud.com/cn/jcs-for-kubernetes/auto-repair)；
- 标签：设置添加到工作节点上标签的键、值；键由前缀和名称组成；前缀不超过 253 字符，由 DNS 子域名组成，每个子域名不超过 63 字符，且必须以小写字母数字起止，可包含“-”“.”、大小写字母和数字；名称和值均不能超过 63 字符，必须以大小写字母或数字起止，可包含“-”“ _ ”“.”、大小写字母和数字；最多可添加五组标签。

7. 完成相关设置后，点击确定，即可进入弹性计算>> Kubernetes 集群>>集群服务>>工作节点组，查看创建的工作节点组。

## 连接集群

**安装 kubectl 客户端** 

Kubernetes  命令行客户端  kubectl 可以让您从客户端计算机连接到  Kubernetes  集群，实现应用部署。

### 1. kubectl 版本

kubectl 版本可以集群版本一致，或者集群版本 +1 。集群版本为 1.12.3 时，推荐下载的 Kubectl 版本为 1.12.3；

### 2. 安装和设置 kubectl 客户端

打开[Kubernetes 版本页面](https://github.com/kubernetes/kubernetes/blob/master/CHANGELOG-1.12.md) ，找到 client binaries （也就是 kubectl ），选择对应操作系统的客户端，然后复制链接地址。示例，选择 kubectl 版本 1.12.3 ， Centos 7.4 64 位系统下,链接地址为<https://dl.k8s.io/v1.12.3/kubernetes-client-linux-amd64.tar.gz>;

京东云提供了 1.12.3 版本的 kubectl 客户端，您可以直接下载使用，详情参考如下命令：

```
wget https://kubernetes.s3.cn-north-1.jdcloud-oss.com/kubectl/1.12.3/kubernetes-client-linux-amd64.tar.gz
tar -zxvf kubernetes-client-linux-amd64.tar.gz
cd kubernetes/client/bin
chmod +x ./kubectl
sudo mv ./kubectl /usr/local/bin/kubectl
```

具体其他系统安装，还请参考[官方文档](https://kubernetes.io/docs/tasks/tools/install-kubectl/) 

### 3. 配置集群凭据

凭据在 Kubernetes 集群-集群服务-集群-详情页- kubectl 客户端配置，将凭据复制到本机$HOME/.kube/config；配置完成后，您即可以使用  kubectl  从本地计算机访问 Kubernetes 集群。 例： Centos 7.4 64 位系统下，执行以下命令：

```bash
mkdir -p ~/.kube
touch ~/.kube/config
vi ~/.kube/config
```

保存凭据完成，执行以下命令验证：

`kubectl version`

出现以下内容，即为配置成功：

```
Client Version: version.Info{Major:"1", Minor:"12", GitVersion:"v1.12.3", GitCommit:"5d26aba6949f188fde1af4875661e038f538f2c6", GitTreeState:"clean", BuildDate:"2018-04-23T23:17:12Z", GoVersion:"go1.12.3", Compiler:"gc", Platform:"linux/amd64"}
Server Version: version.Info{Major:"1", Minor:"12+", GitVersion:"v1.12.3-23.56f6f14",GitCommit:"9d2635d891e745a24d6863cd6
```

## 安装 Helm

1. 通过<https://github.com/helm/helm/releases>  找到要下载的 helm 版本， TiDB Operator  要求 Helm 版本 < 3.0

   `wget https://get.helm.sh/helm-v2.16.1-linux-amd64.tar.gz`

2. 解压缩

   `tar -zxvf helm-v2.16.1-linux-amd64.tar.gz`

3. 在解压后的目录中找到二进制文件，并将其移动到所需的位置

   `mv linux-amd64/helm /usr/local/bin/helm`

4. 运行以下命令

   `helm help`

5. 为 Tiller 添加权限，详见[Role-based Access Control](https://docs.helm.sh/using_helm/#role-based-access-control)，新建 rbac-config.yaml ，内容如下：

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

```helm init --upgrade --service-account tiller --tiller-image registry.docker-cn.com/rancher/tiller:v2.7.2```

7. 运行以下命令

```helm version```

出现以下信息，确认安装成功

```
Client: &version.Version{SemVer:"v2.7.2", GitCommit:"8478fb4fc723885b155c924d1c8c410b7a9444e6", GitTreeState:"clean"}
Server: &version.Version{SemVer:"v2.7.2", GitCommit:"8478fb4fc723885b155c924d1c8c410b7a9444e6", GitTreeState:"clean"}
```

8. 配置 PingCAP 官方 chart 仓库 

```helm repo add pingcap https://charts.pingcap.org/```

## 安装 TiDB Operator

TiDB Operator 使用 [CRD (Custom Resource Definition)](https://kubernetes.io/docs/tasks/access-kubernetes-api/custom-resources/custom-resource-definitions/) 扩展 Kubernetes，所以要使用 TiDB Operator，必须先创建 `TidbCluster` 自定义资源类型。只需要在你的 Kubernetes 集群上创建一次即可

```bash
kubectl apply -f https://raw.githubusercontent.com/pingcap/tidb-operator/master/manifests/crd.yaml && kubectl get crd tidbclusters.pingcap.com
```

创建 `TidbCluster` 自定义资源类型后，接下来在 Kubernetes 集群上安装 TiDB Operator。

1. 获取你要安装的 `tidb-operator` chart 中的 `values.yaml` 文件：

 ```
mkdir -p /home/tidb/tidb-operator && \
helm inspect values pingcap/tidb-operator --version=<chart-version> > /home/tidb/tidb-operator/values-tidb-operator.yaml
 ```

>**注意：**
>
> ```<chart-version>``` 在后续文中代表 chart 版本，例如 `v1.0.0`，可以通过  ```helm search -l tidb-operator``` 查看当前支持的版本

2. 配置 TiDB Operator

TiDB Operator 里面会用到 k8s.gcr.io/kube-scheduler 镜像，如果下载不了该镜像，可以通过修改 ```/home/tidb/tidb-operator/values-tidb-operator.yaml``` 文件中的 ```scheduler.kubeSchedulerImageName```替换镜像。

3. 安装 TiDB Operator

```
helm install pingcap/tidb-operator --name=tidb-operator --namespace=tidb-admin --version=<chart-version> -f /home/tidb/tidb-operator/values-tidb-operator.yaml && \
kubectl get po -n tidb-admin -l app.kubernetes.io/name=tidb-operator
```

## 自定义 TiDB Operator

通过修改 `/home/tidb/tidb-operator/values-tidb-operator.yaml` 中的配置自定义 TiDB Operator。后续文档使用 `values.yaml` 指代 `/home/tidb/tidb-operator/values-tidb-operator.yaml`。

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

- ![重置登陆密码](/res/session2/chapter1/tidb-operator-deployment-public-jdcloud/3.png)

- 控制台登陆 Node

- 设置工作节点的 `ulimit` 值，详情可以参考[如何设置 ulimit](https://access.redhat.com/solutions/61334) 

  ```
  sudo vim /etc/security/limits.conf
  ```

  设置 root 账号的 `soft` 和 `hard` 的 `nofile` 大于等于 `1048576`

- 设置 Docker 服务的 `ulimit`
  ```
  sudo vim /etc/systemd/system/docker.service
  ```
  设置 `LimitNOFILE` 大于等于 `1048576`。

> **注意：**
>
> `LimitNOFILE` 需要显式设置为 `1048576` 或者更大，而不是默认的 `infinity`，由于 `systemd` 的 [bug](https://github.com/systemd/systemd/commit/6385cb31ef443be3e0d6da5ea62a267a49174688#diff-108b33cf1bd0765d116dd401376ca356L1186)，`infinity` 在 `systemd` 某些版本中指的是 `65536`。重置所有node的密码

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

1、 provisioner ：设置参数值kubernetes.io/jdcloud-ebs，且不可修改，标识使用京东云云硬盘Provisioner插件创建。

2、 reclaimPolicy ：由 storage class 动态创建的 Persistent Volume 会在的 reclaimPolicy 字段中指定回收策略，可以是 Delete 或者 Retain。如果 storageClass 对象被创建时没有指定 reclaimPolicy ，它将默认为 Delete。

3、parameters

type：设置参数值为 ssd.gp1 、ssd.io1 或 hdd.std1 ，分别对应京东云的通用型 SSD 云盘、性能型 SSD 云盘和容量型 HDD 云盘；

|StorageClass type|	云硬盘类型	|容量范围	|步长|
| ---- | ---- | ---- | ---- |
|hdd.std1|	容量型hdd	|[20-16000]GiB|	10GiB|
|ssd.gp1	|通用型ssd	|[20-16000]GiB	|10GiB|
|ssd.io1	|性能型ssd	|[20-16000]GiB	|10GiB|

fstype ：设置文件系统类型，可选参数值为 xfs 和 ext4 ，如未指定 fstype ，将使用 ext4 作为默认的文件系统类型；例如： fstype=ext4；

更多参数说明，参考参数说明参考<https://docs.jdcloud.com/cn/jcs-for-kubernetes/deploy-storageclass> 

### 获取Values文件

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

> **注意**
>京东云硬盘支持创建的磁盘大小范围为 [20-16000]GiB ,步长 10G ,默认values.yaml里pd的磁盘不满足京东云盘的最小磁盘要求，需要修改 values.yaml 里的磁盘大小。

创建Secret

```bash
kubectl create secret generic <tidb-secretname> --from-literal=root=<password> --namespace=<namespace>
```

修改``` values.yaml ```的 tidb 下的``` passwordSecretName ``` 为<tidb-secretname> 设置 TiDB 的初始密码。

values.yaml 文件修改好以后，用以下命令创建 TiDB 集群

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

TiDB集群创建好后，通过下面的命令查看TiDB Service的ClusterIP：

```bash
#kubectl -n  <namespace> get svc   -l app.kubernetes.io/instance=<release-name>
NAME                       TYPE        CLUSTER-IP        EXTERNAL-IP   PORT(S)                          AGE
mytidb1-discovery          ClusterIP   192.168.191.226   <none>        10261/TCP                        9h
mytidb1-grafana            NodePort    192.168.189.0     <none>        3000:30376/TCP                   9h
mytidb1-monitor-reloader   NodePort    192.168.191.144   <none>        9089:30379/TCP                   9h
mytidb1-pd                 ClusterIP   192.168.185.70    <none>        2379/TCP                         9h
mytidb1-pd-peer            ClusterIP   None              <none>        2380/TCP                         9h
mytidb1-prometheus         NodePort    192.168.188.8     <none>        9090:31642/TCP                   9h
mytidb1-tidb               NodePort    192.168.186.104   <none>        4000:32594/TCP,10080:30972/TCP   9h
mytidb1-tidb-peer          ClusterIP   None              <none>        10080/TCP                        8h
mytidb1-tikv-peer          ClusterIP   None              <none>        20160/TCP                        9h

```