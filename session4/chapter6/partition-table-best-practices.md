# 6.4 分区表实践及问题处理

随着数据表存储的数据量越来越大，有时会超过亿或者百亿级别，对于这些大表的历史数据删除需求时，特别的不方便，如果采用 DELETE 语句来删除的话，一是可能会线上正常业务造成影响，二是删除的速度太慢，针对这些问题，分区表应运而生，大家比较熟悉的就是基于时间维度的 Range 分区表，可以通过对分区的 DDL 操作来快速的删除数据，提高了处理数据的效率，避免了对线上业务的影响。
	

