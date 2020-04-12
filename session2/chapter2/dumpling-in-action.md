## 2.4.2 Dumpling 实操指南

### 1. 需要的权限

需要为用户分配的权限：
+ SELECT
+ RELOAD
+ LOCK TABLES
+ REPLICATION CLIENT

关于 TiDB 权限管理请参考 [TiDB 数据库权限管理](https://pingcap.com/docs-cn/stable/reference/security/privilege-system/#%E6%9D%83%E9%99%90%E7%AE%A1%E7%90%86)。

### 2. 使用举例

导出命令：

```
dumpling -B tidb -F 2048 -H 127.0.0.1 -u root -P 4000 --loglevel debug
```

输出样例：

```
Release version:
Git commit hash: a35708fb6a9ca19294b92598b88d7894cf130ca6
Git branch:      master
Build timestamp: 2020-03-08 03:15:54Z
Go version:      go version go1.13.1 darwin/amd64

[2020/03/08 18:09:43.780 +08:00] [DEBUG] [config.go:72] ["parse server info"] ["server info string"=5.7.25-TiDB-v4.0.0-beta-313-g2d5d2fde27]
[2020/03/08 18:09:43.780 +08:00] [INFO] [config.go:85] ["detect server type"] [type=TiDB]
[2020/03/08 18:09:43.780 +08:00] [INFO] [config.go:103] ["detect server version"] [version=4.0.0-beta-313-g2d5d2fde27]
[2020/03/08 18:09:43.781 +08:00] [DEBUG] [prepare.go:27] ["list all the tables"]
[2020/03/08 18:09:43.788 +08:00] [DEBUG] [black_white_list.go:78] ["filter tables"]
[2020/03/08 18:09:43.788 +08:00] [WARN] [black_white_list.go:70] ["unsupported dump schema in TiDB now"] [schema=mysql]
```

### 3. 命令参数说明

使用 Dumpling 可以对下列参数进行配置:

| 参数 | 描述 |
| :-----| :---- |
| --consistency &lt;level&gt;  | 一致性级别: auto/none/flush/lock/snapshot，默认为 auto |
| -B, --database &lt;database&gt;  | 需要导出数据的数据库 |
| -F, --filesize &lt;size&gt; | 输出文件的最大尺寸，单位为 bytes |
| -H, --host &lt;hostname&gt; | 主机名，默认为 127.0.0.1 |
| --loglevel &lt;level&gt; | 日志级别：debug/info/warn/error/dpanic/panic/fatal，默认为 info |
| -W, --no-views | 是否导出视图，默认为 true |
| -o, --output &lt;dir&gt; | 输出文件目录，默认格式为 `./export-2020-03-08T11:37:05+08:00` |
| -p, --password &lt;password&gt; | 数据库连接密码 |
| -P, --port &lt;port&gt; | 数据库连接端口，默认为 4000 |
| --snapshot &lt;position&gt; | 快照起始位置，仅在一致性级别为 snapshot 时有效 |
| -t, --threads &lt;num&gt; | 并发线程数，默认为 4 |
| -u, --user &lt;user&gt; | 数据库连接用户名，默认为 root |

