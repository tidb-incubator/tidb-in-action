# Gitbook

Read it: [TiDB In Action: based on 4.0](https://book.tidb.io/)

## 如何贡献

从 [目录](SUMMARY.md) 找到还没有被认领的章节。参考 [PR/3](https://github.com/pingcap-incubator/tidb-in-action/pull/3) 提交一个 Pull Request 请求认领，当请求被合并之后就算认领成功。

文章内容格式采用 [markdown](https://daringfireball.net/projects/markdown/syntax). Github 简易入门[指南](https://docs.google.com/document/d/1IiCrX3tFg6yvTrmlEXnsHoWUdyeCLkvJo31AjbjDWBs/edit)

## 图片目录

 请把图片放在 `res/sessionX/chapterY/` 目录。举个例子, 文章 `session1/chapter1/tidb-intro.md` 中的图片应该放在 `/res/session1/chapter1/tidb-intro/` 目录下，对应到 markdown 中的格式是 `![1.png](/res/session1/chapter1/tidb-intro/1.png)`

## TiDB in Action 写作规则

 TiDB in Action 是一本重视实操的书，更偏向工具的介绍和使用，介绍原理部分会比较少，而且会尽量通过宏观的描述或者图片的形式表达。

### 好的例子

#### 关于特性和产品介绍

* 介绍工具的简单原理
* 介绍工具如何使用（常见的参数，常见的应用场景）
* 给出一两个简单的例子

#### 关于最佳实践

* 力求用文字或图清晰按照时间轴描述整个过程
    * 事前准备
    * 事中操作流程
    * 事后
* 轻原理，重实操

### 不好的例子

* 贴原理实现的代码
* 直接复制粘贴案例，但是无操作流程
* 对工具只介绍，不给例子
* 选择的例子是个特例（不可复现）

## [License](LICENSE)

Shield: [![CC BY-SA 4.0][cc-by-sa-shield]][cc-by-sa]

This work is licensed under a [Creative Commons Attribution-ShareAlike 4.0
International License][cc-by-sa].

[![CC BY-SA 4.0][cc-by-sa-image]][cc-by-sa]

[cc-by-sa]: http://creativecommons.org/licenses/by-sa/4.0/
[cc-by-sa-image]: https://licensebuttons.net/l/by-sa/4.0/88x31.png
[cc-by-sa-shield]: https://img.shields.io/badge/License-CC%20BY--SA%204.0-lightgrey.svg
