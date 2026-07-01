# 备份数据存放位置 & 外部 APP 读取指南

本项目每天凌晨会把**全部数据**（数据库表 + 图片视频原文件）备份到你的腾讯云 COS。
本文档告诉你东西存在哪、目录长啥样、其他 APP 怎么读。

---

## 一、腾讯云基本信息

| 项 | 值 |
|---|---|
| 桶名（Bucket） | `lovable-backup-1257117127` |
| 地域（Region） | `ap-shanghai`（华东-上海） |
| 访问域名 | `https://lovable-backup-1257117127.cos.ap-shanghai.myqcloud.com` |
| S3 兼容 Endpoint | `https://cos.ap-shanghai.myqcloud.com` |

---

## 二、桶内目录结构

```
桶根/
├── db-backups/
│   ├── daily/YYYY-MM-DD/
│   │   ├── tables/<表名>/part-000000.json.gz    ← 每张表按 200 行分包
│   │   ├── tables/<表名>/part-000001.json.gz
│   │   ├── ...
│   │   └── _manifest/<序号>-<桶名>.json.gz       ← 当天所有图片视频的清单
│   │
│   └── monthly/YYYY-MM-01/                       ← 每月 1 号额外多存一份长期归档
│       └── tables/<表名>/...
│
└── storage-mirror/                               ← 图片/视频原文件（原样存）
    ├── product-images/…                          商品识别图
    ├── avatars/…                                 用户头像
    ├── voucher-screenshots/…                     券使用截图
    ├── activity-posters/…                        活动海报
    └── marketing-videos/…                        营销视频
```

### 数据库文件格式

`.json.gz` 解压后是 UTF-8 JSON：

```json
{
  "backed_up_at": "2026-07-01T09:00:17Z",
  "format": "boomer-table-backup-v1",
  "table": "products",
  "from": 0,
  "rows": [ { …一行行原表数据… } ]
}
```

`from` 是分页起点，`part-000000` 对应 `from: 0`，`part-000001` 对应 `from: 200`，以此类推。恢复时按顺序合并 `rows` 即可。

### 图片视频

原文件、原扩展名、原 MIME，无压缩、无加密。可直接下载展示。

---

## 三、外部 APP 怎么读（3 种方式）

### 方式 A（推荐）：腾讯云 COS 官方 SDK

**先在腾讯云控制台建一个只读子账号**，只授予 `GetObject` + `GetBucket` 权限，桶范围限定 `lovable-backup-1257117127`。**不要复用**现在这个 `lovable-backup-bot`（它有写权限）。

SDK 列表：<https://cloud.tencent.com/document/product/436/6474>

- Node.js: `npm i cos-nodejs-sdk-v5`
- Python: `pip install cos-python-sdk-v5`
- Java / Go / PHP / iOS / Android / 小程序 都有官方包

**Node 示例**（读一张表）：

```js
const COS = require('cos-nodejs-sdk-v5');
const zlib = require('zlib');

const cos = new COS({
  SecretId: process.env.TENCENT_SID,
  SecretKey: process.env.TENCENT_SKEY,
});

cos.getObject({
  Bucket: 'lovable-backup-1257117127',
  Region: 'ap-shanghai',
  Key: 'db-backups/daily/2026-07-01/tables/products/part-000000.json.gz',
}, (err, data) => {
  if (err) throw err;
  const json = JSON.parse(zlib.gunzipSync(data.Body).toString('utf8'));
  console.log(json.rows.length, '行');
});
```

**Python 示例**：

```python
from qcloud_cos import CosConfig, CosS3Client
import gzip, json

client = CosS3Client(CosConfig(Region='ap-shanghai',
    SecretId='...', SecretKey='...'))
resp = client.get_object(Bucket='lovable-backup-1257117127',
    Key='db-backups/daily/2026-07-01/tables/products/part-000000.json.gz')
data = json.loads(gzip.decompress(resp['Body'].get_raw_stream().read()))
print(len(data['rows']))
```

### 方式 B：S3 兼容协议（aws-sdk / boto3）

COS 全面兼容 AWS S3 协议，直接用 AWS SDK 就行：

```python
import boto3
s3 = boto3.client('s3',
    endpoint_url='https://cos.ap-shanghai.myqcloud.com',
    region_name='ap-shanghai',
    aws_access_key_id='...',       # 腾讯云 SecretId
    aws_secret_access_key='...')   # 腾讯云 SecretKey
resp = s3.get_object(Bucket='lovable-backup-1257117127',
    Key='db-backups/daily/2026-07-01/tables/products/part-000000.json.gz')
```

### 方式 C：命令行 / 图形化工具

- **coscli**（腾讯云官方 CLI）：
  ```bash
  coscli sync cos://lovable-backup-1257117127/db-backups ./local-backup
  ```
- **COSBrowser**（Mac / Windows / iOS / Android）：图形化浏览、下载。

---

## 四、完整还原一天的数据库

```bash
# 1. 下载当天全部表
coscli sync cos://lovable-backup-1257117127/db-backups/daily/2026-07-01/tables ./restore

# 2. 遍历每个 <表名>/part-*.json.gz，按 from 排序，合并 rows 数组
# 3. 逐表插回你自己的数据库
```

一段最小的 Node 合并脚本：

```js
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const root = './restore';
for (const table of fs.readdirSync(root)) {
  const parts = fs.readdirSync(path.join(root, table))
    .filter(f => f.endsWith('.json.gz')).sort();
  const rows = [];
  for (const p of parts) {
    const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, table, p))));
    rows.push(...j.rows);
  }
  fs.writeFileSync(`./restore/${table}.json`, JSON.stringify(rows));
  console.log(table, rows.length);
}
```

---

## 五、备注

- 备份**每天自动跑一次**（凌晨 3–4 点上海时间），也可以在 `/portal` → 数据备份点 "立即备份" 手动触发。
- 图片视频用**增量镜像**：相同大小的文件不会重复上传，第二天只备新增的。
- 目前不包含 `auth.users` 等系统表（Lovable Cloud 托管，不允许导出）。用户 ID 在 `profiles`、`user_roles` 里保留了，恢复时可以关联。
