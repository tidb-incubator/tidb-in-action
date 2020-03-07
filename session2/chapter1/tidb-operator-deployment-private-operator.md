### 操作步骤如下:

#### 一、通过 helm 安装 TiDB Operator
创建 TiDB CRD
```
    # kubectl apply -f https://raw.githubusercontent.com/pingcap/tidb-operator/v1.0.6/manifests/crd.yaml && kubectl get crd tidbclusters.pingcap.com
    customresourcedefinition.apiextensions.k8s.io/tidbclusters.pingcap.com created
    customresourcedefinition.apiextensions.k8s.io/backups.pingcap.com created
    customresourcedefinition.apiextensions.k8s.io/restores.pingcap.com created
    customresourcedefinition.apiextensions.k8s.io/backupschedules.pingcap.com created
    customresourcedefinition.apiextensions.k8s.io/tidbmonitors.pingcap.com created
    customresourcedefinition.apiextensions.k8s.io/tidbinitializers.pingcap.com created
    customresourcedefinition.apiextensions.k8s.io/tidbclusterautoscalers.pingcap.com created
    # kubectl get crd tidbclusters.pingcap.com
    NAME                       CREATED AT
    tidbclusters.pingcap.com   2020-03-07T09:58:09Z
```

下载 TiDB Operator 的 helm chart 文件

```
    # mkdir -p /root/chart/

    从 https://github.com/pingcap/tidb-operator/releases 下载 tidb-operator-chart-v1.0.6.tgz 文件放到 /root/chart/ 路径下

    # cd /root/chart/ && tar xvf tidb-operator-chart-v1.0.6.tgz

```
    将 /root/charts/tidb-operator/values.yaml 文件内的 scheduler.kubeSchedulerImageName 值修改为 registry.cn-hangzhou.aliyuncs.com/google_containers/kube-scheduler 以加快镜像拉取速度。

安装 TiDB Operator
```
    # helm install --namespace=tidb-admin --name=tidb-operator /root/charts/tidb-operator -f /root/charts/tidb-operator/values.yaml
    NAME:   tidb-operator
    LAST DEPLOYED: Sat Mar  7 05:02:15 2020
    NAMESPACE: tidb-admin
    STATUS: DEPLOYED
    ...
```
#### 二、验证 Operator 运行状态
```
    # kubectl get pods -n tidb-admin
    NAME                                       READY   STATUS    RESTARTS   AGE
    tidb-controller-manager-85d8d498bf-2n8km   1/1     Running   0          19s
    tidb-scheduler-7c67d6c77b-qd54r            2/2     Running   0          19s
```
以上信息显示 Operator 运行正常

