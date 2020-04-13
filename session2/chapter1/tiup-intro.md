# 1.1.1 TiUP 简介

在各种系统软件和应用软件的安装管理中，包管理器均有着广泛的应用，包管理工具的出现大大简化了软件的安装和升级维护工作。例如，几乎所有使用 RPM 的 Linux 都会使用 Yum 来进行包管理，而 Anaconda 则可以非常方便地管理 python 的环境和相关软件包。在早期的 TiDB 生态中，没有专门的包管理工具，使用者只能通过相应的配置文件和文件夹命名来手动管理，像 Prometheus 等第三方监控报表工具甚至需要额外的特殊管理，这样大大提升了运维管理难度。

如今，在 TiDB 4.0 的生态系统里，TiUP 作为新的工具，承担着包管理器的角色，管理着 TiDB 生态下众多的组件（例如 TiDB、PD、TiKV）。用户想要运行 TiDB 生态中任何东西的时候，只需要执行 TiUP 一行命令即可，相比以前，极大地降低了管理难度。用户可以访问 [https://tiup.io/](https://tiup.io/) 来查看相应的文档。

## 1. 安装

作为一个包管理工具，TiUP 的安装非常简单，只需要在控制台执行如下命令：

```
curl --proto '=https' --tlsv1.2 -sSf https://tiup-mirrors.pingcap.com/install.sh | sh
```

该命令将 TiUP 安装在 `$HOME/.tiup` 文件夹下，之后安装的组件以及组件运行产生的数据也会放在该文件夹下。同时，它还会自动将 `$HOME/.tiup/bin` 加入到 Shell Profile 文件的 PATH 环境变量中，这样你就可以直接使用 TiUP 了，譬如查看 TiUP 的版本：
```
tiup --version
```

该文档主要参照 TiUP v0.0.3 版本，由于 TiUP 功能还在不断改进完善中，所以文档可能存在与最新版不一致的地方。

## 2. 功能介绍

TiUP 的使用非常简单，只需要利用 TiUP 的命令或者组件即可。首先执行 `tiup help` 看一下它的用法：

```
~$ tiup help
TiUP is a command-line component management tool that can help to download and install
TiDB platform components to the local system. You can run a specific version of a component via
"tiup <component>[:version]". If no version number is specified, the latest version installed
locally will be used. If the specified component does not have any version installed locally,
the latest stable version will be downloaded from the repository.

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

Available Components:
  playground          Bootstrap a local TiDB cluster
  package             A toolbox to package tiup component
  cluster             Deploy a TiDB cluster for production
  mirrors             Build a local mirrors and download all selected components

Flags:
  -B, --binary <component>[:version]   Print binary path of a specific version of a component <component>[:version]
                                       and the latest version installed will be selected if no version specified
      --binpath string                 Specify the binary path of component instance
  -h, --help                           help for tiup
      --skip-version-check             Skip the strict version check, by default a version must be a valid SemVer string
  -T, --tag string                     Specify a tag for component instance

Component instances with the same "tag" will share a data directory ($TIUP_HOME/data/$tag):
  $ tiup --tag mycluster playground

Examples:
  $ tiup playground                    # Quick start
  $ tiup playground nightly            # Start a playground with the latest nightly version
  $ tiup install <component>[:version] # Install a component of specific version
  $ tiup update --all                  # Update all installed components to the latest version
  $ tiup update --nightly              # Update all installed components to the nightly version
  $ tiup update --self                 # Update the "tiup" to the latest version
  $ tiup list --refresh                # Fetch the latest supported components list
  $ tiup status                        # Display all running/terminated instances
  $ tiup clean <name>                  # Clean the data of running/terminated instance (Kill process if it's running)
  $ tiup clean --all                   # Clean the data of all running/terminated instances

Use "tiup [command] --help" for more information about a command.
```

TiUP 使用方式：
```
tiup [flags] <command> [args...]
tiup [flags] <component> [args...]
```

如上，一个典型的 TiUP 命令分为四个部分：
1. tiup: TiUP 程序名
2. flags: 全局通用选项，可选
3. command 或 component: 运行的命令或组件
4. args: 命令或组件的专有参数，可选

目前支持这些命令：
* list: 查询组件列表，知道有哪些组件可以安装，以及这些组件有哪些版本可选
* install: 安装某个组件的特定版本
* update: 升级某个组件到最新的版本
* uninstall: 卸载组件
* status: 查看组件运行状态
* clean: 清理组件实例
* help: 打印帮助信息，后面跟命令则是打印该命令的使用方法

常见的全局通用选项 flags：
* `--binary`: 打印某个组件的可执行程序文件路径
* `--binpath`: 指定要运行组件的可执行程序文件路径，这样可以不使用组件的安装路径
* `--tag`: 指定组件运行实例的 tag 名称，该名称可以认为是该实例的 ID，如果不指定，则会自动生成随机的 tag 名称

通过 `tiup list` 命令可以查看支持的组件，目前已经支持了上十个组件了，包括常用的 playground/package/cluster 等。随着时间的推移，组件还会越来越多，同时也希望大家积极参与贡献组件。

如果我们想要知道某个命令或组件的具体用法，可以执行 `tiup help <command|component>` 或者 `tiup <command|component> --help` 或者 `tiup <command|component> -h`。

比如我们想知道 install 命令用法，就可以执行 `tiup help install` 或者 `tiup install --help` 或者 `tiup install -h`。

下面我们按照正常使用习惯依次介绍各个命令。

### (1) 查询组件列表：tiup list

当想要用 TiUP 安装东西的时候，首先需要知道有哪些组件可以安装，以及这些组件有哪些版本可以安装，这便是 list 命令的功能。相关的命令和参数如下：

```
~$ tiup help list
List the available TiDB components if you don't specify any component name,
or list the available versions of a specific component. Display a list of
local caches by default. You must use --refresh to force TiUP to fetch
the latest list from the mirror server. Use the --installed flag to hide 
components or versions which have not been installed.

  # Refresh and list all available components
  tiup list --refresh

  # List all installed components
  tiup list --installed

  # List all installed versions of TiDB
  tiup list tidb --installed

Usage:
  tiup list [component] [flags]

Flags:
  -h, --help        help for list
      --installed   List installed components only.
      --refresh     Refresh local components/version list cache.

Global Flags:
      --skip-version-check   Skip the strict version check, by default a version must be a valid SemVer string
```

支持这几种用法：
* `tiup list`: 查看当前有哪些组件可以安装
* `tiup list <component>`: 查看某个组件有哪些版本可以安装

对于上面两种使用方法，可以组合使用两个 flag：
* `--installed`: 本地已经安装了哪些组件，或者已经安装了某个组件的哪些版本
* `--refresh`: 获取服务器上最新的组件列表，以及它们的版本列表

示例一：查看当前已经安装的所有组件
```
tiup list --installed
```

示例二：从服务器获取 TiKV 所有可安装版本组件列表
```
tiup list tikv --refresh
```

### (2) 安装组件：tiup install

查看组件列表之后，安装也非常简单，利用 `tiup install` 命令即可。相关的命令和参数如下：

```
$ tiup help install
Install a specific version of a component. The component can be specified
by <component> or <component>:<version>. The latest stable version will
be installed if there is no version specified.

You can install multiple components at once, or install multiple versions
of the same component:

  tiup install tidb:v3.0.5 tikv pd
  tiup install tidb:v3.0.5 tidb:v3.0.8 tikv:v3.0.9

Usage:
  tiup install <component1>[:version] [component2...N] [flags]

Flags:
  -h, --help   help for install

Global Flags:
      --skip-version-check   Skip the strict version check, by default a version must be a valid SemVer string
```

使用方式：
* `tiup install <component>`: 安装指定组件的最新稳定版
* `tiup install <component>:[version]`: 安装指定组件的指定版本

示例一：使用 TiUP 安装最新稳定版的 TiDB
```
tiup install tidb
```

示例二：使用 TiUP 安装 nightly 版本的TiDB
```
tiup install tidb:nightly
```

示例三：使用 TiUP 安装 v3.0.6 版本的 TiKV
```
tiup install tikv:v3.0.6
```

### (3) 升级组件：tiup update

在官方组件提供了新版之后，同样可以利用 TiUP 进行升级。相关的命令和参数如下：

```
$ tiup help update
Update some components to the latest version. Use --nightly
to update to the latest nightly version. Use --all to update all components 
installed locally. Use <component>:<version> to update to the specified 
version. Components will be ignored if the latest version has already been 
installed locally, but you can use --force explicitly to overwrite an 
existing installation. Use --self which is used to update TiUP to the 
latest version. All other flags will be ignored if the flag --self is given.

  $ tiup update --all                     # Update all components to the latest stable version
  $ tiup update --nightly --all           # Update all components to the latest nightly version
  $ tiup update playground:v0.0.3 --force # Overwrite an existing local installation
  $ tiup update --self                    # Update TiUP to the latest version

Usage:
  tiup update [component1][:version] [component2..N] [flags]

Flags:
      --all       Update all components
      --force     Force update a component to the latest version
  -h, --help      help for update
      --nightly   Update the components to nightly version
      --self      Update tiup to the latest version

Global Flags:
      --skip-version-check   Skip the strict version check, by default a version must be a valid SemVer string
```

使用方式上和 install 基本相同，不过它支持几个额外的 flag：
* `--all`: 升级所有组件
* `--nightly`: 升级至 nightly 版本
* `--self`: 升级 TiUP 自己至最新版本
* `--force`: 强制升级至最新版本

示例一：升级所有组件至最新版本
```
tiup update --all
```

示例二：升级所有组件至 nightly 版本
```
tiup update --all --nightly
```

示例三：升级 TiUP 至最新版本
```
tiup update --self
```

### (4) 运行组件：tiup &lt;component&gt;

安装完成之后可以利用 TiUP 启动相应的组件：

```
tiup [flags] <component>[:version] [args...]
```

该命令需要提供一个组件的名字以及可选的版本，若不提供版本，则使用该组件已安装的最新稳定版。

在组件启动之前，TiUP 会先为它创建一个目录，然后将组件放到该目录中运行。组件会将所有数据生成在该目录中，目录的名字就是该组件运行时指定的 tag 名称。如果不指定 tag，则会随机生成一个 tag 名称，并且在实例终止时***自动删除***工作目录。

如果我们想要多次启动同一个组件并复用之前的工作目录，就可以在启动时用 `--tag` 指定相同的名字。指定 tag 后，在实例终止时就***不会自动删除***工作目录，方便下次启动时复用。

示例一：运行 v3.0.8 版本的 TiDB
```
tiup tidb:v3.0.8
```

示例二：指定 tag 运行 TiKV
```
tiup --tag=experiment tikv
```

### (5) 查询组件运行状态：tiup status

通过 `tiup status` 可以查看组件的运行状态。相关的命令和参数如下：

```
~$ tiup help status
List the status of instantiated components

Usage:
  tiup status [flags]

Flags:
  -h, --help   help for status

Global Flags:
      --skip-version-check   Skip the strict version check, by default a version must be a valid SemVer string
```

运行该命令会得到一个实例列表，每行一个实例。列表中包含这些列：
* Name: 实例的 tag 名称
* Component: 实例的组件名称
* PID: 实例运行的进程 ID
* Status: 实例状态，RUNNING 表示正在运行，TERM 表示已经终止
* Created Time: 实例的启动时间
* Directory: 实例的工作目录，可以通过 `--tag` 指定
* Binary: 实例的可执行程序，可以通过 `--binpath` 指定
* Args: 实例的运行参数

### (6) 清理组件实例：tiup clean

通过 `tiup clean` 可以清理组件实例，并删除工作目录。如果在清理之前实例还在运行，会先 kill 相关进程。相应的命令和参数如下：

```
~$ tiup help clean
Clean the data of instantiated components

Usage:
  tiup clean [flags]

Flags:
      --all    Clean all data of instantiated components
  -h, --help   help for clean

Global Flags:
      --skip-version-check   Skip the strict version check, by default a version must be a valid SemVer string
```

示例一：清理 tag 名称为 experiment 的组件实例
```
tiup clean experiment
```

示例二：清理所有组件实例
```
tiup clean --all
```

### (4) 卸载组件：tiup uninstall

TiUP 安装的组件是要占用本地磁盘空间的，如果不想保留那么多老版本的组件，可以先查看当前安装了哪些版本的组件，然后再卸载某个组件。TiUP 支持卸载某个组件的所有版本或者特定版本，也支持卸载所有组件。相应的命令和参数如下：

```
~$ tiup help uninstall
If you specify a version number, uninstall the specified version of
the component. You must use --all explicitly if you want to remove all
components or versions which are installed. You can uninstall multiple
components or multiple versions of a component at once. The --self flag
which is used to uninstall tiup.

  # Uninstall tiup
  tiup uninstall --self

  # Uninstall the specific version a component
  tiup uninstall tidb:v3.0.10

  # Uninstall all version of specific component
  tiup uninstall tidb --all

  # Uninstall all installed components
  tiup uninstall --all

Usage:
  tiup uninstall <component1>[:version] [flags]

Flags:
      --all    Remove all components or versions.
  -h, --help   help for uninstall
      --self   Uninstall tiup and clean all local data

Global Flags:
      --skip-version-check   Skip the strict version check, by default a version must be a valid SemVer string
```

示例一：卸载 v3.0.8 版本的 TiDB
```
tiup uninstall tidb:v3.0.8
```

示例二：卸载所有版本的 TiKV
```
tiup uninstall tikv --all
```

示例三：卸载所有已经安装的组件
```
tiup uninstall --all
```

