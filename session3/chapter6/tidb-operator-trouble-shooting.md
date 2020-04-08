# 第6章 TiDB Operator 故障诊断

本文将介绍 Kubernetes 上 TiDB 集群的一些常见故障以及诊断解决方案。

## 6.1 创建集群

### 6.1.1 镜像拉取失败

#### 问题分析

由于网络限制访问相关镜像仓库，部署 Kubernetes 时常拉取失败，给使用带来了较大不便。

#### 解决方案

主要通过镜像和代理的方式拉取，这里推荐一个好用的开源工具 docker-wrapper 方便手动拉取。

```
git clone https://github.com/silenceshell/docker-wrapper.git
cd docker-wrapper/
# 测试拉取 k8s.gcr.io 的一个例子
./docker-wrapper.py pull k8s.gcr.io/kube-apiserver:v1.16.0
-- pull k8s.gcr.io/kube-apiserver:v1.16.0 from gcr.azk8s.cn/google-containers/kube-apiserver:v1.16.0 instead --
...
-- pull k8s.gcr.io/kube-apiserver:v1.16.0 done --
```

如果是生产环境，推荐采用 Kubernetes 的一些管理平台来部署和管理 Kubernetes 集群，同时在管理平台上设置镜像代理。如果采用镜像拉取到内网 image registry 的话，TiDB 的 helm chart 要更改对应的 image 设置。

### 6.1.2 PD 处于 Running 运行中状态，但 TiKV 未开始创建

#### 问题分析

Pod 的状态处于 Running，表示容器已经绑定到一个节点，同时 Pod 中所有容器都已被创建。此时容器可能处于正在运行中、或者正处于启动或重启中。

PD 启动逻辑： Pod 启动时依赖启动脚本 pd_start_script.sh，通过 Service DNS 循环调用 discovery 进行注册及获得启动参数，discovery 也通过 Service DNS 访问 PD 获取最新的集群 members 地址。

由于无明显表象，只能通过日志等方式深入容器内部排查。

#### 解决方案

查看 Pod 内容器的日志

```
# 查看所有 pods
kubectl  get pods -n <namespace>
# 查看 events 是否有异常
kubectl describe -n <namespace> pods <pd pod-name>
# 查看相关日志, 检查是否有 nslookup 解析失败的异常问题
kubectl logs -n <namespace> pods <pd pod-name>
# 管理工具
tkctl debug <pd-name>
```

根据经验主要是网络相关问题引起，建议从如下两方面进行排查：

* DNS 解析是否正常

```
# 检查 DNS 是否成功解析
kubectl exec -it <discovery pod name> -n=<namespace>  -- nslookup <service dns>
# 成功解析 headless service dns 的示例
$ kubectl exec -it tidb-cluster-discovery-6b7f8d9954-48ngh -n=tidb  -- nslookup tidb-cluster-pd-peer.tidb.svc
Name:      tidb-cluster-pd-peer.tidb.svc
Address 1: 10.244.2.19 tidb-cluster-pd-0.tidb-cluster-pd-peer.tidb.svc.cluster.local
Address 2: 10.244.1.13 10-244-1-13.tidb-cluster-pd.tidb.svc.cluster.local
Address 3: 10.244.3.11 10-244-3-11.tidb-cluster-pd.tidb.svc.cluster.local
# 成功解析 cluser ip service dns 的示例
$ kubectl exec -it tidb-cluster-discovery-6b7f8d9954-48ngh -n=tidb  -- nslookup tidb-cluster-prometheus.tidb.svc
Name:      tidb-cluster-prometheus.tidb.svc
Address 1: 10.107.103.198 tidb-cluster-prometheus.tidb.svc.cluster.local
```

若 DNS 解析失败，请检查是否已成功启动 CoreDNS 组件或配置是否正确。

```
# 失败解析的示例
nslookup: can't resolve 'tidb-cluster-prometheus.tidb.svc1': Name does not resolve
command terminated with exit code
# 检查 CoreDNS 组件是否正常运行
kubectl  get pods -n kube-system | grep core
coredns-9d85f5447-642rs          1/1     Running   1          13h
coredns-9d85f5447-8swr2          1/1     Running   1          13h
# 若 CoreDNS 正常运行仍不能成功解析 DNS
# 登陆 pd pod，检查 /etc/resov 中的 nameserver 是否配置正确
kubectl exec -it tidb-cluster-pd-0 -n=tidb  -- cat /etc/resolv.conf
```

* IP 网络是否连通

详见 1.5 Pod 之间网络不通

### 6.1.3 容器处于 CrashLoopBackOff 状态

#### 问题分析

Pod 处于 CrashLoopBackOff 状态意味着 Pod 内的容器重复地异常退出。可能导致 CrashLoopBackOff 的原因有很多，最有效的定位办法是查看 Pod 容器的日志

#### 解决方案

* 查看 Pod 内容器的日志

```
# 寻找容器进程退出或者健康检查失败退出相关日志
kubectl -n <namespace> logs -f <pod-name>
# 当前 Pod 可能发生了多次 CrashLoopBackOff，根因可能在上一次的启动日志的情况
kubectl -n <namespace> logs -p <pod-name>
```

确认日志中的错误信息后，可以根据 [tidb-server 启动报错](https://pingcap.com/docs-cn/stable/how-to/troubleshoot/cluster-setup#tidb-server-%E5%90%AF%E5%8A%A8%E6%8A%A5%E9%94%99)，[tikv-server 启动报错](https://pingcap.com/docs-cn/stable/how-to/troubleshoot/cluster-setup#tikv-server-%E5%90%AF%E5%8A%A8%E6%8A%A5%E9%94%99)，[pd-server 启动报错](https://pingcap.com/docs-cn/stable/how-to/troubleshoot/cluster-setup#pd-server-%E5%90%AF%E5%8A%A8%E6%8A%A5%E9%94%99) 中的指引信息进行进一步排查解决

* 案例一：TiKV Pod 日志中出现 “cluster id mismatch”

TiKV Pod 使用的数据可能是其他或之前的 TiKV Pod 的旧数据。在集群配置本地存储时未清除机器上本地磁盘上的数据，或者强制删除了 PV 导致数据并没有被 local volume provisioner 程序回收，可能导致 PV 遗留旧数据，导致错误。

在确认该 TiKV 应作为新节点加入集群、且 PV 上的数据应该删除后，可以删除该 TiKV Pod 和关联 PVC。TiKV Pod 将自动重建并绑定新的 PV 来使用。集群本地存储配置中，应对机器上的本地存储删除，避免 Kubernetes 使用机器上遗留的数据。集群运维中，不可强制删除 PV，应由 local volume provisioner 程序管理。用户通过创建、删除 PVC 以及设置 PV 的 reclaimPolicy 来管理 PV 的生命周期。

* 案例二：Node 节点 ulimit 设置不足

```
root             soft    nofile          1000000
root             hard    nofile          1000000
root             soft    core            1048576
root             hard    core            1048576
```

TiKV 在 ulimit 不足时也会发生启动失败的状况，对于这种情况，可以修改 Kubernetes 节点的 /etc/security/limits.conf 调大 ulimit

* 案例三：部分 pd 的 pod 反复 CrashLoopBackOff

在节点维护或者自动故障转移的场景下，部分 pd 的 pod 反复 CrashLoopBackOff。查看异常 pod 的日志可见：

```
waiting for discovery service to return start args...
```

可在 Kubernetes 内部尝试访问 discovery 的 service:

```
kubectl get service -n {your namespace} | grep discovery //get ip port
telnet {ip} {port}
```

如果访问失败，可尝试重启 discovery 服务

```
kubectl delete po {clustername}-discovery-xxxxxxxx-xxxxx -n {your namespace}
```

如果重启后问题仍然存在，可尝试查看 discovery 的 pod 日志：

```
kubectl logs -f {clustername}-discovery-xxxxxxxx-xxxxx -n {your namespace}
```

如有类似日志：

```
E1218 15:49:00.395064       1 mux.go:58] failed to discover: {cluster-name}-pd-3.{cluster-name}-pd-peer.{cluster-name}.svc:2380, Get http://{cluster-name}-pd.{cluster-name}:2379/pd/api/v1/members: dial tcp x.x.x.x:2379: connect: connection refused
```

可以观察 pd 的 service 状态：

```
wget -c http://{cluster-name}-pd.{cluster-name}:2379/pd/api/v1/members
```

同时观察 pd 的 pod 状态：

```
wget -c http://{ip of pd's pod}:2379/pd/api/v1/members
```

如果第一个 wget 命令失败，但是第二个 wget 命令成功，则可判断 Kubernetes 集群的 kube-proxy 是否有问题。关于 kube-proxy 的状态分析，可参考 Kubernetes 文档分析 kube-proxy 日志。也可通过实验验证 kube-proxy 的有效性：

首先部署一个 nginx 服务：

```
kubectl apply -f https://raw.githubusercontent.com/kubernetes/website/master/content/en/examples/service/networking/run-my-nginx.yaml
```

然后将它暴露成一个 service：

```
kubectl expose deployment/my-nginx
```

之后访问这个 service 验证是否成功，如果失败则 kube-proxy 是有问题的。可以重启 kube-proxy 来尝试解决问题。如果问题仍然存在，则需要检查 Kubernetes 的网络配置情况，具体可参考 Kubernetes 文档。

* 案例四 部分 pd 的 pod 反复 CrashLoopBackOff 的第二种情况

chart 中预设的 pd replicas 为 3，但是出现了 pd 的 pod 为 5 个的情况，3 个非 running 的状态，这 3 个互相 join，且反复 CrashLoopBackoff。现象如下：

![图片](https://uploader.shimo.im/f/sEpHoL1KCaY4gfdt.png!thumbnail)

查看 PD 的 pod 日志：

![图片](https://uploader.shimo.im/f/27Al2fBM0AMgflDL.png!thumbnail)

日志中可见打开一些文件失败，可以查看 pod 的本地目录文件状态。如果发现目录是不完整的，需要考虑 PV 设置是否正常，比如是否为 Retain 状态等。

查看 provisioner 的日志，如下：

![图片](https://uploader.shimo.im/f/JxHkyrfoHaon949O.png!thumbnail)

可见 PV 曾经被删除。这是 pd 数据目录异常的原因。可继续查看 kube-apiserver 的日志，寻找删除 PV 操作的触发原因，这需要 kube-apiserver 通过启动参数配置日志级别：

```
--v=4
```

此时的 pd 集群需要通过 pd-recover 恢复。

### 6.1.4 容器处于 Pending 状态

#### 问题分析

```
kubectl get pod
NAME  READY   STATUS   RESTARTS   AGE
pod-pvc-pv   0/1     Pending   0          4s
```

Pod 处于 Pending 状态，通常都是资源不满足导致的，比如：

* 使用持久化存储的 PD/TiKV/Monitor Pod 使用的 PVC 的 StorageClass 不存在或 PV 不足
* Kubernetes 集群中没有节点能满足 Pod 申请的 CPU 或内存
* PD 或者 TiKV Replicas 数量和集群内节点数量不满足 tidb-scheduler 高可用调度策略

#### 解决方案

* kubectl describe 查看 Pending 的具体原因

```
kubectl describe pod -n <namespace> <pod-name>
kubectl describe pod pod-pvc-pv
Name:         pod-pvc-pv
...
Status:       Pending
...
Warning  FailedScheduling  21s (x4 over 4m28s)  default-scheduler  0/1 nodes are available: 1 node(s) didn't find available persistent volumes to bind.
```

* 资源不足解决办法

 降低对应组件的 CPU 或内存资源申请使其能够得到调度，或是增加新的 Kubernetes 节点。

* StorageClass 不存在

需要在 values.yaml 里面将 storageClassName 修改为集群中可用的 StorageClass 名字，执行 helm upgrade，然后将 Statefulset 删除，并且将对应的 PVC 也都删除，可以通过以下命令获取集群中可用的 StorageClass：

```
kubectl get storageclass
```

* Local PV 不足

 需要添加对应的 PV 资源。对于 Local PV，可以参考 [本地 PV 配置](https://pingcap.com/docs-cn/stable/tidb-in-kubernetes/reference/configuration/storage-class#%E6%9C%AC%E5%9C%B0-pv-%E9%85%8D%E7%BD%AE) 进行扩充。

### 6.1.5 Pod 之间网络不通

#### 问题分析

针对 TiDB 集群而言，绝大部分 Pod 间的访问均通过 Pod 的域名（使用 Headless Service 分配）进行，例外的情况是 TiDB Operator 在收集集群信息或下发控制指令时，会通过 PD Service 的 service-name 访问 PD 集群。

当通过日志或监控确认 Pod 间存在网络连通性问题，或根据故障情况推断出 Pod 间网络连接可能不正常时，可以按照下面的流程进行诊断，逐步缩小问题范围。

#### 解决方案

1. 确认 Service 和 Headless Service 的 Endpoints 是否正常：

```
kubectl -n <namespace> get endpoints <release-name>-pd
kubectl -n <namespace> get endpoints <release-name>-tidb
kubectl -n <namespace> get endpoints <release-name>-pd-peer
kubectl -n <namespace> get endpoints <release-name>-tikv-peer
kubectl -n <namespace> get endpoints <release-name>-tidb-peer
```

以上命令展示的 ENDPOINTS 字段中，应当是由逗号分隔的 cluster_ip:port 列表。假如字段为空或不正确，请检查 Pod 的健康状态以及 kube-controller-manager 是否正常工作。

1. 进入 Pod 的 Network Namespace 诊断网络问题：

```
tkctl debug -n <namespace> <pod-name>
```

远端 shell 启动后，使用 dig 命令诊断 DNS 解析，假如 DNS 解析异常，请参照 [诊断 Kubernetes DNS 解析](https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/) 进行故障排除：

```
dig <HOSTNAME>
```

使用 ping 命令诊断到目的 IP 的三层网络是否连通（目的 IP 为使用 dig 解析出的 ClusterIP）:

```
ping <TARGET_IP>
```

假如 ping 检查失败，请参照诊断 Kubernetes 网络进行故障排除。
假如 ping 检查正常，继续使用 telnet 检查目标端口是否打开：

```
telnet <TARGET_IP> <TARGET_PORT>
```

假如 telnet 检查失败，则需要验证 Pod 的对应端口是否正确暴露以及应用的端口是否配置正确：

```
# 检查端口是否一致
kubectl -n <namespace> get po <pod-name> -ojson | jq '.spec.containers[].ports[].containerPort'

# 检查应用是否被正确配置服务于指定端口上
# PD, 未配置时默认为 2379 端口
kubectl -n <namespace> -it exec <pod-name> -- cat /etc/pd/pd.toml | grep client-urls
# TiKV, 未配置时默认为 20160 端口
kubectl -n <namespace> -it exec <pod-name> -- cat /etc/tikv/tikv.toml | grep addr
# TiDB, 未配置时默认为 4000 端口
kubectl -n <namespace> -it exec <pod-name> -- cat /etc/tidb/tidb.toml | grep port
```

### 6.1.6 无法访问 TiDB 服务

#### 问题分析

由于远程访问，所以优先排查网络链路。

#### 解决方案

TiDB 服务访问不了时，首先确认 TiDB 服务是否部署成功，确认方法如下：

查看该集群的所有组件是否全部都启动了，状态是否为 Running。

```
kubectl get po -n <namespace>
```

检查 TiDB 组件的日志，看日志是否有报错。

```
kubectl logs -f <tidb-pod-name> -n <namespace> -c tidb
```

如果确定集群部署成功，则进行网络检查：

1. 如果你是通过 NodePort 方式访问不了 TiDB 服务，请在 node 上尝试使用 service domain 或 clusterIP 访问 TiDB 服务，假如 serviceName 或 clusterIP 的方式能访问，基本判断 Kubernetes 集群内的网络是正常的，问题可能出在下面两个方面：

    * 客户端到 node 节点的网络不通。
    * 查看 TiDB service 的 externalTrafficPolicy 属性是否为 Local。如果是 Local 则客户端必须通过 TiDB Pod 所在 node 的 IP 来访问。

2. 如果 service domain 或 clusterIP 方式也访问不了 TiDB 服务，尝试用 TiDB 服务后端的 <PodIP>:4000 连接看是否可以访问，如果通过 PodIP 可以访问 TiDB 服务，可以确认问题出在 service domain 或 clusterIP 到 PodIP 之间的连接上，排查项如下：

    * 检查 DNS 服务是否正常：

    ```
    kubectl get po -n kube-system -l k8s-app=kube-dns
    dig <tidb-service-domain>
    ```

    * 检查各个 node 上的 kube-proxy 是否正常运行：

    ```
    kubectl get po -n kube-system -l k8s-app=kube-proxy
    ```

    * 检查 node 上的 iptables 规则中 TiDB 服务的规则是否正确

    ```
    iptables-save -t nat |grep <clusterIP>
    ```

    * 检查对应的 endpoint 是否正确

3. 如果通过 PodIP 访问不了 TiDB 服务，问题出在 Pod 层面的网络上，排查项如下：

    * 检查 node 上的相关 route 规则是否正确

    * 检查网络插件服务是否正常

    * 参考上面的 [Pod 之间网络不通](https://pingcap.com/docs-cn/stable/tidb-in-kubernetes/troubleshoot/#pod-%E4%B9%8B%E9%97%B4%E7%BD%91%E7%BB%9C%E4%B8%8D%E9%80%9A) 章节

## 6.2 集群运行过程中

### 6.2.1 删除 TiKV 或 PD，再次创建启动不成功

#### 问题分析

#### 解决方案

### 6.2.2 并发扩缩容，TiKV Store 异常进入 Tombstone 状态

#### 问题分析

正常情况下，当 TiKV Pod 处于健康状态时（Pod 状态为 Running），对应的 TiKV Store 状态也是健康的（Store 状态为 UP）。但并发进行 TiKV 组件的扩容和缩容可能会导致部分 TiKV Store 异常并进入 Tombstone 状态。

对比 Store 状态与 Pod 运行状态。假如某个 TiKV Pod 所对应的 Store 处于 Offline 状态，则表明该 Pod 的 Store 正在异常下线中。此时，可以通过下面的命令取消下线进程，进行恢复：

#### 解决方案

此时，可以按照以下步骤进行修复：

1. 查看 TiKV Store 状态：

```
kubectl get -n <namespace> tidbcluster <release-name> -ojson | jq '.status.tikv.stores'
```

1. 查看 TiKV Pod 运行状态：

```
kubectl get -n <namespace> po -l app.kubernetes.io/component=tikv
```

1. 对比 Store 状态与 Pod 运行状态。假如某个 TiKV Pod 所对应的 Store 处于 Offline 状态，则表明该 Pod 的 Store 正在异常下线中。此时，可以通过下面的命令取消下线进程，进行恢复：

    1. 打开到 PD 服务的连接：

    ```
    kubectl port-forward -n <namespace> svc/<cluster-name>-pd <local-port>:2379 &>/tmp/portforward-pd.log &
    ```

    2. 上线对应 Store：

    ```
    curl -X POST http://127.0.0.1:2379/pd/api/v1/store/<store-id>/state?state=Up
    ```

2. 假如某个 TiKV Pod 所对应的 lastHeartbeatTime 最新的 Store 处于 Tombstone 状态，则表明异常下线已经完成。此时，需要重建 Pod 并绑定新的 PV 进行恢复：

    1. 将该 Store 对应 PV 的 reclaimPolicy 调整为 Delete：

    ```
    kubectl patch $(kubectl get pv -l app.kubernetes.io/instance=<release-name>,tidb.pingcap.com/store-id=<store-id> -o name) -p '{"spec":{"persistentVolumeReclaimPolicy":"Delete"}}
    ```

    2. 删除 Pod 使用的 PVC：

    ```
    kubectl delete -n <namespace> pvc tikv-<pod-name> --wait=false
    ```

    3. 删除 Pod，等待 Pod 重建：

    ```
    kubectl delete -n <namespace> pod <pod-name>
    ```

    Pod 重建后，会以在集群中注册一个新的 Store，恢复完成。

### 6.2.3 TiDB 长连接被异常中断

#### 问题分析

许多负载均衡器 (Load Balancer) 会设置连接空闲超时时间。当连接上没有数据传输的时间超过设定值，负载均衡器会主动将连接中断。若发现 TiDB 使用过程中，长查询会被异常中断，可检查客户端与 TiDB 服务端之间的中间件程序

#### 解决方案

若其连接空闲超时时间较短，可尝试增大该超时时间。若不可修改，可打开 TiDB tcp-keep-alive 选项，启用 TCP keepalive 特性。

* 如果 Kubernetes 集群内的 [kubelet](https://kubernetes.io/docs/reference/command-line-tools-reference/kubelet/) 允许配置 --allowed-unsafe-sysctls=net.*，请为 kubelet 配置该参数，并按如下方式配置 TiDB：

```
tidb:
 ...
 podSecurityContext:
 sysctls:
 - name: net.ipv4.tcp_keepalive_time
 value: "300"
```

* 如果 Kubernetes 集群内的 [kubelet](https://kubernetes.io/docs/reference/command-line-tools-reference/kubelet/) 不允许配置 --allowed-unsafe-sysctls=net.*，请按如下方式配置 TiDB：

```
tidb:
 annotations:
 tidb.pingcap.com/sysctl-init: "true"
 podSecurityContext:
 sysctls:
 - name: net.ipv4.tcp_keepalive_time
 value: "300"
 ...
```

> **注意**：进行以上配置要求 TiDB Operator 1.1 及以上版本。

## 6.3 诊断模式

当 Pod 处于 CrashLoopBackoff 状态时，Pod 内容器会不断退出，导致无法正常使用 kubectl exec 或 tkctl debug，给诊断带来不便。为了解决这个问题，TiDB in Kubernetes 提供了 PD/TiKV/TiDB Pod 诊断模式。在诊断模式下，Pod 内的容器启动后会直接挂起，不会再进入重复 Crash 的状态，此时，便可以通过 kubectl exec 或 tkctl debug 连接 Pod 内的容器进行诊断。

操作之前，Pod 处于  CrashLoopBackoff 状态：

```
$ kubectl get pods -n tidbcluster1
NAME                              READY   STATUS             RESTARTS   AGE
demo-discovery-5c78d6bcd8-5ttcl   1/1     Running            0          20h
demo-monitor-6ddc6d6674-kcmhh     3/3     Running            0          3d22h
demo-pd-0                         1/1     Running            0          3d22h
demo-pd-1                         0/1     CrashLoopBackOff   911        3d22h
demo-pd-2                         1/1     Running            10         3d22h
demo-pd-3                         0/1     CrashLoopBackOff   932        3d22h
demo-pd-4                         1/1     Running            0          3d22h
demo-pd-5                         1/1     Running            0          3d22h
demo-tidb-0                       2/2     Running            1          3d22h
demo-tidb-1                       2/2     Running            0          3d22h
demo-tikv-0                       1/1     Running            0          3d22h
demo-tikv-1                       1/1     Running            0          3d22h
demo-tikv-2                       1/1     Running            0          3d22h
demo-tikv-3                       1/1     Running            0          3d22h
demo-tikv-4                       1/1     Running            0          3d22h
demo-tikv-5                       1/1     Running            0          3d22h
```

首先，为待诊断的 Pod 添加 Annotation：

```
kubectl annotate pod <pod-name> -n <namespace> runmode=debug
# kubectl annotate pod  demo-pd-1 -n tidbcluster1 runmode=debug
```

在 Pod 内的容器下次重启时，会检测到该 Annotation，进入诊断模式。等待 Pod 进入 Running 状态即可开始诊断：

```
watch kubectl get pod <pod-name> -n <namespace>
# watch kubectl get pod demo-pd-1 -n tidbcluster1
```

![图片](https://uploader.shimo.im/f/AEoBqBFTZm0geOkK.png!thumbnail)

下面是使用 kubectl exec 进入容器进行诊断工作的例子：

```
# 进入诊断模式后 kubectl logs 会提示当前 pod 已经进入诊断模式
$ kubectl logs demo-pd-1 -n tidbcluster1
entering debug mode.
# 进入 pod 进行诊断
kubectl exec -it <pod-name> -n <namespace> -- /bin/sh
# kubectl exec -it demo-pd-1 -n tidbcluster1 -- /bin/sh
```

诊断完毕，修复问题后，删除 Pod：

```
kubectl delete pod <pod-name> -n <namespace>
# kubectl delete pod demo-pd-1 -n tidbcluster1
```

输出为：

```
pod "demo-pd-1" deleted
```

监控：Pod 重建后会自动回到正常运行模式。
