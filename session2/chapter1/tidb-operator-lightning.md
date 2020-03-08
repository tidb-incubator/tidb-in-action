# 在 Kubernetes 集群上使用 Lightning 导入数据

## 背景

Mydumper + Loader 使用多线程导入导出数据，但在导入数据时需要经过TiDB SQL语法解析，导致TiDB计算能力成为新的瓶颈。所以又一个想法孕育而出——导入数据不经过SQL解析，直接转换成KV键值对写入TiKV集群。

## 介绍

TiDB Lightning 整体架构

![整体架构](https://download.pingcap.com/images/docs-cn/v3.1/tidb-lightning-architecture.png)

TiDB Lightning 主要包含两个部分：

- **`tidb-lightning`**（“前端”）：主要完成适配工作，通过读取数据源，在下游 TiDB 集群建表、将数据转换成键值对（KV 对）发送到 `tikv-importer`、检查数据完整性等。
- **`tikv-importer`**（“后端”）：主要完成将数据导入 TiKV 集群的工作，对 `tidb-lightning` 写入的键值对进行缓存、排序、切分操作并导入到 TiKV 集群。



## 操作