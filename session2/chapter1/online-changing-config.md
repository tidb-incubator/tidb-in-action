# 动态配置变更

## 背景

- TiDB集群缺少配置管理的统一入口

- 大多数配置参数不能在线变更需要重启实例

## 介绍

动态配置变更特性是 TiDB v4.0 版本的新特性，通过pd-ctl component 查看和在线修改 TiDB、TiKV、PD 组件的配置参数。用户可以利用动态配置变更对各组件进行性能调优而无需重启集群组件。

- 开启动态配置变更

启动各组件（TiDB，TiKV，PD）执行程序时，可通过 --enable-dynamic-config=true 开启 ，4.0 版本默认开启该参数，可通过修改 TiDB，TiKV，PD 配置文件中的 `enable-dynamic-config = false` 关闭该功能。

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

- 修改全局配置

可通过 `component set <component> <key> <value>` 进行设置，其中 `component` 为组件

类型，目前支持 `tidb`，`tikv`，`pd` 三种类型，`key` 为参数名称，`value` 为参数值。

示例如下：

```bash
>> component set tikv gc.batch-keys 1024
```

上述命令会将所有 TiKV 实例的 GC 的参数 `batch-keys` 设置为 1024。

- 修改实例配置

可通过 `component set <address> <key> <value>` 进行设置，其中 `address` 为实例的 IP 地

址加端口，如 127.0.0.1:20160。

示例如下：

```bash
>> component set 127.0.0.1:20160 gc.batch-keys 1024
```

上述命令仅将 `127.0.0.1:20160` 这个 TiKV 实例的 GC 的参数 `batch-keys` 设置为 1024

- 查看配置

可通过 `component show <address>` 查看具体实例的配置。

示例如下：

```bash
>> component show 127.0.0.1:20160
```

## 操作

### 1. 创建tidbcluster集群

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

### 2. 进入PD Pod

- 查看当前配置

```bash
/ # ./pd-ctl component show basic-pd-0.basic-pd-peer.test-cluster.svc:2379 | grep patrol-region-interval
  patrol-region-interval = "100ms"
```

- 动态变更配置

```bash
/ # ./pd-ctl component set pd schedule.patrol-region-interval 150ms
Success!
```

- 验证变更配置

```bash
/ # ./pd-ctl component show basic-pd-0.basic-pd-peer.test-cluster.svc:2379 | grep patrol-region-interval
  patrol-region-interval = "150ms"
```
