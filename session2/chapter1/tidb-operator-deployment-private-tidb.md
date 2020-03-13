
##### 1.2.3.2.4 部署 TiDB 集群

(1) 下载 TiDB Cluster 的 helm chart 文件

```

    # mkdir -p /root/charts/
    从 https://github.com/pingcap/tidb-operator/releases 下载 tidb-cluster-chart-v1.0.6.tgz 文件放到 /root/charts/ 路径下

```

(2) 安装 TiDB Cluster

```

    # cd /root/charts/ && tar xvf tidb-cluster-chart-v1.0.6.tgz
    # helm install --namespace dba-test --name=test /root/charts/tidb-cluster -f /root/charts/tidb-cluster/values.yaml
    NAME:   test
    LAST DEPLOYED: Sat Mar  7 05:27:57 2020
    NAMESPACE: dba-test
    STATUS: DEPLOYED
    ...

```

以上信息显示 TiDB Cluster 部署正常。

(3) 观察 TiDB Cluster 所有 Pod 状态

```

    # kubectl get pods -n dba-test
    NAME                              READY   STATUS    RESTARTS   AGE
    test-discovery-854fb5b46c-hbg4q   1/1     Running   0          4m41s
    test-monitor-66589f9748-q28lp     3/3     Running   0          4m41s
    test-pd-0                         1/1     Running   1          4m40s
    test-pd-1                         1/1     Running   0          4m40s
    test-pd-2                         1/1     Running   0          4m40s
    test-tidb-0                       2/2     Running   0          2m13s
    test-tidb-1                       2/2     Running   0          2m13s
    test-tikv-0                       1/1     Running   0          2m45s
    test-tikv-1                       1/1     Running   0          2m45s
    test-tikv-2                       1/1     Running   0          2m45s

```

以上信息显示 TiDB Cluster 所有 Pod 全部运行正常。

(4) 访问 TiDB Cluster

```

    # kubectl get svc -n dba-test
    NAME                    TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)                          AGE
    test-discovery          ClusterIP   10.102.244.238   <none>        10261/TCP                        3m58s
    test-grafana            NodePort    10.104.130.193   <none>        3000:32326/TCP                   3m58s
    test-monitor-reloader   NodePort    10.106.105.144   <none>        9089:30818/TCP                   3m58s
    test-pd                 ClusterIP   10.96.183.196    <none>        2379/TCP                         3m58s
    test-pd-peer            ClusterIP   None             <none>        2380/TCP                         3m58s
    test-prometheus         NodePort    10.107.17.45     <none>        9090:31800/TCP                   3m58s
    test-tidb               NodePort    10.104.37.71     <none>        4000:30169/TCP,10080:30286/TCP   3m58s
    test-tidb-peer          ClusterIP   None             <none>        10080/TCP                        90s
    test-tikv-peer          ClusterIP   None             <none>        20160/TCP                        2m2s

```

找到 test-tidb 这个 Service 的 CLUSTER-IP，通过其访问 TiDB Cluster：

```

    # mysql -h 10.104.37.71 -uroot -P4000
    Welcome to the MySQL monitor.  Commands end with ; or \g.
    Your MySQL connection id is 1
    Server version: 5.7.25-TiDB-v3.0.5 MySQL Community Server (Apache License 2.0)

    Copyright (c) 2000, 2019, Oracle and/or its affiliates. All rights reserved.

    Oracle is a registered trademark of Oracle Corporation and/or its
    affiliates. Other names may be trademarks of their respective owners.

    Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

    mysql>

```

访问 TiDB Cluster 成功。
