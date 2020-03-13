### 1.1.2 用 TiUP 部署本地测试环境

TiDB 集群是由多个组件构成的分布式系统，一个典型的 TiDB 集群至少由 3 个 PD 节点、3 个 TiKV 节点和 2 个 TiDB 节点构成。通过手工来部署这么多组件对于想要体验 TiDB 的用户甚至是 TiDB 的开发人员来说都是非常耗时且头疼的事情。在上一章节我们介绍了 TiUP 的基础用法，在本章中，我们将介绍 TiUP 中的 playground 和 client 组件，并且将通过这两个组件搭建起一套本地的 TiDB 测试环境。

#### 1.通过 playground 组件启动本地集群

playground 是一个集群组件，它会自动利用 TiUP 下载指定的 TiDB/PD/TiKV 版本，并按照用户指定的组件数量快速启动本地集群。

根据上一章节的知识，我们可以通过 list 的命令先查看 playground 提供了哪些版本，相关的命令如下：

```
tiup list playground
```
接着我们可以通过 install 来安装最新版本的 playground 的，相关的命令如下：
```
tiup install playground
```
安装完成之后，可以通过 tiup 来启动一个默认的集群，playground 提供了一键启动集群的方法，大大简化了搭建的集群的时间。相关命令和参数如下：
```
tiup playground --help
Usage:
  playground [flags]
Flags:
  --db int        TiDB instance number (default 1)
  -h, --help      help for playground
  --host string   Playground cluster host (default "127.0.0.1")
  --kv int        TiKV instance number (default 1)
  --monitor       Start prometheus component
  --pd int        PD instance number (default 1)  
```
从帮助信息上可以看出，playground 在启动时支持指定组件的个数，修改默认的 host 以及是否开启 Prometheus 的监控。默认情况下，可以通过如下命令启动一个集群：
```
tiup playground
```
在默认情况中，playground 会启动由一个 TiDB，一个 TiKV 和一个 PD 构成的集群。在上一章节中我们指定，由于没有使用 ```--tag``` 的选项，TiUP 会随机生成一个名称，如果想要复用数据，可以通过指定名称的方法来启动，相关命令如下：
```
tiup --tag=tidb-cluster playground
```
playground 同样支持通过版本号的方式来启动。
示例一：使用 TiUP 启动 3.0.9 版本的集群

```
tiup playground v3.0.9
```
示例二：使用 TiUP 启动 nightly 版本的集群
```
tiup playground nightly
```

#### 2.通过 playground 搭建测试集群

作为一个分布式系统，一个最基础的 TiDB 测试集群通常由 2 个 TiDB 组件，3 个 TiKV 组件和3个PD组件来构成。通过 playground，我们同样可以快速搭建出上述的一套基础测试集群。相关的命令如下：

```
tiup playground --db=2 --kv=3 --pd=3
```
相比于之前需要手动搭建各个组件，修改各种配置，playground 功能极大的减少了搭建时间和成本。同时，我们还可以通过 monitor 选项来为测试集群增加监控功能，相关的命令如下：
```
tiup playground --db=2 --kv=3 --pd=3 --monitor
```
在集群搭建成功后，playground 会提供 mysql 对接的连接信息：
```
CLUSTER START SUCCESSFULLY, Enjoy it ^-^
To connect TiDB: mysql --host 127.0.0.1 --port 4000 -u root
```
除了使用 playground 输出的 mysql 连接外，还可以通过 TiUP 提供的 client 功能来连接到测试集群，命令如下：
```
tiup client
client 会自动探测TiDB的端口进行连接
```
当遇到需要连接指定集群的时候，client 同样支持通过名称来连接集群，命令如下：
```
tiup client NAME
```
