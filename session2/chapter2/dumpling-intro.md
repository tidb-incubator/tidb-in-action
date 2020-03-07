# 分布式导出工具 Dumpling

[`Dumpling`](https://github.com/pingcap/dumpling)是`Mydumper`的替代工具，能够从任何兼容`MySQL`协议的的数据库中导出数据，`Dumpling`的导出速度和`Mydumper`不相上下，由于能够生成二进制的输出文件，在使用`Lightning`将数据导入到`TiDB`时会加快速度。此外，`Dumpling`还支持云存储功能。
