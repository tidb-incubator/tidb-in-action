# 概要
TiDB 兼容 MySQL，支持无限的水平扩展，具备强一致性和金融级高可用性，为 OLTP 和 OLAP 场景提供一站式的解决方案很香。但想要使用使用 TiDB 时，小伙伴都会被要求做基准测试并与 MySQL 对比，本文基于 Sysbench 测试工具做简要说明。

# 工具集方案
* Sysbench 安装
```
mkdir -p /tmp/sysbench
cd /tmp/sysbench
wget https://github.com/akopytov/sysbench/archive/1.0.14.tar.gz
yum -y install make automake libtool pkgconfig libaio-devel
yum -y install mariadb-devel
./autogen.sh
./configure
make -j
make install
sysbench --version  
```
* 硬件配置

|  项目  | <center>配置</center> |  <center>台数<center>  |  说明  |
| :----: | :----  | :----:  | :----  |
| TiDB & PD | CPU: 2 * E5-2650 v4 @ 2.20GHz  内存: 128G  硬盘：2*800G 固态、3*1.6T SSD  网卡: 2 × 万兆 做 bond-1 |  3  | TiDB 和 PD 应用部署，文件系统 ext4 |
| TiKV      | CPU：2 * E5-2650 v4 @ 2.20GHz  内存：256G  硬盘：2*480G 固态、4*1.92T NVMe SSD  网卡：2 × 万兆 做 bond-1 |  3  | TiKV 应用部署，文件系统 ext4
