# 背景
应用程序通常使用唯一标识符来确认一行记录。传统解决方案普遍依赖数据库的序列对象（Sequence）来生成唯一标识符中的数字部分。TiDB 4.0 正式支持序列。但是，互联网应用需要处理的数据量巨大且往往呈现爆发式增长，使得应用程序必须在短时间内为大量数据和消息生成唯一标识符。这种场景下，即使有了序列功能，数据库也可能会由于高并发的序列分配请求而出现性能瓶颈。

本节将介绍两种高性能的序列号生成方案。

# 方案一：类 Snowflake 方案
Snowflake 是 Twitter 提出的分布式 ID 生成方案。目前有多种实现，较流行的是百度的 uid-generator 和美团的 leaf。下面以 uid-generator 为例展开说明。

uid-generator 生成的 64 位 ID 结构如下

![图片](https://uploader.shimo.im/f/6tTFV186YUQbK6Yt.png!thumbnail)

* sign：长度固定为 1 位。符号标识，即生成的 UID 为正数。
* delta seconds：默认 28 位。当前时间，相对于可设置时间基点 (默认 "2016-05-20") 的增量值，单位为秒。28 位最多可支持约 8.7 年。
* worker node id：默认 22 位。机器 id，22 位时最多可支持约 420 万次机器启动。内置实现为在启动时由数据库分配。默认分配策略为用后即弃，后续可提供复用策略。
* sequence：默认 13 位。每秒下的并发序列，13 位可支持每秒 8192 个并发。
* worker node id：默认 22 位。

delta seconds 和 sequence 由节点自身生成，worker node id 则是应用进程在启动时从一个集中式的 ID 生成器取得，之后这个进程的节点 ID 一般不再变换，这样就减少了集中式 ID 生成器的负载。常见的集中式 ID 生成器是数据库自增列或者 Zookeeper。

当大流量写入时，由于 worker node id 位于生成 ID 的中部并且没有重复，不同节点生成的 ID 之间就不会并排在一起，因此写入就会被打散到各个 region。

## 使用 Snowflake 时需要注意的问题
1. 节点时钟有可能回拨, 这时 Snowflake 的实现一般会报错或者等待。
2. 大流量写入空表时，即使使用 Snowflake, 最好提前 split region, 否则写入集中在少数几个 region 中，而且 TiDB 新建立的 region leader 还可能留在当前热点节点，无法缓解写入瓶颈。
3. 根据数据预期寿命调整 delta seconds 位数, 一般在 28 位至 44 位之间。
4. delta seconds 时间基点尽量贴近当前时间，不要使用默认值。
5. worker node id 位数有限，对应数值不超过 500 万。 如果使用 TiDB 的自增列实现 worker node id，每次 TiDB 实例的重启都会让自增列返回值增加至少 3 万，这样最多 500 / 3 = 166 次实例重启后，自增列返回值就比 worker node id 可接受的最大值要大。这时就不能直接使用这个过大的值，需要清空自增列所在的表，把自增列值重置为零，也可以在 Snowflake 实现层解决这个问题。
# 方案二：号段分配方案
号段模式也是当下分布式 ID 生成器的主流实现方案之一。号段模式可以理解为从数据库批量获取自增 ID，例如每次取出 1000 个 ID。

本方案需要一张序列号生成表，每行记录表示一个序列对象。表结构定义如下所示：
| 字段名 | 字段类型 | 字段说明 |
| :---- | :------ | :------ |
| TABLENAME | varchar(80) | 表名称 |
| COLUMNNAME | varchar(80) | 列名称 |
| MAXSERIALNO | varchar(80) | 最大数 |
| DATEFMT | varchar(80) | 列名称 |
| NOFMT | varchar(80) | 列名称 |
| UPDATE_TIME | varchar(80) | 列名称 |

这张表需要具有序列名称、序列最大值、序列获取步长（step）等字段。应用程序每次按配置好的步长来获取一段序列号，并同时更新该序列最大值，在应用程序内存中完成最终的序列号加工及分配。在预期并发变高时，可以通过调大序列获取步长的方式降低这行记录上的并发更新频度。

这里需要注意，在 TiDB 中，必须使用 SELECT FOR UPDATE 锁定相关记录行之后再更新序列最大值。

下面介绍具体的实现方法。

表结构定义如下：

```
CREATE TABLE `key_producer` (
  `TABLENAME` varchar(80) COLLATE utf8_bin NOT NULL COMMENT '表名称',
  `COLUMNNAME` varchar(80) COLLATE utf8_bin NOT NULL COMMENT '列名称',
  `MAXSERIALNO` varchar(80) COLLATE utf8_bin DEFAULT NULL COMMENT '最大数',
  `DATEFMT` varchar(20) COLLATE utf8_bin NOT NULL COMMENT '日期格式',
  `NOFMT` varchar(20) COLLATE utf8_bin NOT NULL COMMENT '流水号格式',
  `UPDATE_TIME` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`TABLENAME`,`COLUMNNAME`,`DATEFMT`,`NOFMT`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin COMMENT='索引生成表 '
```
 
具体代码如下：

```
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
public class KeyFactory {
    // key 值保存拼接字段 tablename@columname@datefmt@nofmt
    // value 保存号段信息类 keyInfo
    private static Map<String, KeyInfo> keysMap = new ConcurrentHashMap<String, KeyInfo>(50);

/**
 * 根据指定格式获得唯一索引
 * @param sTable 表名称
 * @param sColumn 字段名称
 * @param sDateFmt 日期格式(可以带前缀)
 * @param sNoFmt 流水号格式(指定长度，如00000000表示8位长度)
 * @param cacheSize 号段长度
 * @return String 日期格式的流水号
 *         例：getSerialNoByDS("cust_info","custid","yyyyMMdd","000000",500)
 */
public static String getSerialNoByDS(String sTable, String sColumn, String sDateFmt, String sNoFmt, int cacheSize) throws Exception {
    String sNewSerialNo = "DBERROR";
    KeyInfo keyInfo;
    
    // 从 keysMap 中获取唯一序列号
    // 若返回值为空，则初始化申请序列号表的 keyInfo 号段信息
    keyInfo =  keysMap.get(KeyInfo.getKey(sTable, sColumn, sDateFmt, sNoFmt ));
    if (keyInfo == null) {
        KeyInfo dbkey = new KeyInfo(sTable, sColumn, sDateFmt, sNoFmt, cacheSize);
        keysMap.put(dbkey.getInfoKey(),dbkey);
        keyInfo = dbkey;
    }
    
    // keyInfo.getNextSerialno() 是获取唯一序列号的主要方法
    sNewSerialNo = keyInfo.getNextSerialNo();
    return sNewSerialNo;
}
}
```

<!--TODO: 以下是 KeyInfo 类的实现，缺少了 Class 定义和构造函数，需要补充。 -->
```
    /**
     * 获取唯一序列号
     *
     * @return
     * @throws Exception
     */
    protected synchronized String getNextSerialNo() throws Exception {
        String sNextSerilNo = null;
        if(notExistKey()) {
            init();
        }
	
        // 判断号段的最大值是否为零
        if (iMaxNo !=0 ) {
            sNextSerilNo = getNextNo();
        }else {
            sNextSerilNo = getSerialNoFromDB();
        }
        return sNextSerilNo;
	}
	 
    /**
     * 获取下一个序列号
     * @return
     */
    protected synchronized String getNextNo()  {
        iCurrent ++;
        return getPrefixDate() +  df.format(iMaxNo + iCurrent);
    }
    
    /**
     * 根据指定格式获得唯一序列号
     * @return String 日期格式的唯一序列号
     * @throws SQLException
     * @throws InterruptedException
     */
    private String getSerialNoFromDB() throws SQLException, InterruptedException, ClassNotFoundException {
        String sTable =getTable();
        String sColumn = getColumn();
        String sDateFmt = getDateFmt();
        String sNoFmt = getNoFmt();
        String sTableUpper = sTable.toUpperCase();
        String sColumnUpper =sColumn.toUpperCase();
        Class.forName("com.mysql.cj.jdbc.Driver");
        Connection con = DriverManager.getConnection("jdbc:mysql://192.168.139.40:4000/demo","root","");
        boolean isAutoCommit = con.getAutoCommit();
        if (isAutoCommit) {con.setAutoCommit(false);}
 
        try {
            long iMaxNo = 0;
            for (int iTry = 0; iTry < 2; iTry++) {
                String sOldMaxSerialNo="";
                if (iTry > 0) {
                    con.commit();
                    System.out.println("getSerialNo["+getInfoKey()+"/"+sOldMaxSerialNo+"-"+getMaxSerialNo()+"] Update Failed. Lock Try!");
                    LockDBKeyTable(sTableUpper, sColumnUpper,sDateFmt, sNoFmt, con);
                }
		
                // queryDBKeyTable 方法用于获取号段最大数，详细执行 sql --select MaxSerialNo from key_producer where TableName=? and ColumnName=? and DateFmt=? and NoFmt=? for update
                sOldMaxSerialNo = queryDBKeyTable(sTableUpper, sColumnUpper, sDateFmt, sNoFmt, con);
                if (sOldMaxSerialNo == null) {
                    // InsertDBKeyTable 方法用于插入初始化值，详细执行 sql -- insert into key_producer (TableName,ColumnName,MaxSerialNo,DateFmt,NoFmt) values (?,?,?,?,?);
                    sOldMaxSerialNo = InsertDBKeyTable(sTableUpper, sColumnUpper,sDateFmt, sNoFmt, con);
                }
		
                // 判断是否有号段最大数，没有则按照日期初始化
                if ("INIT".equals(sOldMaxSerialNo)) {
                    // LockDBKeyTable 方法用于更新初始化数据为号段最大数赋值，详细执行sql -- update key_producer set MaxSerialNo=MaxSerialNo where TableName=? and ColumnName=? and DateFmt=? and NoFmt=?
                    LockDBKeyTable(sTableUpper, sColumnUpper,sDateFmt, sNoFmt, con);
                
		    // getMaxNoFromBusiTable方法：从数据表中通过max方法获取最大号段值
                    iMaxNo= getMaxNoFromBusiTable(sTable, sColumn, getPrefixDate(), sOldMaxSerialNo, con);
                }
 
                iMaxNo = getMaxNo(sOldMaxSerialNo);
                setMaxNo(iMaxNo);
                
		// updateDBKeyTable 方法用于更新号段最大数信息，详细执行 sql -- update key_producer set MaxSerialNo=? where TableName=? and ColumnName=? and DateFmt=? and NoFmt=? and MaxSerialNo=?
                int iUpd =  updateDBKeyTable(sTableUpper, sColumnUpper,sDateFmt, sNoFmt, getMaxSerialNo(), sOldMaxSerialNo, con);
                if (iUpd == 1) {
                    con.commit();
                    break;
                }
            }
        } catch (SQLException e) {
            System.out.println("getSerialNo...失败[" + e.getMessage() + "]!");
            String errorMsg = e.getMessage();
                if (con != null) {
                    con.rollback();
 
                    if (isAutoCommit) {con.setAutoCommit(true);}
                    con.close();
                    con = null;
                return getSerialNoFromDB();
            }
            throw e;
        }
        finally {
            if (con != null) {
                con.commit();
                if (isAutoCommit) {con.setAutoCommit(true);}
                con.close();
            }
        }
        return getNextNo();
	}
```

可以看到，使用了 SELECT FOR UPDATE 以及 synchronized 关键字，确保了高并发下的全局唯一性，并且十分灵活不绑定单一数据库产品。经测试，在 16 个微服务、 120 万 QPS 联机交易以及批量业务双重压力测试下没有任何问题。
