
### 软件版本要求如下：
1. Docker CE 18.09.6
2. Kubernetes v1.12.5+
3. CentOS 7.6 以上，内核要求为 3.10.0-957 或之后版本

### 部署 Cloud TiDB 资源要求如下:
1. 至少 3 台服务器可供使用
2. 至少 6 个 PV 可供使用(3 PV 用于 TiKV 实例，分布于不同服务器；3 PV用于 PD 部署，分布于不同服务器)

### Linux 内核参数要求如下:
net.core.somaxconn=32768
vm.swappiness=0
net.ipv4.tcp_syncookies=0
net.ipv4.ip_forward=1
fs.file-max=1000000
fs.inotify.max_user_watches=1048576
fs.inotify.max_user_instances=1024
net.ipv4.conf.all.rp_filter=1
net.ipv4.neigh.default.gc_thresh1=80000
net.ipv4.neigh.default.gc_thresh2=90000
net.ipv4.neigh.default.gc_thresh3=100000
net.bridge.bridge-nf-call-iptables=1
net.bridge.bridge-nf-call-arptables=1
net.bridge.bridge-nf-call-ip6tables=1

### 其他Linux配置要求
1. 将 Linux swap 关闭（永久关闭）
2. 启动irqbalance服务
