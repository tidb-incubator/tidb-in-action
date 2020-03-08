

大数据生态组件可谓是百花齐放，百家争鸣，由于时间和技术的原因，企业多会部署多类大数据基础组件，上了TiDB 之后，如何实现TiDB 与现有大数据生态的数据库进行互联互通呢？大家可能会有不同的方案来实现，本章主要讨论 如何使用利用现有的开源工具高效低成本的实现TiDB 与现有大数据组件比如 Hbase、ES、Druid 进行数据交互。
实现不同类型的数据库之间的数据互联互通，从平台和工具层次看主要解决方案是使用ETL 工具。这里ETL 我们主要使用Kettle 。主要介绍如何使用Kettle 实现TiDB 与HBase、ES、Druid 之间实现数据交互。

# 1.ES 数据导入TiDB
   主要实现将ES 的数据以数据流的方式抽取到内存，经过一系类处理之后，以流的方式保存到TiDB ，主要使用到的Kettle 的组件为：tableinput、Elasticsearch Query（扩展插件）。
## 1.1 场景描述：
   将在ES 的表bmsshakehandsinfo_202003 每天定时导入TIDB 的数据库中的表Temp_ETL_Handshake。
## 1.2 ETL 流程设置：
### 1.2.1 ES 的查询设置
  如下图1-1所示，通过ES 查询组件设置需要查询的SQL 。从ES 数据库获取数据是采用分批的方式获取的。可以通过界面设置每次获取数据的条数大小。其中SQL 查询可以通过采用Kettle 变量的形式进行参数的动态传递 如下 1-2 所示  .其中  
  ![Alt](https://imgconvert.csdnimg.cn/aHR0cHM6Ly91cGxvYWRlci5zaGltby5pbS9mL08xeW51V1JtRGxRS2ZKUEwucG5n?x-oss-process=image/format,png#pic_center) 											
图1-1
         ![Alt](https://imgconvert.csdnimg.cn/aHR0cHM6Ly91cGxvYWRlci5zaGltby5pbS9mLzV3N0FMMFZCWGRjcUNpSlkucG5n?x-oss-process=image/format,png#pic_center)
 图1-2
### 1.2.2 TiDB 的查询组件设置：
   将数据写入TiDB ，主要采用Kettle 内置的tableout 插件相关的设置如下.
### 1.2.2.1数据源设置：
   Kettle 里面设置TiDB 的数据源直接采用Kettle 内置的MySQL 数据驱动即可。如下图1-3所示
![Alt](https://imgconvert.csdnimg.cn/aHR0cHM6Ly91cGxvYWRlci5zaGltby5pbS9mL2FtS0J5ck5laGVRRjNURTgucG5n?x-oss-process=image/format,png#pic_center)
                       图1-3
### 1.2.2.2  TiDB 数据保存设置
TiDB 的数据保存设置界面如图 1-4所示，设置对应的数据库、数据库表以及每次提交的数据量。
	相关参数注意事项如下：
		提交的数据量   
                 需要结合TiDB 的事务大小对应处理，一般建议每次处理的条数在60-100.（可以根据硬件资源情况和事务设置进行调整）
                设置条数的同时，可以通过设置此插件运行时复制的个数进行性能提升，充分利用TiDB的高并发特性
 		忽略插入错误
                对于插入过程中出现的错误，可以选择插入过程中忽略或者默认停止
                如果插入过程中针对重复数据进行更新，可以采用Kettle 的插入/更新步骤,由于此插件没有实现TiDB 支持的on duplicate 语法，如果需要性能较高，可以通过开发插件的方式，进一步提升插入的性能
![Alt](https://imgconvert.csdnimg.cn/aHR0cHM6Ly91cGxvYWRlci5zaGltby5pbS9mL3hneEJDNmVGRnNJVVRjZDMucG5n?x-oss-process=image/format,png#pic_center)
                                                              图1-4
### 1.2.3 数据处理流程设置
   通过Kettle 的转换流程，将上述步骤设置的ES 的数据抽取、TiDB 的数据导入以流程的方式进行数据流的处理，当然中间可以进行复杂的清洗和转换设置，这里不做重点描述。数据流设置界面如图1-5所示，其中60代表数据流程执行时，同时运行60个插入的实例，向TiDB 进行高速的写入数据
   ![Alt](https://imgconvert.csdnimg.cn/aHR0cHM6Ly91cGxvYWRlci5zaGltby5pbS9mL2VmbGg5UVVnc0QwWHhCckUucG5n?x-oss-process=image/format,png#pic_center)
图1-5
### 1.2.4 设置流程执行的时机
   通过Kettle 的定时器，可以设置流程的执行时间。如图1-6 所示。
![Alt](https://imgconvert.csdnimg.cn/aHR0cHM6Ly91cGxvYWRlci5zaGltby5pbS9mL2NGNFRvY2hQN2ZRc2ZwczYucG5n?x-oss-process=image/format,png#pic_center)
               图1-6

以上完整的定义了通过Kettle 工具，按需定时的将数据从ES 以流的方式导入到TiDB 。
 
# 2.Hbase 数据导入TiDB
 Hbase 的数据导入TiDB ，主要使用的步骤为Kettle 内置的HbaseInput、TableOutPut。其中数据导入到TiDB 的TableOutPut 同ES 导入TiDB 类似，不在赘述。
## 2.1ETL流程设置
数据源设置是直接采用Kettle 的的HBase input 组件,如图1-6,选择Hbase 集群链接、获取对应的表名和mapping 列表。
![Alt](https://imgconvert.csdnimg.cn/aHR0cHM6Ly91cGxvYWRlci5zaGltby5pbS9mL0JFN1Foc0VjNDBzcFcwaUEucG5n?x-oss-process=image/format,png#pic_center)
图1-6
![Alt](https://imgconvert.csdnimg.cn/aHR0cHM6Ly91cGxvYWRlci5zaGltby5pbS9mL00xSmFjYjQxaUdjbjVXOWUucG5n?x-oss-process=image/format,png#pic_center)
图1-7




# 3.Druid 数据导入TiDB
   Druid 的数据导入TiDB ，主要使用的步骤为Druid 查询组件（扩展开发）、TableOutPut。其中数据导入到TiDB 的TableOutPut 同ES 导入TiDB 类似，不在赘述。Druid 的查询组件设置如下，通过该组件可以通过设置Druid SQL 的方式进行数据源的抽取。
      ![Alt](https://imgconvert.csdnimg.cn/aHR0cHM6Ly91cGxvYWRlci5zaGltby5pbS9mL09MeDhQMHZnUE1VZktVaHUucG5n?x-oss-process=image/format,png#pic_center)

 
 
