## 11.3 TiSpark on TiFlash
TiFlash 弥补了 TiSpark 在分析场景下读取 TiKV 会引发性能抖动的缺陷。以往需要通过限制 TiSpark 读取并发度以确保业务不受影响的情况可以在 TiFlash 的帮助下完美解决。TiSpark 访问 TiFlash 的方式与访问 TiKV 几乎一致，也是经过协处理器下推来进行加速：TiFlash 会接受协处理器请求，将每个 Region 的计算结果分别返回，由 TiSpark 进行后续计算和汇总。
与 TiKV 不同的是，TiFlash 针对 TiSpark 提供了原生的编码格式支持，这个格式下 TiFlash 无需按照 TiDB 格式进行编码转换，而是直接以原始计算结果的编码格式返回数据。在该模式下，数据由 TiFlash 向 TiSpark 传输的速度将大大加快，例如表连接场景可以受益。

### 11.3.1 TiSpark 读取 TiFlash
TiSpark 本身的配置仍然如前所述，需要下载 TiSpark JAR 并且在配置中添加 TiExtension 以及 PD 地址配置项。另外请确保 TiFlash 的节点可被 TiSpark 访问。

TiSpark 目前提供类似 TiDB 中 engine 隔离的方式读取 TiFlash，方式是通过配置参数:

```
spark.tispark.use.tiflash 为 true (或 false)
```

可以使用以下任意一种方式进行设置:

1. 在 spark-defaults.conf 文件中添加 

```
spark.tispark.use.tiflash true
```

2. 在启动 spark-shell 或 ThriftServer 时，启动命令中添加 

```
--conf spark.tispark.use.tiflash = true
```

3. Spark Shell 中实时设置: 

```
spark.conf.set("spark.tispark.use.tiflash", true)
```

4. ThriftServer 通过 beeline 连接后实时设置: 

```
set spark.tispark.use.tiflash = true;
```

注意，设为 true 时，所有查询的表都会只读取 TiFlash 副本，设为 false 则只读取 TiKV 副本。设为 true 时，要求查询所用到的表都必须已创建了 TiFlash 副本，对于未创建 TiFlash 副本的表的查询会报错。


### 11.3.2 相关参数优化
1. 合并 Region 请求。TiSpark 配合 TiFlash 的场景下，由于每个 Region 请求响应的速度将比 TiKV 中大大提升，如果小 Region 过多，会使得 Spark 的调度速度无法跟上而降低计算效率。在这样的场景下，用户可以尝试开启 Region 请求合并功能。开启之后，TiSpark 将会每次同时在一个请求中包含多个 Region 计算请求。一般推荐在 Region 平均大小小于 48M 的时候可以将请求合并数设为 2。默认情况下，每次 TiSpark Split 请求只包含一个 Region。
```
spark.tispark.partition_per_split  2
```
2. 取消调度等待。如果是 TiFlash 和 TiSpark 并非同机部署，或者业务以聚合计算为主，那么推荐将调度等待关闭。这是因为非同机部署并不会有可能产生本地读取优化或者优化可忽略，反而会因为调度等待大大拖慢计算。
```
spark.locality.wait 0s
```
