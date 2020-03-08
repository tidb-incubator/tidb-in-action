
# PV 配置

## 背景介绍

TiDB 是分布式数据库，包括 Tidb-server、 Pd-server、 Tikv-server 三个组件。其中 Pd-server、 Tikv-server 需要使用 PV， 而 Tidb-server 不需要 PV。
由于最小 TiDB 集群需要至少 3 个 Pd 节点、 3 个 Tikv 节点，所以整套环境至少需要 6 个 PV。

由于 TiDB 是面向 HTAP 的分布式数据库，对存储介质性能要求比较高，所以，生产环境只考虑 Local PV 使用场景。

## 操作步骤

### 一、配置本地磁盘相关信息

通过如下命令可知本服务器有 3 个独立分区可用于 Local PV 配置（真实生产环境每个 TiKV 需要独立的磁盘，此处只演示效果）

```

# lsblk
NAME        MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT
sda           8:0    0   20G  0 disk
├─sda1        8:1    0    1G  0 part /boot
└─sda2        8:2    0   19G  0 part
  ├─cl-root 253:0    0   17G  0 lvm  /
  └─cl-swap 253:1    0    2G  0 lvm
sdb           8:16   0    5G  0 disk
├─sdb1        8:17   0  1.5G  0 part
├─sdb2        8:18   0  1.5G  0 part
└─sdb3        8:19   0    2G  0 part

```

以 /dev/sdb1 为例进行磁盘挂载操作

```

# mkfs.ext4 /dev/sdb1
# DISK_UUID=$(blkid -s UUID -o value /dev/sdb1)
# mkdir -p /mnt/disks/$DISK_UUID
# echo UUID=$DISK_UUID /mnt/disks/$DISK_UUID ext4 defaults 0 2 | sudo tee -a /etc/fstab
# mount -a

```

将 sdb1 替换成 sdb2, sdb3，把 3 个分区都挂载上。重复对 3 台服务器进行磁盘挂载操作。

### 二、部署 local-volume-provisioner 程序

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

### 三、验证 Local PV 创建情况

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

以上信息说明 Local PV 已经在正常创建了。
