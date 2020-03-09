# 背景
大量的应用程序使用唯一的标识符来确认一行记录，在传统的解决方案中，普遍依赖数据库的序列（sequence）对象来生成唯一标识中的数字部分，TiDB 目前版本（v3.0）还不支持序列（sequence），据悉 TiDB 将在 v4.0 版本正式提供序列功能。

互联网时代的数据量爆发，使得应用需要对大量的数据和消息进行唯一标识，即使有 sequence 功能，数据库也可能会由于高并发的 sequence 分配请求而遇到性能瓶颈。下面介绍两种高性能的序列号生成方案。

# 方案一，类 snowflake 方案
Snowflake 是 twitter 提出的分布式 id 生成方案，目前有多种实现，较流行的是百度的 uid-generator 和美团的 leaf。以下以 uid-generator 为例分析。

uid-generator 生成的 64 位 id 结构如下

![图片](https://uploader.shimo.im/f/6tTFV186YUQbK6Yt.png!thumbnail)

* sign（1bit）
固定 1bit 符号标识，即生成的 UID 为正数。
* delta seconds（默认28位）
当前时间，相对于可设置时间基点 (默认"2016-05-20")的增量值，单位：秒，28位时最多可支持约8.7年
* worker id（默认22位）
机器id，22位时最多可支持约 420w 次机器启动。内置实现为在启动时由数据库分配，默认分配策略为用后即弃，后续可提供复用策略。
* sequence（默认13 位）
每秒下的并发序列，13 bits可支持每秒8192个并发。

delta seconds 和 sequence 由节点自身生成，worker id 则是应用进程在启动时从一个集中式的id生成器取得， 之后这个进程的节点 id 一般不再变换，这样就减少了集中式id生成器的负载。常见的集中式 id 生成器是数据库自增列或者 Zookeeper。

当大流量写入时，由于 worker id 位于生成 id 的中部并且没有重复，不同节点生成的 id 之间就不会并排在一起，因此写入就会被打散到各个 region。

## 使用 Snowflake 时需要注意的问题
1. 节点时钟有可能回拨, 这时 snowflake 的实现一般会报错或者等待。
2. 大流量写入空表时，即使使用 snowflake, 最好提前 split region, 否则写入集中在少数的几个 region 中，而且 tidb 新建立的 region leader 还可能留在当前热点节点，无法缓解写入瓶颈。
3. 根据数据预期寿命调整 delta seconds 位数, 一般在 28 位至 44 位之间。
4. delta seconds 时间基点尽量贴近当前时间，不要使用默认值。
5. worker id 位数有限，对应数值不超过 500 万。 如果使用 tidb 的自增列实现 worker id，每次 tidb 实例的重启都会让自增列返回值增加至少 3 万, 这样最多 500/3 = 166 次实例重启后，自增列返回值就比 worker id 可接受的最大值要大。这时就不能直接使用这个过大的值，需要 truncate 自增列所在表，把自增列值重置为零， 也可以在 snowflake 实现层解决这个问题。
# 方案二 号段分配方案
本方案需要一张序列号生成表，每个序列使用一行数据来控制，这张表需要具有序列名称，序列最大值，序列获取步长（step）等字段，应用程序每次按配置好的步长来获取一批序列号，并同时更新该序列最大值，在应用内存中完成最终的序列号加工及分配。在预期并发变高时，可以通过调大序列获取步长的方式来降低这行记录上的更新并发。

这里需要注意，在 TiDB 中，必须使用 select for update 后再更新序列最大值，

在分布式系统中面对高并发场景下，是否可以稳定快速拿到一个唯一序列号至关重要，下面介绍一个生成唯一序列号的方式；

基于数据库的号段模式：

```
       号段模式是当下分布式 ID 生成器的主流实现方式之一，号段模式可以理解为从数据库批量的获取自增 ID，每次从数据库取出一个号段范围，例如 (1,1000] 代表 1000 个 ID，具体的业务服务将本号段，生成 1~1000 的自增 ID 并加载到内存。我们来看一下具体的实现方式。

表结构如下：
CREATE TABLE `key_producer` (
  `TABLENAME` varchar(80) COLLATE utf8_bin NOT NULL COMMENT '表名',
  `COLUMNNAME` varchar(80) COLLATE utf8_bin NOT NULL COMMENT '列名',
  `MAXSERIALNO` varchar(80) COLLATE utf8_bin DEFAULT NULL COMMENT '最大数',
  `DATEFMT` varchar(20) COLLATE utf8_bin NOT NULL COMMENT '日期模式',
  `NOFMT` varchar(20) COLLATE utf8_bin NOT NULL COMMENT '流水号模式',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`TABLENAME`,`COLUMNNAME`,`DATEFMT`,`NOFMT`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin COMMENT='索引生成表 '
```
 
```
具体代码如下：
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
public class KeyFactory {
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
    keyInfo =  keysMap.get(KeyInfo.getKey(sTable, sColumn, sDateFmt, sNoFmt ));
    if (keyInfo == null) {
        KeyInfo dbkey = new KeyInfo(sTable, sColumn, sDateFmt, sNoFmt, cacheSize);
        keysMap.put(dbkey.getInfoKey(),dbkey);
        keyInfo = dbkey;
    }
    sNewSerialNo = keyInfo.getNextSerialNo();
    return sNewSerialNo;
}
}
```
静态类变量 Map<String, KeyInfo>  keysMap ，该容器 key 值保存拼接字段 tablename@columname@datefmt@nofmt ；value 保存号段信息类 keyInfo；
```
微服务获取唯一序列号都是先从 keysMap 中获取，keyInfo 返回空会初始化申请序列号表的 keyInfo 号段信息，获取唯一序列号的主要方法 keyInfo.getNextSerialno(); 代码如下：
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
        //判断号段的最大值是否为零
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
                //queryDBKeyTable 方法用于获取号段最大数，详细执行 sql --select MaxSerialNo from key_producer where TableName=? and ColumnName=? and DateFmt=? and NoFmt=? for update
                sOldMaxSerialNo = queryDBKeyTable(sTableUpper, sColumnUpper, sDateFmt, sNoFmt, con);
                if (sOldMaxSerialNo == null) {
                    //InsertDBKeyTable 方法用于插入初始化值，详细执行 sql -- insert into key_producer (TableName,ColumnName,MaxSerialNo,DateFmt,NoFmt) values (?,?,?,?,?);
                    sOldMaxSerialNo = InsertDBKeyTable(sTableUpper, sColumnUpper,sDateFmt, sNoFmt, con);
                }
                // 判断是否有号段最大数，没有则按照日期初始化
                if ("INIT".equals(sOldMaxSerialNo)) {
                    //LockDBKeyTable 方法用于更新初始化数据为号段最大数赋值，详细执行sql -- update key_producer set MaxSerialNo=MaxSerialNo where TableName=? and ColumnName=? and DateFmt=? and NoFmt=?
                    LockDBKeyTable(sTableUpper, sColumnUpper,sDateFmt, sNoFmt, con);
                    //getMaxNoFromBusiTable方法：从数据表中通过max方法获取最大号段值
                    iMaxNo= getMaxNoFromBusiTable(sTable, sColumn, getPrefixDate(), sOldMaxSerialNo, con);
                }
 
                iMaxNo = getMaxNo(sOldMaxSerialNo);
                setMaxNo(iMaxNo);
                //updateDBKeyTable 方法用于更新号段最大数信息，详细执行 sql -- update key_producer set MaxSerialNo=? where TableName=? and ColumnName=? and DateFmt=? and NoFmt=? and MaxSerialNo=?
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
可以看到使用了 select for update 以及 synchronized 关键字，确保了高并发下的全局唯一性，并且十分灵活不绑定单一数据库产品，经测试在 16 个微服务 120 万 QPS  联机交易以及批量业务双重压力测试下没有任何问题。
