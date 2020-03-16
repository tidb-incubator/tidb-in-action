## 10.3 证书管理与数据加密

从 TiDB 3.0.8 版本开始，TiDB 支持基于证书鉴权的登录方式。采用这种方式，TiDB 通过验证不同用户提供的客户端证书来确认身份，并在登陆后使用加密连接来传输数据。相比 TiDB 用户常用的用户名密码验证方式，与 MySQL 相兼容的证书鉴权方式更安全，因此越来越多的用户使用证书鉴权来代替用户名密码验证。

### 10.3.1 证书管理可以做什么
TiDB 服务端默认采用非加密连接，因而具备监视信道流量能力的第三方可以知悉 TiDB 服务端与客户端之间发送和接受的数据，包括但不限于查询语句内容、查询结果等。若信道是不可信的，例如客户端是通过公网连接到 TiDB 服务端的，则非加密连接容易造成信息泄露，建议使用加密连接确保安全性。

使用证书验证加密连接后，连接将具有以下安全性质：

* 保密性：流量明文无法被窃听；
* 完整性：流量明文无法被篡改；
* 身份验证（可选）：客户端和服务端能验证双方身份，避免中间人攻击。
### 10.3.2 证书管理的原理
TiDB 证书管理功能中使用的证书，需要符合 X.509 协议。用户先生成服务端密钥，服务端证书，客户端密钥和客户端证书，用户再通过自己的 CA(根证书) 对服务端证书和客户端证书进行签名。

* 服务端验证机制：如果客户端在建立连接时，提供了 CA 证书；则会验证服务端的证书是否是由这个 CA 签发，从而验证服务端身份。
* 客户端验证机制：如果在 TiDB 中配置了 CA 路径，则会在用户登陆时，检查客户端提供的证书是否由 CA 签发，从而验证客户端身份。
* 加密通信：在验证身份之后，会进行密钥协商，之后的数据传输将采用协商后的密钥进行加密。

除了验证证书签名外，TiDB 还支持对于指定用户验证客户端证书的具体内容，包括 sbject， issuer，cipher。 这个功能的实现是通过将验证的信息写入 mysql.global_priv 系统表来完成。

在用户登录时，TiDB 获取到客户端证书，会比对相应的验证内容是否符合对相关用户的要求。

如果符合，则可以登陆。

### 10.3.3 证书管理操作示例
#### 1.制作 CA 证书
目前推荐使用 [OpenSSL](https://www.openssl.org/) 来生成密钥和证书，先执行以下命令来安装 OpenSSL：

```
sudo apt-get install openssl
```
首先要制作一个 CA，生成 CA 密钥：
```
sudo openssl genrsa 2048 > ca-key.pem
```
生成 CA 密钥对应的 CA 证书：
```
sudo openssl req -new -x509 -nodes -days 365000 -key ca-key.pem -out ca-cert.pem
```
输入证书信息，示例如下：
```
Country Name (2 letter code) [AU]:US
State or Province Name (full name) [Some-State]:California
Locality Name (eg, city) []:San Francisco
Organization Name (eg, company) [Internet Widgits Pty Ltd]:PingCAP Inc.
Organizational Unit Name (eg, section) []:TiDB
Common Name (e.g. server FQDN or YOUR name) []:TiDB admin
Email Address []:s@pingcap.com
```
至此 CA 证书制作完成，在线上使用过程中，CA 密钥最好保存在一个离线安全的服务器上。
#### 2.制作服务端密钥和证书
接下来是制作服务端密钥和证书，用以下命令生成服务端密钥：

```
sudo openssl req -newkey rsa:2048 -days 365000 -nodes -keyout server-key.pem -out server-req.pem
```
输入证书信息：
```
Country Name (2 letter code) [AU]:US
State or Province Name (full name) [Some-State]:California
Locality Name (eg, city) []:San Francisco
Organization Name (eg, company) [Internet Widgits Pty Ltd]:PingCAP Inc.
Organizational Unit Name (eg, section) []:TiKV
Common Name (e.g. server FQDN or YOUR name) []:TiKV Test Server
Email Address []:k@pingcap.com

Please enter the following 'extra' attributes
to be sent with your certificate request
A challenge password []:
An optional company name []:
```
生成服务端 RAS 密钥：
```
sudo openssl rsa -in server-key.pem -out server-key.pem
```
使用 CA key和证书生成服务端证书：
```
sudo openssl x509 -req -in server-req.pem -days 365000 -CA ca-cert.pem -CAkey ca-key.pem -set_serial 01 -out server-cert.pem
```
#### 3.制作客户端密钥和证书
生成客户端密钥和证书也是类似的操作：

```
sudo openssl req -newkey rsa:2048 -days 365000 -nodes -keyout client-key.pem -out client-req.pem
sudo openssl rsa -in client-key.pem -out client-key.pem
sudo openssl x509 -req -in client-req.pem -days 365000 -CA ca-cert.pem -CAkey ca-key.pem -set_serial 01 -out client-cert.pem
```
生成服务端和客户端证书之后，可以通过以下命令来验证证书：
```
openssl verify -CAfile ca-cert.pem server-cert.pem client-cert.pem
```
验证通过会显示以下信息：
```
server-cert.pem: OK
client-cert.pem: OK
```
#### 4.配置 TiDB 启用证书验证
在生成证书之后，需要为 TiDB 配置证书，步骤如下：

修改 TiDB 配置文件中的 [security] 段。这一步指定 CA 证书、服务端密钥和服务端证书存放的路径。

```
[security]
ssl-cert ="path/to/server-cert.pem"
ssl-key ="path/to/server-key.pem"
ssl-ca="path/to/ca-cert.pem"
```
启动 TiDB 日志。如果日志中有以下内容，即代表配置生效：
```
[INFO] [server.go:264] ["secure connection is enabled"] ["client verification enabled"=true]
```
客户端在登陆 TiDB 时，指定客户端密钥和证书路径，不指定 --ssl-ca 则只会加密连接，不会验证服务端身份。
```
mysql -utest -h0.0.0.0 -P4000 --ssl-cert /path/to/client-cert.pem --ssl-key /path/to/client-key.pem --ssl-ca /path/to/ca-cert.pem
```
上面演示了如何制作证书和使用证书进行加密连接，接下来会演示如何使用证书验证用户身份。
TiDB 支持在用户登陆时，验证 subject，issuer，cipher 分别是指：

- subject： 指定用户在连接时需要提供客户端证书的 subject 内容，对应制作客户端证书时，输入的信息。

- issuer： 指定签发用户证书的 CA 证书的 subject 内容，对应制作 CA 证书时，输入的信息。

指定验证用户的 subject 用于验证客户端证书和账号的匹配关系；指定验证用户的 issuer 用户验证用户提供的 CA 证书是否可信。

可以在创建用户时指定验证信息：

```
create user 'u1'@'%'  require issuer '/C=US/ST=California/L=San Francisco/O=PingCAP Inc./OU=TiDB/CN=TiDB admin/emailAddress=s@pingcap.com' subject '/C=US/ST=California/L=San Francisco/O=PingCAP Inc./OU=TiDB/CN=tpch-user1/emailAddress=zz@pingcap.com' cipher 'TLS_AES_256_GCM_SHA384
```
也可以在创建用户后，通过 GRANT 操作指定验证信息：
```
> create user 'u1'@'%';
> grant all on *.* to 'u1'@'%' require issuer '/C=US/ST=California/L=San Francisco/O=PingCAP Inc./OU=TiDB/CN=TiDB admin/emailAddress=s@pingcap.com' subject '/C=US/ST=California/L=San Francisco/O=PingCAP Inc./OU=TiDB/CN=tpch-user1/emailAddress=zz@pingcap.com' cipher 'TLS_AES_256_GCM_SHA384';
```
配置完成后，TiDB 在用户在登录时会验证以下内容：
* 使用 SSL 登录，且证书为 Server 配置的 CA 证书所签发
* 证书 Issuer 信息和权限配置里的信息相匹配
* 证书 Subject 信息和权限配置里的信息相匹配

全部验证通过后方可登录，否则会报 ERROR 1045 (28000): Access denied 错误。

### 10.3.4 更新和替换证书：
证书和密钥通常会周期性更新，下文介绍更新密钥和证书的流程。

CA 证书 是客户端和服务端相互校验的依据，所以如果需要替换 CA 证书，则需要生成一个组合证书来在滚动期间同时支持新旧客户端和服务器的验证，并优先将客户端和服务端的 CA 证书都替换完成后再进行其他客户端和服务端的密钥和证书替换。

#### 1.更新 CA 证书
以替换 CA 密钥为例（如：ca-key.pem 被盗了），首先将旧的 CA 密钥和证书进行备份：

```
mv ca-key.pem ca-key.old.pem
mv ca-cert.pem ca-cert.old.pem
```
之后生成新的 CA 密钥 ：
```
sudo openssl genrsa 2048 > ca-key.pem
```
用新的密钥生成新的 CA 证书：
```
sudo openssl req -new -x509 -nodes -days 365000 -key ca-key.pem -out ca-cert.new.pem
```
生成组合 CA 证书：
```
cat ca-cert.new.pem ca-cert.old.pem > ca-cert.pem
```
之后使用新生成的组合 CA 证书并重启 TiDB Server，此时服务端可以同时接受和使用新旧 CA 证书。
#### 2.更新服务端证书
生成新的服务端密钥和证书：

```
sudo openssl req -newkey rsa:2048 -days 365000 -nodes -keyout server-key.new.pem -out server-req.new.pem
sudo openssl rsa -in server-key.new.pem -out server-key.new.pem
```
使用新的组合 CA 为新服务端证书签名：
```
sudo openssl x509 -req -in server-req.new.pem -days 365000 -CA ca-cert.pem -CAkey ca-key.pem -set_serial 01 -out server-cert.new.pem
```
之后配置 TiDB 使用新的服务端证书。
#### 3.更新客户端证书
生成新的客户端密钥和证书：

```
sudo openssl req -newkey rsa:2048 -days 365000 -nodes -keyout client-key.new.pem -out client-req.new.pem
sudo openssl rsa -in client-key.new.pem -out client-key.new.pem
```
注意：这里目标是替换密钥和证书为了保证在线用户不受影响，所以上面这个命令中填写的附加信息必须与已配置的 require subject 信息一致。
然后使用新的组合 CA 签名新客户端证书：

```
sudo openssl x509 -req -in client-req.new.pem -days 365000 -CA ca-cert.pem -CAkey ca-key.pem -set_serial 01 -out client-cert.new.pem
```
使用新的证书连接 TiDB：
```
mysql -utest -h0.0.0.0 -P4000 --ssl-cert /path/to/client-cert.new.pem --ssl-key /path/to/client-key.new.pem --ssl-ca /path/to/ca-cert.pem
```