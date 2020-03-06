## 背景介绍:
&ensp;&ensp;为了让大家快速上手 TiDB operator，直观体验 Cloud TiDB 的关键部署环节，将通过 kind 快速部署一套 Cloud TiDB 集群，为大家梳理三个关键环节：
1. 基于 kind 部署一套 k8s 集群
2. 基于 k8s 部署 tidb operator
3. 基于 TiDB operator不是TiDB集群

## 第一部分： 基于 kind 部署一套 k8s 集群
 
&ensp;&ensp;要点提示: 这个小节的内容已基本做到全自动化。有三个点必须要注意，第一个是服务器配置要求，内存 4GB+、CPU 2核心+（不符合要求可能会有
异常）。第二个是 docker 版本，docker 版本必须是17.03+（不符合要求可能会有异常）。第三个是 net.ipv4.ip_forward 需要设置为1。

### 操作步骤如下:

#### 一、下载自动化部署程序
```
# cd /root & git clone --depth=1 https://github.com/pingcap/tidb-operator && cd tidb-operator
```

#### 二、通过程序创建集群
```
# cd /root/tidb-operator && hack/kind-cluster-build.sh
```
执行成功后会有如下关键提示信息:
```
############# success create cluster:[kind] #############
To start using your cluster, run:  
    kubectl config use-context kind-kind
```

#### 三、将k8s集群相关命令路径加入PATH路径
```
    # export PATH=$PATH:/root/tidb-operator/output/bin/
```
#### 四、验证k8s环境是否符合要求
```
    # kubectl cluster-info
      Kubernetes master is running at https://127.0.0.1:32771
      KubeDNS is running at https://127.0.0.1:32771/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy
```
&ensp;&ensp;&ensp;&ensp;输出以上信息，则说明k8s服务符合要求

```
    # helm version
      Client: &version.Version{SemVer:"v2.9.1", GitCommit:"20adb27c7c5868466912eebdf6664e7390ebe710", GitTreeState:"clean"}
      Server: &version.Version{SemVer:"v2.9.1", GitCommit:"20adb27c7c5868466912eebdf6664e7390ebe710", GitTreeState:"clean"}
```
&ensp;&ensp;&ensp;&ensp;输出以上信息，则说明helm客户端与服务端都符合要求

## 第二部分： 基于 k8s 部署 tidb operator

### 操作步骤如下:

#### 一、检测 helm chart 仓库里是否有 pingcap
```
    # helm search pingcap -l
      NAME                      CHART VERSION   APP VERSION     DESCRIPTION
      pingcap/tidb-backup       v1.1.0-beta.2                   A Helm chart for TiDB Backup or Restore
      pingcap/tidb-backup       v1.1.0-beta.1                   A Helm chart for TiDB Backup or Restore
      pingcap/tidb-backup       v1.1.0-alpha.4                  A Helm chart for TiDB Backup or Restore
```
&ensp;&ensp;&ensp;&ensp;如果未找到，则将仓库信息加入repo
```
    # helm repo add pingcap https://charts.pingcap.org/
    "pingcap" has been added to your repositories
```
#### 二、通过 helm 安装 tidb operator
&ensp;&ensp;&ensp;&ensp;创建TiDB CRD
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
&ensp;&ensp;&ensp;&ensp;下载 TiDB operator 的 helm chart 文件
```
    # mkdir -p /root/chart/

    从https://github.com/pingcap/tidb-operator/releases下载tidb-operator-chart-v1.0.6.tgz文件放到/root/chart/路径下

    # cd /root/chart/ && tar xvf tidb-operator-chart-v1.0.6.tgz

    将/root/charts/tidb-operator/values.yaml文件内的scheduler.kubeSchedulerImageName值修改为registry.cn-hangzhou.aliyuncs.com/google_containers/kube-scheduler提升镜像拉取速度
```
&ensp;&ensp;&ensp;&ensp;安装TiDB operator
```
    # helm install --namespace=tidb-admin  --name=tidb-operator /root/charts/tidb-operator -f /root/charts/tidb-operator/values.yaml
    NAME:   tidb-operator
    LAST DEPLOYED: Fri Mar  6 14:24:09 2020
    NAMESPACE: tidb-admin
    STATUS: DEPLOYED
    ...
```
#### 三、验证operator运行状态
```
    # kubectl get pods -n tidb-admin
    NAME                                       READY   STATUS    RESTARTS   AGE
    tidb-controller-manager-85d8d498bf-2n8km   1/1     Running   0          19s
    tidb-scheduler-7c67d6c77b-qd54r            2/2     Running   0          19s
```
&ensp;&ensp;&ensp;&ensp;以上信息显示operator运行正常

## 第三部分： 基于tidb operator部署tidb集群

### 操作步骤:

#### 一、下载TiDB Cluster的helm chart文件
```
    # mkdir -p /root/chart/
    从https://github.com/pingcap/tidb-operator/releases下载tidb-cluster-chart-v1.0.6.tgz文件放到/root/chart/路径下
```

#### 二、安装TiDB Cluster
```
    # cd /root/chart/ && tar xvf tidb-cluster-chart-v1.0.6.tgz
    # helm install --namespace dba-test --name=test /root/charts/tidb-cluster -f /root/charts/tidb-cluster/values.yaml
    NAME:   test
    LAST DEPLOYED: Fri Mar  6 14:50:25 2020
    NAMESPACE: dba-test
    STATUS: DEPLOYED
```
&ensp;&ensp;&ensp;&ensp;以上信息显示TiDB Cluster部署正常

### 三、观察TiDB的POD状态
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

&ensp;&ensp;&ensp;&ensp;以上信息显示TiDB Cluster所有POD全部运行正常

#### 四、访问TiDB集群
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
&ensp;&ensp;&ensp;&ensp;显示以上输出显示TiDB集群部署成功
