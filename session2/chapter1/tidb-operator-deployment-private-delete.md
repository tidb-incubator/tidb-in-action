## 1.2.3.2.6 删除 TiDB 集群

本小节演示删除名为  “test” 的 TiDB 集群。

## 1. 通过 helm 删除 TiDB Cluster

```
# helm list
NAME         	REVISION	UPDATED                 	STATUS  	CHART               	APP VERSION	NAMESPACE 
test         	1       	Sat Mar  7 22:30:16 2020	DEPLOYED	tidb-cluster-v1.0.6 	           	dba-test  
tidb-operator	1       	Sat Mar  7 05:02:15 2020	DEPLOYED	tidb-operator-v1.0.6	           	tidb-admin
# helm delete test --purge
release "test" deleted
```

> **请注意**： 删除操作非常危险，请删除指定 TiDB 集群 ，千万不要误删除。

## 2. 删除 PVC

```
# kubectl delete pvc -n dba-test -l app.kubernetes.io/instance=test,app.kubernetes.io/managed-by=tidb-operator
persistentvolumeclaim "pd-test-pd-0" deleted
persistentvolumeclaim "pd-test-pd-1" deleted
persistentvolumeclaim "pd-test-pd-2" deleted
persistentvolumeclaim "pd-test-pd-3" deleted
persistentvolumeclaim "tikv-test-tikv-0" deleted
persistentvolumeclaim "tikv-test-tikv-1" deleted
persistentvolumeclaim "tikv-test-tikv-2" deleted
```

> **请注意**： 删除操作非常危险，请删除指定 TiDB 集群的 PVC ，千万不要误删除。

## 3. 删除 PV

```
# kubectl get pv -l app.kubernetes.io/namespace=dba-test,app.kubernetes.io/managed-by=tidb-operator,app.kubernetes.io/instance=test -o name|xargs -I {} kubectl patch {} -p '{"spec":{"persistentVolumeReclaimPolicy":"Delete"}}'
persistentvolume/local-pv-2c956bbd patched
persistentvolume/local-pv-3a4dae53 patched
persistentvolume/local-pv-3c7e9ebb patched
persistentvolume/local-pv-5ebe9899 patched
persistentvolume/local-pv-682d37c9 patched
persistentvolume/local-pv-af00e20c patched
persistentvolume/local-pv-d4cf548e patched
```

一分钟之后，检查 PV 状态：

```
# kubectl get pv
NAME                CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS      CLAIM   STORAGECLASS    REASON   AGE
local-pv-2c956bbd   1468Mi     RWO            Delete           Available           local-storage            64s
local-pv-3a4dae53   1468Mi     RWO            Delete           Available           local-storage            72s
local-pv-3c7e9ebb   1468Mi     RWO            Delete           Available           local-storage            54s
local-pv-5cb252d7   1974Mi     RWO            Delete           Available           local-storage            24h
local-pv-5ebe9899   1468Mi     RWO            Delete           Available           local-storage            58s
local-pv-682d37c9   1468Mi     RWO            Delete           Available           local-storage            72s
local-pv-af00e20c   1974Mi     RWO            Delete           Available           local-storage            24h
local-pv-d4cf548e   1468Mi     RWO            Delete           Available           local-storage            58s
local-pv-eb0e3c9f   1974Mi     RWO            Delete           Available           local-storage            24h
```

PV 资源已全部释放。至此，“test” TiDB 集群已经删除完毕。
