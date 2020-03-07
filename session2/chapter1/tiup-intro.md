在各种系统软件和应用软件的安装管理中，包管理器均有着广泛的应用。在 TiDB 的生态系统里，TiUP 承担着包管理器的角色，管理着 TiDB 生态下众多的组件（例如 TiDB、PD、TiKV），用户想要运行 TiDB 生态中任何东西的时候，只需要执行 TiUP 的一行命令即可。

**安装**

作为一个包管理工具，TiUP 的安装非常简单，只需要在控制台执行如下命令：

```
curl --proto '=https' --tlsv1.2 -sSf https://tiup-mirrors.pingcap.com/install.sh | sh
```
**功能介绍**

TiUP 支持如下功能：

* 组件安装
* 组件运行
* 版本管理
* 数据管理

**组件安装**

TiUP 组件安装的命令为

```
tiup install <comp>:[version]
```
使用如下命令可以安装一个 TiDB：
```
tiup install tidb
```
这条命令会从镜像上下载最近稳定版本的 TiDB。
如果想要安装 nightly 版本，可以使用如下命令：

```
tiup install tidb:nightly
```
同样的，在组件后面加上版本号，可以安装指定版本的组件，执行命令为：
```
tiup install <comp>:version
```
例如，安装 3.0.9 版本的 TiDB 可以使用如下命令：
```
tiup install tidb:v3.0.9
```
如果想要知道所有可安装的组件，可以使用如下命令：

```
tiup list --refresh
```
同安装类似，同样支持获取某个组件的所有可选版本。例如，使用如下命令获取 TiDB 的所有可选版本：
```
tiup list tidb --refresh
```

**组件运行**

TiUP 组件运行的命令如下：

```
tiup run <comp>:[version]
```
如果组件未安装则会自动执行 install 命令进行对应组件的安装然后执行运行命令。例如，想要运行本地最新的 TiDB，可以使用如下命令：
```
tiup run tidb
```
如果想要运行指定版本的 TiDB，可以使用如下命令：
```
tiup run tidb:v3.0.9
```
每次使用运行命令时，可以通过 ```--tag``` 为运行起来的组件指定一个名称，否则 TiUP 会命名一个随机的名称。TiUP 会根据组件的运行名称来分配数据目录。例如，多次运行```tiup run tikv```就会获得多个不同数据目录的 TiKV 运行实例。如果想要使用同样的数据目录来运行组件，可以在执行时指定相同的名称。例如：

```
tiup run --tag=experiment tikv
```
**版本管理**

TiUP 安装的组件是要占用本地磁盘空间的，如果不想要那么多老版本的组件，可以先查看当前安装了哪些版本的组件，然后在删除某个组件的某个版本，同时也支持删除所有版本。

查看当前安装了哪些版本的命令如下：

```
tiup list --installed
```
删除某个组件的某个版本：
```
tiup uninstall <comp>:[version]
```
例如，删除 TiDB 的 3.0.9 版本命令如下：
```
tiup uninstall tidb:v3.0.9
```
想要删除 TiDB 所有的版本，命令如下：
```
tiup uninstall tidb --all
```
**数据管理**

TiUP在执行组件运行命令时会为每个运行的组件分配一个数据目录，组件会在该目录下产生数据，当停止运行时，这些数据不会被清楚，如果想要删除，TiUP提供了手动清楚的命令。

查看所有实例（包括正在运行的）的命令如下：

```
tiup status
```
指定实例名称进行清除的命令如下：
```
tiup clean experiment
```
在确定想让TiUP在组件运行结束时自动删除数据，可以使用如下命令：
```
tiup run --rm tidb
```
