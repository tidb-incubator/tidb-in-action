
### 背景介绍
TiDB是分布式数据库，包括tidb-server、pd-server、tikv-server三个组件。其中pd-server、tikv-server需要使用pv，而tidb-server不需要pv。
由于最小TiDB集群需要至少3个pd节点、3个tikv节点，所以整套环境至少需要6个pv。

由于TiDB是面向OLTP的分布式数据库，对存储介质性能要求非常苛刻，所以，生产环境只考虑local pv使用场景。

### 操作步骤
#### 一、配置本地磁盘相关信息
通过如下命令可知本服务器有3个独立分区可用于local pv配置
```
# ls /dev/sdb*
/dev/sdb  /dev/sdb1  /dev/sdb2  /dev/sdb3

```
以/dev/sdb1为例进行磁盘挂载操作
```
# mkfs.ext4 /dev/sdb1
# DISK_UUID=$(blkid -s UUID -o value /dev/sdb1)
# mkdir /mnt/disks/$DISK_UUID
# echo UUID=`sudo blkid -s UUID -o value /dev/sdb1` /mnt/disks/`sudo blkid -s UUID -o value /dev/sdb1` ext4 defaults 0 2 | sudo tee -a /etc/fstab
# mount -a
```
将sdb1替换成sdb2,sdb3，把3个分区都挂载上。重复对3台服务器进行磁盘挂载操作。

#### 二、部署local-volume-provisioner程序
```
# kubectl apply -f https://raw.githubusercontent.com/pingcap/tidb-operator/master/manifests/local-dind/local-volume-provisioner.yaml
storageclass.storage.k8s.io/local-storage created
configmap/local-provisioner-config created
daemonset.apps/local-volume-provisioner created
serviceaccount/local-storage-admin created
clusterrolebinding.rbac.authorization.k8s.io/local-storage-provisioner-pv-binding created
clusterrole.rbac.authorization.k8s.io/local-storage-provisioner-node-clusterrole created
clusterrolebinding.rbac.authorization.k8s.io/local-storage-provisioner-node-binding created
```

#### 三、验证local pv运行情况
```
# kubectl get pv
NAME                CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS      CLAIM   STORAGECLASS    REASON   AGE
local-pv-2c956bbd   1468Mi     RWO            Delete           Available           local-storage            2m57s
local-pv-3a4dae53   1468Mi     RWO            Delete           Available           local-storage            2m56s
local-pv-3c7e9ebb   1468Mi     RWO            Delete           Available           local-storage            2m57s
local-pv-5cb252d7   1974Mi     RWO            Delete           Available           local-storage            2m57s
local-pv-5ebe9899   1468Mi     RWO            Delete           Available           local-storage            2m56s
local-pv-682d37c9   1468Mi     RWO            Delete           Available           local-storage            2m56s
local-pv-af00e20c   1974Mi     RWO            Delete           Available           local-storage            2m56s
local-pv-d4cf548e   1468Mi     RWO            Delete           Available           local-storage            2m56s
local-pv-eb0e3c9f   1974Mi     RWO            Delete           Available           local-storage            2m56s

```
以上信息说明local pv已经在正常运行了。
