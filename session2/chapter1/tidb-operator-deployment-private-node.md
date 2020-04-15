## 1.2.3.2.5 维护 TiDB 集群所在的 Kubernetes 节点

### 1. TiDB 与 PD 所在服务器异常下线

由于节点维护需要至少 4 台服务器才能操作完成，本节基于 kind 模拟 5 个节点，讲解第 5 个 node 服务器故障时的维护方法。

PD 和 TiDB 实例的迁移较快，可以采取主动驱逐实例到其它节点上的策略进行节点维护：

```

# kubectl get pod --all-namespaces -o wide | grep worker5|grep dba-test
dba-test      test-pd-2                                    1/1     Running   0          5m18s   10.244.5.4   kind-worker5         <none>           <none>

```

以上显示 kind-worker5 节点运行了一个 PD 实例，使用 `kubectl cordon` 命令防止新的 Pod 调度到待维护节点上：

```

# kubectl cordon kind-worker5
node/kind-worker5 cordoned

```

使用 `kubectl drain` 命令将待维护节点上的数据库实例迁移到其它节点上：

```

# kubectl drain kind-worker5 --ignore-daemonsets --delete-local-data
node/kind-worker5 already cordoned
WARNING: ...
pod/test-pd-2 evicted

```

等待一会儿，检查 kind-worker5 节点上的 Pod：

```

# kubectl get pods -n dba-test|grep kind-worker5

```

无输出，表明 kind-worker5 节点上的 Pod 已全部迁移走出去。再观察 TiDB 集群的 Pod 状态：

```

# kubectl get pods -n dba-test
NAME                              READY   STATUS    RESTARTS   AGE
test-discovery-854fb5b46c-c8lng   1/1     Running   0          21m
test-monitor-59468bcd58-btbpc     3/3     Running   0          10m
test-pd-0                         1/1     Running   2          21m
test-pd-1                         1/1     Running   0          21m
test-pd-2                         1/1     Running   0          4m50s
test-tidb-0                       2/2     Running   0          19m
test-tidb-1                       2/2     Running   0          19m
test-tikv-0                       1/1     Running   0          20m
test-tikv-1                       1/1     Running   0          20m
test-tikv-2                       1/1     Running   0          20m

```

集群所有 Pod 已在正常运行，集群已恢复正常。

此时，分两种情况：

1. 短期维护（对节点无破坏性）；
2. 长期维护，服务器需要长时间修复，甚至需要重装系统。

短期维护场景下，维护完毕后，将节点解除调度限制即可：

```

# kubectl uncordon kind-worker5

```

长期维护场景下，将节点下线，修复之后，再由 K8s 运维专家将服务器上线到 K8s 集群：

```

# kubectl delete node kind-worker5
node "kind-worker5" deleted

```

### 2. TiKV 所在服务器异常下线

本节讲解 TiKV node 需要下线维护的场景。

注意： 至少要确保有 4 个 TiKV 实例正常运行才能操作成功（默认副本数为3）。

使用 `kubectl cordon` 命令防止新的 Pod 调度到待维护节点上：

```

# kubectl cordon kind-worker4
node/kind-worker4 cordoned

```

查看待维护节点上的 TiKV 实例：

```

# kubectl get pods -n dba-test -owide|grep tikv|grep kind-worker4
test-tikv-2                       1/1     Running   0          5m28s   10.244.1.7   kind-worker4   <none>           <none>

```

查看 TiKV 实例的 `store-id`：

```

# kubectl get tc test -ojson -n dba-test| jq '.status.tikv.stores | .[] | select ( .podName == "test-tikv-2" ) | .id'
"115"

```

开启 PD 访问：

```

# nohup kubectl port-forward svc/test-pd 2379:2379 -n dba-test &
[1] 8968

```

使用 `pd-ctl` 下线 TiKV 实例：

```

# pd-ctl -d store delete 115
Success!

```

等待 TiKV store 状态（`state_name`）转化为 `Tombstone`：

```

# pd-ctl -d store 115|grep state_name
    "state_name": "Tombstone"

```

接下来，还需要解除 TiKV 实例与节点本地盘的绑定：

查询 Pod 使用的 PVC：

```

# kubectl get -n dba-test pod test-tikv-2 -ojson | jq '.spec.volumes | .[] | select (.name == "tikv") | .persistentVolumeClaim.claimName'
"tikv-test-tikv-2"

```

删除该 PVC：

```

# kubectl delete pvc/tikv-test-tikv-2 -n dba-test
persistentvolumeclaim "tikv-test-tikv-2" deleted

```

删除 TiKV 实例：

```

# kubectl delete pod/test-tikv-2 -n dba-test
pod "test-tikv-2" deleted

```

观察该 TiKV 实例是否正常调度到其它节点上：

```

# kubectl get pods -n dba-test -owide|grep tikv
test-tikv-0                       1/1     Running   0          29m   10.244.2.6   kind-worker2   <none>           <none>
test-tikv-1                       1/1     Running   0          29m   10.244.4.6   kind-worker3   <none>           <none>
test-tikv-2                       1/1     Running   0          34s   10.244.3.6   kind-worker    <none>           <none>
test-tikv-3                       1/1     Running   0          25m   10.244.3.5   kind-worker    <none>           <none>


```

此时， test-tikv-2 已经从 kind-worker4 迁移到 kind-worker了。

此时，分两种情况:

1. 短期维护（对节点无破坏性）；
2. 长期维护，服务器需要长时间修复，甚至需要重装系统。

短期维护场景，维护完毕后，将节点解除调度限制即可：

```

# kubectl uncordon kind-worker4

```

长期维护场景，将节点下线，修复之后，再由 K8s 运维专家将服务器上线到 K8s 集群：

```

# kubectl delete node kind-worker4
node "kind-worker4" deleted

```
