## 字符集和排序规则

字符集即字符的集合，比如`中`,`国`,`人`,`a`，`b`，`c`，每个都是一个字符。

排序规则用来确定字符集中的任意字符组成的字符串的大小关系。

目前`tidb`中一共有`binCollator`、`binPaddingCollator`和`generalCICollator`这`3`种排序规则。


### `binCollator`

代码名是`binary`，规则是：

```golang
func (bc *binCollator) Compare(a, b string, opt CollatorOption) int {
	return strings.Compare(a, b)
}
```

即规则同`golang`中任意两个`string`的大小判定规则。

### `binPaddingCollator`

代码名有`utf8mb4_bin`和`utf8_bin`，规则是：

```golang
func (bpc *binPaddingCollator) Compare(a, b string, opt CollatorOption) int {
	return strings.Compare(truncateTailingSpace(a), truncateTailingSpace(b))
}
```

即会首先将尾部的空格截掉，然后再做比较。

### `generalCICollator`

代码名有`utf8mb4_general_ci`和`utf8_general_ci`,主要是做大小写无关（`CI=Case Insensitive`）的处理：

```golang
func (gc *generalCICollator) Compare(a, b string, opt CollatorOption) int {
	a = truncateTailingSpace(a)
	b = truncateTailingSpace(b)
	for len(a) > 0 && len(b) > 0 {
		r1, r1size := utf8.DecodeRuneInString(a)
		r2, r2size := utf8.DecodeRuneInString(b)

		cmp := int(convertRune(r1)) - int(convertRune(r2))
		if cmp != 0 {
			return sign(cmp)
		}
		a = a[r1size:]
		b = b[r2size:]
	}
	return sign(len(a) - len(b))
}

```

即首先将尾部的空格截掉，然后以两个字符串从头开始相同位置第一个不等价（相同字或者大小写关系视为等价）的字的大小关系作为两个字符串的大小关系，如果直到其中一个字符串结束，都没找到不等价的字，那么判定更长的一方为大。

