# 1.2.6 在 Kubernetes 集群上使用 Lightning 导入数据

## 1. 背景介绍

Mydumper + Loader 使用多线程导入导出数据时需要经过 TiDB SQL 语法解析，导致 TiDB 计算能力成为新的瓶颈。所以又一个想法孕育而出——导入数据不经过 SQL 解析，直接转换成 KV 键值对写入 TiKV 集群。

TiDB Lightning 整体架构：

![整体架构](/res/session2/chapter1/tidb-operator-lightning/tidb-lightning-architecture.png)

TiDB Lightning 主要包含两个部分：

- **`tidb-lightning`**（“前端”）： 主要完成适配工作，通过读取数据源，在下游 TiDB 集群建表、将数据转换成键值对（KV 对）发送到 `tikv-importer`、检查数据完整性等。
- **`tikv-importer`**（“后端”）： 主要完成将数据导入 TiKV 集群的工作，对 `tidb-lightning` 写入的键值对进行缓存、排序、切分操作并导入到 TiKV 集群。

在 Kubernetes 上，tikv-importer 位于 TiDB 集群的 Helm chart 内，被部署为一个副本数为 1 (`replicas=1`) 的 `StatefulSet`；tidb-lightning 位于单独的 Helm chart 内，被部署为一个 `Job`。

为了使用 TiDB Lightning 恢复数据，tikv-importer 和 tidb-lightning 都必须分别部署。

## 2. 部署 tikv-importer

tikv-importer 可以在一个现有的 TiDB 集群上启用，或者在新建 TiDB 集群时启用。

* 在新建一个 TiDB 集群时启用 tikv-importer：

    (1) 在 `tidb-cluster` 的 `values.yaml` 文件中将 `importer.create` 设置为 `true`。

    (2) 部署该集群。

    ```shell
    helm install pingcap/tidb-cluster --name=<tidb-cluster-release-name> --namespace=<namespace> -f values.yaml --version=<chart-version>
    ```

* 配置一个现有的 TiDB 集群以启用 tikv-importer：

    (1) 在该 TiDB 集群的 `values.yaml` 文件中将 `importer.create` 设置为 `true`。

    (2) 升级该 TiDB 集群。

    ```shell
    helm upgrade <tidb-cluster-release-name> pingcap/tidb-cluster -f values.yaml --version=<chart-version>
    ```

## 3. 部署 tidb-lightning

(1) 配置 TiDB Lightning

使用如下命令获得 TiDB Lightning 的默认配置。

```shell
helm inspect values pingcap/tidb-lightning --version=<chart-version> > tidb-lightning-values.yaml
```

tidb-lightning Helm chart 支持恢复本地或远程的备份数据。

* 本地模式

    本地模式要求 Mydumper 备份数据位于其中一个 Kubernetes 节点上。要启用该模式，你需要将 `dataSource.local.nodeName` 设置为该节点名称，将 `dataSource.local.hostPath` 设置为 Mydumper 备份数据目录路径，该路径中需要包含名为 `metadata` 的文件。

* PVC 模式

    PVC 模式要求 Mydumper 备份数据位于和要恢复到的目标 TiDB 集群在同一 namespace 下的一个 PVC 上。要启用该模式，你需要将 `dataSource.adhoc.pvcName` 设置为 Mydumper 备份数据所在的 PVC。

* 远程模式

    与本地模式不同，远程模式需要使用 [rclone](https://rclone.org) 将 Mydumper 备份 tarball 文件从网络存储中下载到 PV 中。远程模式能在 rclone 支持的任何云存储下工作，目前已经有以下存储进行了相关测试：[Google Cloud Storage (GCS)](https://cloud.google.com/storage/)、[AWS S3](https://aws.amazon.com/s3/) 和 [Ceph Object Storage](https://ceph.com/ceph-storage/object-storage/)。

    * 确保 `values.yaml` 中的 `dataSource.local.nodeName` 和 `dataSource.local.hostPath` 被注释掉。

    * 新建一个包含 rclone 配置的 `Secret`。rclone 配置示例如下。一般只需要配置一种云存储。有关其他的云存储，请参考 [rclone 官方文档](https://rclone.org/)。

            ```yaml
            apiVersion: v1
            kind: Secret
            metadata:
              name: cloud-storage-secret
            type: Opaque
            stringData:
              rclone.conf: |
              [s3]
              type = s3
              provider = AWS
              env_auth = false
              access_key_id = <my-access-key>
              secret_access_key = <my-secret-key>
              region = us-east-1
              [ceph]
              type = s3
              provider = Ceph
              env_auth = false
              access_key_id = <my-access-key>
              secret_access_key = <my-secret-key>
              endpoint = <ceph-object-store-endpoint>
              region = :default-placement
              [gcs]
              type = google cloud storage
              # 该服务账号必须被授予 Storage Object Viewer 角色。
              # 该内容可以通过 `cat <service-account-file.json> | jq -c .` 命令获取。
              service_account_credentials = <service-account-json-file-content>
            ```

    使用你的实际配置替换上述配置中的占位符，并将该文件存储为 `secret.yaml`。然后通过 `kubectl apply -f secret.yaml -n <namespace>` 命令创建该 `Secret`。

    * 将 `dataSource.remote.storageClassName` 设置为 Kubernetes 集群中现有的一个存储类型。

(2) 部署 TiDB Lightning

```shell
helm install pingcap/tidb-lightning --name=<tidb-lightning-release-name> --namespace=<namespace> --set failFast=true -f tidb-lightning-values.yaml --version=<chart-version>
```

## 4. Demo 演示

### 通过 Mydumper 执行全量逻辑备份

- 环境信息：

在 namespace test-cluster 下有两套集群：cluster-1、cluster-2。

查看 cluster-1 集群 Mysql 数据：

```
'select * from cloud.test_tbl;'
+----+------------+--------+------------+
| id | title      | author | date       |
+----+------------+--------+------------+
|  1 | K8s        | shonge | 2020-03-07 |
|  2 | operator   | shonge | 2020-03-07 |
|  3 | kubernetes | shonge | 2020-03-07 |
+----+------------+--------+------------+
```

- 创建备份所需的 secret：

```bash
kubectl create secret generic backup-secret --namespace=test-backup --from-literal=user=root --from-literal=password=<root_password>
```

```bash
helm install pingcap/tidb-backup --version=v1.1.0-beta.2 --name backup-cluster-1 --namespace test-backup --set-string clusterName=cluster-1,storage.size=500Gi
```

- 确认备份任务完成：

```bash
kubectl -n test-backup get job -l app.kubernetes.io/instance=backup-cluster-1
NAME                            COMPLETIONS   DURATION   AGE
basic-fullbackup-202003080800   1/1           3s         3m32s
```

- 检查备份文件：

查找备份 PV 挂载路径。

```bash
kubectl -n test-cluster get pvc -l app.kubernetes.io/instance=backup-cluster-1

NAME               STATUS   VOLUME       CAPACITY   ACCESS MODES   STORAGECLASS    AGE
fullbackup-202003080800   Bound    local-pv-2a2853fb   77Gi      RWO  local-storage  62m

kubectl describe pv local-pv-2a2853fb

Name:              local-pv-2a2853fb
Labels:            kubernetes.io/hostname=tidb-operator-worker2
Annotations:       pv.kubernetes.io/bound-by-controller: yes
                   pv.kubernetes.io/provisioned-by: local-volume-provisioner-tidb-operator-worker2-9d6bdbba-89ff-4180-9917-35b4dda3a3db
Finalizers:        [kubernetes.io/pv-protection]
StorageClass:      local-storage
Status:            Bound
Claim:             test-cluster/fullbackup-202003080800
Reclaim Policy:    Delete
Access Modes:      RWO
VolumeMode:        Filesystem
Capacity:          500Gi
Node Affinity:
  Required Terms:
    Term 0:        kubernetes.io/hostname in [tidb-operator-worker2]
Message:
Source:
    Type:  LocalVolume (a persistent volume backed by local storage on a node)
    Path:  /mnt/disks/20
Events:    <none>
```

查看备份文件，以 kind worker node 为例：

```bash
docker exec -ti tidb-operator-worker2 ls /mnt/disks/20/fullbackup-202003080800

cloud-schema-create.sql                   mysql.opt_rule_blacklist-schema.sql
cloud.test_tbl-schema.sql                 mysql.role_edges-schema.sql
cloud.test_tbl.sql                        mysql.stats_buckets-schema.sql
metadata                                  mysql.stats_feedback-schema.sql
mysql-schema-create.sql                   mysql.stats_histograms-schema.sql
mysql.GLOBAL_VARIABLES-schema.sql         mysql.stats_histograms.sql
mysql.GLOBAL_VARIABLES.sql                mysql.stats_meta-schema.sql
mysql.bind_info-schema.sql                mysql.stats_meta.sql
mysql.columns_priv-schema.sql             mysql.stats_top_n-schema.sql
mysql.db-schema.sql                       mysql.tables_priv-schema.sql
mysql.default_roles-schema.sql            mysql.tidb-schema.sql
mysql.expr_pushdown_blacklist-schema.sql  mysql.tidb.sql
mysql.gc_delete_range-schema.sql          mysql.user-schema.sql
mysql.gc_delete_range_done-schema.sql     mysql.user.sql
mysql.global_priv-schema.sql              test-schema-create.sql
mysql.help_topic-schema.sql
```

### 使用 Lightning 恢复数据

- 在 cluster-2 开启 importer

```bash
helm upgrade cluster-2 --set-string importer.create=true pingcap/tidb-cluster
```

- 部署 lightning 开始恢复数据

```bash
helm install pingcap/tidb-lightning --version=v1.1.0-beta.2 --name restore-cluster-1 --namespace test-cluster --set-string dataSource.adhoc.pvcName='fullbackup-202003080800',targetTidbCluster.name='cluster-2'
```

- 检查恢复任务状态

```bash
kubectl -n test-cluster get job -l app.kubernetes.io/name='restore-cluster-1-tidb-lightning'

NAME                               COMPLETIONS   DURATION   AGE
restore-cluster-1-tidb-lightning   1/1           3s         9m3s
```

- 访问 `cluster-2` TiDB 服务，确认数据恢复情况

```bash
MySQL [(none)]> select * from cloud.test_tbl;
+----+------------+--------+------------+
| id | title      | author | date       |
+----+------------+--------+------------+
|  1 | K8s        | shonge | 2020-03-07 |
|  2 | operator   | shonge | 2020-03-07 |
|  3 | kubernetes | shonge | 2020-03-07 |
+----+------------+--------+------------+
3 rows in set (0.01 sec)
```
