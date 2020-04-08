
## 1.2.2 TiDB-Operator 部署本地测试环境

## 1.2.2.1 背景介绍

本小结介绍如何在个人电脑（Linux 或 MacOS）上采用 kind 方式在 Kubernetes 上部署 TiDB Operator 和 TiDB 集群。部署包含三个关键环节：

1. 通过 kind 部署 K8s 集群
2. 在 K8s 集群上部署 TiDB Operator
3. 在 K8s 集群中部署 TiDB 集群

在部署前，请确认资源满足以下要求：

* 内存 4GB+、CPU 至少 2 cores
* Docker 17.03+
* Go 1.10+
* net.ipv4.ip_forward 设置为 1

## 1.2.2.2 通过 kind 部署 K8s 集群

1. 下载自动化部署程序

```
# cd /root & git clone --depth=1 https://github.com/pingcap/tidb-operator && cd tidb-operator
```

2. 通过程序创建集群

```
# cd /root/tidb-operator && hack/kind-cluster-build.sh
```

执行成功后会有如下关键提示信息:

```
########## success create cluster:[kind] ##########
To start using your cluster, run:  
    kubectl config use-context kind-kind
```

3. 将 K8s 集群相关命令路径加入 PATH 路径

```
    # export PATH=$PATH:/root/tidb-operator/output/bin/
```

4. 验证 K8s 环境是否符合要求

```
    # kubectl cluster-info
      Kubernetes master is running at https://127.0.0.1:32771
      KubeDNS is running at https://127.0.0.1:32771/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy
```

输出以上信息，则说明 K8s 服务符合要求。

```
    # helm version
      Client: &version.Version{SemVer:"v2.9.1", GitCommit:"20adb27c7c5868466912eebdf6664e7390ebe710", GitTreeState:"clean"}
      Server: &version.Version{SemVer:"v2.9.1", GitCommit:"20adb27c7c5868466912eebdf6664e7390ebe710", GitTreeState:"clean"}
```

输出以上信息，则说明 Helm 客户端与服务端都符合要求。

## 1.2.2.3 在 K8s 集群上部署 TiDB Operator

1. 通过 helm 安装 TiDB Operator

创建 TiDB CRD

```
    # kubectl apply -f https://raw.githubusercontent.com/pingcap/tidb-operator/master/manifests/crd.yaml && kubectl get crd tidbclusters.pingcap.com
    customresourcedefinition.apiextensions.k8s.io/tidbclusters.pingcap.com unchanged
    customresourcedefinition.apiextensions.k8s.io/backups.pingcap.com unchanged
    customresourcedefinition.apiextensions.k8s.io/restores.pingcap.com unchanged
    customresourcedefinition.apiextensions.k8s.io/backupschedules.pingcap.com unchanged
    customresourcedefinition.apiextensions.k8s.io/tidbmonitors.pingcap.com unchanged
    customresourcedefinition.apiextensions.k8s.io/tidbinitializers.pingcap.com unchanged
    customresourcedefinition.apiextensions.k8s.io/tidbclusterautoscalers.pingcap.com unchanged
    NAME                       CREATED AT
    tidbclusters.pingcap.com   2020-03-06T13:38:32Z
```

下载 TiDB Operator 的 Helm chart 文件：

```
    # mkdir -p /root/chart/

    从 https://github.com/pingcap/tidb-operator/releases 下载 tidb-operator-chart-v1.0.6.tgz 文件放到 /root/chart/ 路径下

    # cd /root/chart/ && tar xvf tidb-operator-chart-v1.0.6.tgz
```

将 /root/tidb-operator/charts/tidb-operator/values.yaml 文件内的 scheduler.kubeSchedulerImageName 值修改为 registry.cn-hangzhou.aliyuncs.com/google_containers/kube-scheduler 以加快镜像拉取速度。

2. 安装 TiDB Operator

```
    # helm install --namespace=tidb-admin  --name=tidb-operator /root/tidb-operator/charts/tidb-operator -f /root/tidb-operator/charts/tidb-operator/values.yaml
    NAME:   tidb-operator
    LAST DEPLOYED: Fri Mar  6 14:24:09 2020
    NAMESPACE: tidb-admin
    STATUS: DEPLOYED
    ...
```

3. 验证 Operator 运行状态

```
    # kubectl get pods -n tidb-admin
    NAME                                       READY   STATUS    RESTARTS   AGE
    tidb-controller-manager-85d8d498bf-2n8km   1/1     Running   0          19s
    tidb-scheduler-7c67d6c77b-qd54r            2/2     Running   0          19s
```

以上信息显示 Operator 运行正常。

## 1.2.2.4 在 K8s 集群中部署 TiDB 集群

1. 下载 TiDB Cluster 的 helm chart 文件

```
    # mkdir -p /root/chart/
    从 https://github.com/pingcap/tidb-operator/releases 下载 tidb-cluster-chart-v1.0.6.tgz 文件放到 /root/chart/ 路径下
```

2. 安装 TiDB Cluster

```
    # cd /root/chart/ && tar xvf tidb-cluster-chart-v1.0.6.tgz
    # helm install --namespace dba-test --name=test /root/tidb-operator/charts/tidb-cluster -f /root/tidb-operator/charts/tidb-cluster/values.yaml
    NAME:   test
    LAST DEPLOYED: Fri Mar  6 14:50:25 2020
    NAMESPACE: dba-test
    STATUS: DEPLOYED
```

以上信息显示 TiDB Cluster 部署正常

3. 观察 TiDB 的 POD 状态

```
    # kubectl get pods -n dba-test
    NAME                              READY   STATUS    RESTARTS   AGE
    test-discovery-668b48577c-lqqbz   1/1     Running   0          7m37s
    test-monitor-5b586d8cb-227qx      3/3     Running   0          7m37s
    test-pd-0                         1/1     Running   0          7m37s
    test-pd-1                         1/1     Running   0          7m37s
    test-pd-2                         1/1     Running   1          7m37s
    test-tidb-0                       2/2     Running   0          6m18s
    test-tidb-1                       2/2     Running   0          6m18s
    test-tikv-0                       1/1     Running   0          6m58s
    test-tikv-1                       1/1     Running   0          6m58s
    test-tikv-2                       1/1     Running   0          6m58s
```

以上信息显示 TiDB Cluster 所有 Pod 全部运行正常。

4. 访问 TiDB 集群

```
    # nohup kubectl port-forward svc/test-tidb 4000:4000 --namespace=dba-test &
    # yum install -y mysql
    # mysql -h 127.0.0.1 -uroot -P4000
    mysql -h 127.0.0.1 -P 4000 -uroot
    Welcome to the MariaDB monitor.  Commands end with ; or \g.
    Your MySQL connection id is 1
    Server version: 5.7.25-TiDB-v3.0.5 MySQL Community Server (Apache License 2.0)
    Copyright (c) 2000, 2018, Oracle, MariaDB Corporation Ab and others.
    Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.
    MySQL [(none)]>
```

显示以上输出显示 TiDB 集群部署成功。
