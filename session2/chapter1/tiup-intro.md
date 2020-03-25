# 1.1.1 TiUP 简介

在各种系统软件和应用软件的安装管理中，包管理器均有着广泛的应用，包管理工具的出现也大大简化的软件安装升级维护的工作。例如，几乎所有使用 RPM 的 Linux 都会使用 Yum 来进行包管理，Anaconda 可以非常方便的管理 python 的环境和相关软件包。在早期的 TiDB 生态中，没有专门的包管理工具，使用者只能通过相应的配置文件和文件夹命名来手动管理，像 Prometheus 等第三方监控报表工具甚至需要额外的特殊管理，这样大大提高了相应的运维管理工作。

如今，在 TiDB 4.0 的生态系统里，TiUP 作为新的工具，承担着包管理器的角色，管理着 TiDB 生态下众多的组件（例如 TiDB、PD、TiKV），用户想要运行 TiDB 生态中任何东西的时候，只需要执行 TiUP 的一行命令即可，相比之前极大的降低了管理难度。用户可以访问 [https://tiup.io/](https://tiup.io/) 来查看相应的文档

#### 1.安装

作为一个包管理工具，TiUP 的安装非常简单，只需要在控制台执行如下命令：

```
curl --proto '=https' --tlsv1.2 -sSf https://tiup-mirrors.pingcap.com/install.sh | sh
```
#### 2.功能介绍

TiUP 的使用非常简单，只需要利用 TiUP 的指令即可。首先执行 tiup help 看一下它支持哪些指令和参数：

```
tiup help
Usage:
  tiup [flags] <command> [args...]
  tiup [flags] <component> [args...]

Available Commands:
  install     Install a specific version of a component
  list        List the available TiDB components or versions
  uninstall   Uninstall components or versions of a component
  update      Update tiup components to the latest version
  status      List the status of instantiated components
  clean       Clean the data of instantiated components
  help        Help about any command or component

Use "tiup [command] --help" for more information about a command.
```
可以看到大致有这些命令可选：
* help: 打印 help 信息，后面跟子命令则是打印该子命令的使用方法
* list: 查看有哪些组件可以安装，以及这些组件有哪些版本可选
* install: 安装某个组件的某个版本
* update: 升级某个组件到最新的版本
* uninstall: 删除某个组件
* status: 查看组件组件的运行状态/运行历史
* clean: 清除某次运行后的数据

如果我们想要知道某个子命令的具体用法，执行 tiup subcommand -h 就可以看到，比如我们想知道 install 命令有哪些参数可以传，就执行 tiup install -h。

下面我们按照正常使用习惯依次介绍这些命令。

(1) 查询列表：tiup list

当想要用 TiUP 安装东西的时候，首先需要知道有哪些组件可以安装，以及这些组件有哪些版本可以安装，这便是 list 子命令的功能。

它的用法如下：

```
tiup list --help
Usage:
  tiup list [component] [flags]
Flags:
  -h, --help        help for list
      --installed   List installed components only.
      --refresh     Refresh local components/version list cache.
```
从帮助信息上可以看出，tiup list 支持这几种用法：
* tiup list: 查看当前有哪些组件可以安装
* tiup list <comp>: 查看某个组件有哪些版本可以安装

对于上面两种使用方法，可以组合使用两个 flag:

* --installed: 本地已经安装了哪些组件，或者某个组件的哪些版本
* --refresh: 服务器上最新的组件列表，以及他们的版本列表

示例一：查看当前已经安装的所有组件，命令如下：

```
tiup list --installed
```
示例二：从服务器获取 TiKV 所有可安装版本组件列表，命令如下：
```
tiup list tikv --refresh
```
(2) 安装组件：tiup install

查看完列表之后，进行安装也非常简单，利用 install 这项命令处理即可。相关的命令和参数如下：

```
tiup install -h
Usage:
  tiup install <component1>:[version] [component2...N] [flags]
Flags:
  -h, --help   help for install
```
install 的使用方式较单一：
* tiup install <component>：安装指定组件的最新稳定版
* tiup install <component>:[versiion]: 安装指定组件的指定版本

示例一：使用 TiUP 安装 TiDB：

```
tiup install tidb
```
示例二：使用 TiUP 安装 nightly 版本的TiDB：
```
tiup install tidb:nightly
```
示例三：使用 TiUP 安装 3.0.6 版本的 TiKV：
```
tiup install tikv:v3.0.6
```
(3) 升级组件：tiup update

在官方组件提供了新版之后，同样可以利用 TiUP 进行升级。相关的命令和参数如下：

```
tiup update -h
Usage:
  tiup update [component1]:[version] [component2..N] [flags]
Flags:
      --all       Update all components
      --force     Force update a component to the latest version
  -h, --help      help for update
      --nightly   Update the components to nightly version
      --self      Update tiup to the latest version
```
使用方式上和 install 基本相同，不过它支持几个额外的 flag:
* --all: 升级所有组件
* --nightly: 升级至 nightly 版本（若无此参数则升级到最新稳定版）
* --self: 升级 tiup 自己
* --force：强制升级至最新版本（若无此参数则本地有最新版本了就不更新）

示例一：升级所有组件至最新版本：

```
tiup update --all
```
示例二：升级所有组件至最新 nightly 版本：
```
tiup update --nightly --all
```
示例三：升级 TiUP 至最新版本：
```
tiup update --self
```
(4) 运行组件：tiup <component>

安装完成之后可以利用 tiup 启动相应的组件。相关的命令和参数如下：

```
tiup [component] [flags]
Usage:
  tiup <component1>:[version] [flags]
Flags:
  -h, --help         help for this component
      --rm           Remove data directory on finish
  -n, --tag string   Specify a tag for this task
```
该命令需要提供一个组件的名字以及可选的版本，若不提供版本，则使用该组件已安装的最新稳定版。
TiUP 将组件启动之前会为它建立一个目录，然后将组件放到该目录中运行，组件应该将所有数据生成在该目录中，目录的名字就是该组件运行时指定的 tag 名称，若未指定，则生成一个随机的 tag。

命令有两个 flag:

* --rm 组件退出时删除它的工作目录
* --tag 为组件指定一个 tag

如果我们想要多次启动同一个组件并复用之前的工作目录，就可以用 --tag 为它指定一个名字，如果我们想要运行完成之后自动工作目录，则使用 --rm。

示例一：运行 3.0.8 版本的 TiDB：

```
tiup tidb:v3.0.8
```
示例二：通过 tag 运行 TiKV：
```
tiup --tag=experiment tikv
```
示例三：TiUP在组件运行结束时自动删除数据：
```
tiup --rm tidb
```
(5) 删除组件：tiup uninstall 参数

TiUP 安装的组件是要占用本地磁盘空间的，如果不想要那么多老版本的组件，可以先查看当前安装了哪些版本的组件，然后在删除某个组件的某个版本，同时也支持删除所有版本。相应的命令和参数如下：

```
Usage:
  tiup uninstall <component1>:<version> [flags]
Flags:
      --all    Remove all components or versions.
  -h, --help   help for uninstall
      --self   Uninstall tiup and clean all local data
```
示例一：删除 3.0.8 版本的 TiDB：
```
tiup uninstall tidb:v3.0.8
```
示例二：删除所有版本的 TiKV：
```
tiup uninstall tikv --all
```
示例三：删除所有已经安装的组件：
```
tiup uninstall --all
```
(6) 数据清除：tiup clean

tiup uninstall 只是将组件的二进制文件从系统中删除了，但是组件运行时生成的数据仍然存在，如果想要删除，需要使用 tiup clean:

```
Usage:
  tiup clean [flags]
Flags:
      --all    Clean all data of instantiated components
  -h, --help   help for clean
```
如果需要清除所有组件的所有运行数据，加上 --all 即可。
示例一：根据实例 tag 清除数据：

```
tiup clean experiment
```
(7) 其他功能：tiup [help | status]

TiUP 还提供帮助和查看所有实例（包括正在运行）的功能，相关的命令和参数如下：

```
tiup help
查看TiUP帮助
tiup status
查看所有实例（包括正在运行的）
```
