### 1.1.2 用 TiUP 部署本地测试环境

TiDB 集群是由多个组件构成的分布式系统，一个典型的 TiDB 集群至少由 3 个 PD 节点、3 个 TiKV 节点和 2 个 TiDB 节点构成。通过手工来部署这么多组件对于想要体验 TiDB 的用户甚至是 TiDB 的开发人员来说都是非常耗时且头疼的事情。在上一章节我们介绍了 TiUP 的基础用法，在本章中，我们将介绍 TiUP 中的 playground 和 client 组件，并且将通过这两个组件搭建起一套本地的 TiDB 测试环境。

#### 1. 通过 playground 组件启动本地集群

playground 是一个集群组件，它会自动利用 TiUP 下载指定的 TiDB/PD/TiKV 版本，并按照用户指定的组件数量快速启动本地集群。

根据上一章节的知识，我们可以通过 list 命令先查看 playground 提供了哪些版本，相关的命令如下：
```
tiup list playground
```

接着我们可以通过 install 命令来安装最新版本的 playground，相关的命令如下：
```
tiup install playground
```

安装完成之后，可以通过 `tiup playground` 来启动一个默认的集群。playground 提供了一键启动集群的方法，大大简化了搭建的集群的时间。相关命令和参数如下：
```
~$ tiup help playground
Bootstrap a TiDB cluster in your local host, the latest release version will be chosen
if you don't specified a version.

Examples:
  $ tiup playground nightly                         # Start a TiDB nightly version local cluster
  $ tiup playground v3.0.10 --db 3 --pd 3 --kv 3    # Start a local cluster with 10 nodes
  $ tiup playground nightly --monitor               # Start a local cluster with monitor system
  $ tiup playground --pd.config ~/config/pd.toml    # Start a local cluster with specified configuration file,
  $ tiup playground --db.binpath /xx/tidb-server    # Start a local cluster with component binary path

Usage:
  tiup playground [version] [flags]

Flags:
      --db int              TiDB instance number (default 1)
      --db.binpath string   TiDB instance binary path
      --db.config string    TiDB instance configuration file
  -h, --help                help for tiup
      --host string         Playground cluster host (default "127.0.0.1")
      --kv int              TiKV instance number (default 1)
      --kv.binpath string   TiKV instance binary path
      --kv.config string    TiKV instance configuration file
      --monitor             Start prometheus component
      --pd int              PD instance number (default 1)
      --pd.binpath string   PD instance binary path
      --pd.config string    PD instance configuration file
```

从帮助信息上可以看出，playground 在启动时可以通过参数做很多定制化工作：
* 指定各组件的个数
* 指定各组件的可执行程序和配置文件
* 使用 `--host` 修改默认的 host，譬如修改为机器的对外 IP 地址，服务就可以被其他机器访问
* 使用 `--monitor` 启动 Prometheus 组件，提供集群监控能力

最简单地，你可以通过如下命令快速启动一个集群：
```
tiup playground
```

上述命令实际上做了以下事情：
* 因为没有指定版本，TiUP 会先查找 playground 的最新版本，假设当前最新版为 v0.0.6，则该命令相当于 `tiup playground:v0.0.6`
* 如果 playground 组件的 v0.0.6 版本没有安装，TiUP 会先将其安装，然后再启动运行实例
* 因为 playground 没有指定 TiDB/PD/TiKV 各组件的版本，默认情况下，它会使用各组件的最新 release 版本，假设当前为 v4.0.0，则该命令相当于 `tiup playground:v0.0.6 v4.0.0`
* 因为 playground 也没有指定各组件的个数，默认情况下，它会启动由 1 个 TiDB、1 个 TiKV 和 1 个 PD 构成的最小化集群
* playground 实际上也是调用 TiUP 命令来启动 TiDB/PD/TiKV 组件，譬如调用 `tiup tidb:v4.0.0` 来启动 TiDB 实例，当然，在真正执行时它还会额外指定一些参数
* 在依次启动完各个组件后，playground 会告诉你启动成功，并告诉你一些有用的信息，譬如如何通过 MySQL 客户端连接集群、如何访问 dashboard

在上一章节中我们知道，由于没有使用 `--tag` 选项，TiUP 会为该实例随机生成一个 tag 名称，将该实例的运行数据都放在用 tag 名称命名的文件夹下，并且在实例运行终止时自动删除文件夹。如果想要在多次启动时复用数据，可以通过指定 tag 名称的方法来启动，譬如：
```
tiup --tag=my-cluster playground
```

示例一：使用 TiUP 启动 v3.0.9 版本的集群
```
tiup playground v3.0.9
```

示例二：使用 TiUP 启动 nightly 版本的集群
```
tiup playground nightly
```

示例三：指定 TiKV 组件的个数为 3 个，同时启动 Prometheus 监控
```
tiup playground --kv=3 --monitor
```

示例四：各组件使用本机的对外 IP 地址 `x.x.x.x` 提供服务
```
tiup playground --host x.x.x.x
```

#### 2. 通过 playground 搭建测试集群

作为一个分布式系统，最基础的 TiDB 测试集群通常由 2 个 TiDB 组件、3 个 TiKV 组件和 3 个PD组件来构成。通过 playground，我们可以快速搭建出上述的一套基础测试集群，相关的命令如下：
```
tiup playground --db=2 --kv=3 --pd=3
```

相比于之前需要手动搭建各个组件和修改各种配置，playground 功能极大的减少了搭建时间和成本。同时，我们还可以通过 `--monitor` 选项来为测试集群增加监控功能，相关的命令如下：
```
tiup playground --db=2 --kv=3 --pd=3 --monitor
```

在集群搭建成功后，playground 会提供使用 MySQL 客户端连接集群的命令信息：
```
CLUSTER START SUCCESSFULLY, Enjoy it ^-^
To connect TiDB: mysql --host 127.0.0.1 --port 4000 -u root
```

除了使用 playground 输出的连接命令外，还可以通过 TiUP 提供的 client 组件来连接到测试集群：
```
tiup client
```

client 组件非常聪明，它会自动探测到当前启动了哪些集群，并展示一个类似 DOS 图形化界面的列表，让你选择连接哪个集群。

当然，你也可以通过指定 tag 名称来连接到特定的集群：
```
tiup client <tag>
```

