# 1.5 动态配置变更

本章节主要介绍如何使用动态配置变更来完成对集群的参数修改。

## 1.5.1 背景

在 TiDB v4.0 版本之前，通过配置变更对集群进行调优一直比较繁琐，主要存在的问题如下：

- 集群缺少配置管理的统一入口
- 大多数配置参数不能在线变更需要重启实例

## 1.5.2 介绍

动态配置变更特性是 TiDB v4.0 版本的新特性，可以通过 pd-ctl component 查看和在线修改 TiDB、TiKV、PD 组件的配置参数。用户可以利用动态配置变更对各组件进行性能调优而无需重启集群组件。

(1) **开启动态配置变更**

4.0 版本默认开启该参数，可通过修改 TiDB，TiKV，PD 配置文件中的 `enable-dynamic-config = false` 关闭该功能。

(2) **查看使用说明**

```bash
/ # ./pd-ctl component --help
manipulate components' configs

Usage:
  pd-ctl component [command]

Available Commands:
  delete      delete component config with a given component ID (e.g. 127.0.0.1:20160)
  ids         get all component IDs with a given component (e.g. tikv)
  set         set the component config (set option with value)
  show        show component config with a given component ID (e.g. 127.0.0.1:20160)

Global Flags:
  -h, --help        Help message.
  -u, --pd string   Address of pd. (default "http://127.0.0.1:2379")
```

(3) **修改全局配置**

可通过 `component set <component> <key> <value>` 进行设置，其中 `component` 为组件类型，目前支持 `tidb`，`tikv`，`pd` 三种类型，`key` 为参数名称，`value` 为参数值。

示例如下：

```bash
>> component set tikv gc.batch-keys 1024
```

上述命令会将所有 TiKV 实例的 GC 的参数 `batch-keys` 设置为 1024。

(4) **修改实例配置**

可通过 `component set <address> <key> <value>` 进行设置，其中 `address` 为实例的 IP 地址加端口，如 127.0.0.1:20160。

示例如下：

```bash
>> component set 127.0.0.1:20160 gc.batch-keys 1024
```

上述命令仅将 `127.0.0.1:20160` 这个 TiKV 实例的 GC 的参数 `batch-keys` 设置为 1024。

(5) **查看配置**

可通过 `component show <address>` 查看具体实例的配置。

示例如下：

```bash
>> component show 127.0.0.1:20160
```

## 1.5.3 操作

(1) **创建 tidbcluster 集群**

```yaml
apiVersion: pingcap.com/v1alpha1
kind: TidbCluster
metadata:
  name: basic
spec:
  version: nightly
  timezone: UTC
  pvReclaimPolicy: Delete
  pd:
    baseImage: pingcap/pd
    replicas: 1
    requests:
      storage: "1Gi"
    config: {}
  tikv:
    baseImage: pingcap/tikv
    replicas: 3
    requests:
      storage: "1Gi"
    config: {}
  tidb:
    baseImage: pingcap/tidb
    replicas: 1
    service:
      type: NodePort
    config: {}
```

(2) **进入 PD Pod**

- 查看当前配置

```bash
/ # ./pd-ctl component show basic-tikv-0.basic-tikv-peer.test-cluster.svc:20160 | grep batch-keys
  batch-keys = 512
```

- 动态变更配置

```bash
/ # ./pd-ctl component set tikv gc.batch-keys 1024
Success!
```

该命令返回 `Success!` 表示已经成功更新到配置中心。由于配置的分发是通过各组件拉取的，需要最多等待 30s 即可验证配置是否生效。

- 验证变更配置

```bash
/ # ./pd-ctl component show basic-tikv-0.basic-tikv-peer.test-cluster.svc:20160 | grep batch-keys
  batch-keys = 512
```

综上，可以看到通过使用 pd-ctl，能够快速对集群的大部分参数进行在线修改，达到对系统性能调优的目的。
