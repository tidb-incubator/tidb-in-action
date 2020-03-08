# 在 Kubernetes 集群上使用 Lightning 导入数据

## 背景

Mydumper + Loader 使用多线程导入导出数据时需要经过 TiDB SQL 语法解析，导致 TiDB 计算能力成为新的瓶颈。所以又一个想法孕育而出——导入数据不经过 SQL 解析，直接转换成 KV 键值对写入 TiKV 集群。

## 介绍

TiDB Lightning 整体架构：

![整体架构](https://download.pingcap.com/images/docs-cn/v3.1/tidb-lightning-architecture.png)

TiDB Lightning 主要包含两个部分：

- **`tidb-lightning`**（“前端”）：主要完成适配工作，通过读取数据源，在下游 TiDB 集群建表、将数据转换成键值对（KV 对）发送到 `tikv-importer`、检查数据完整性等。
- **`tikv-importer`**（“后端”）：主要完成将数据导入 TiKV 集群的工作，对 `tidb-lightning` 写入的键值对进行缓存、排序、切分操作并导入到 TiKV 集群。

## 操作

### 1. 通过 Mydumper 执行全量逻辑备份

- 环境信息：

在 namespace test-cluster 下有两套集群：cluster-1、cluster-2

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

- 创建备份所需的 secret

kubectl create secret generic backup-secret --namespace=test-backup --from-literal=user=root --from-literal=password='root_password'

`helm install pingcap/tidb-backup --version=v1.1.0-beta.2 --name backup-cluster-1 --namespace test-backup --set-string clusterName=cluster-1,storage.size=500Gi`

- 确认备份任务完成

```shell
kubectl -n test-backup get job -l app.kubernetes.io/instance=backup-cluster-1

```
NAME                            COMPLETIONS   DURATION   AGE
basic-fullbackup-202003080800   1/1           3s         3m32s
```

- 检查备份文件

kubectl -n test-cluster get pvc -l app.kubernetes.io/instance=backup-cluster-1

```
NAME               STATUS   VOLUME       CAPACITY   ACCESS MODES   STORAGECLASS    AGE
fullbackup-202003080800   Bound    local-pv-2a2853fb   77Gi      RWO  local-storage  62m
```

kubectl describe pv local-pv-2a2853fb

```
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

docker exec -ti tidb-operator-worker2 ls /mnt/disks/20/fullbackup-202003080800

```
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

### 2. 使用 Lightning 恢复数据

- 在 cluster-2 开启 importer

helm upgrade cluster-2 --set-string importer.create=true pingcap/tidb-cluster

- 部署 lightning 开始恢复数据

helm install pingcap/tidb-lightning --version=v1.1.0-beta.2 --name restore-cluster-1 --namespace test-cluster --set-string dataSource.adhoc.pvcName='fullbackup-202003080800',targetTidbCluster.name='cluster-2'

- 检查恢复任务状态

kubectl -n test-cluster get job -l app.kubernetes.io/name=restore-cluster-1-tidb-lightning

```
NAME                               COMPLETIONS   DURATION   AGE
restore-cluster-1-tidb-lightning   1/1           3s         9m3s
```

- 确认数据恢复情况

```
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
