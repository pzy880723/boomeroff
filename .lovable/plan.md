
## 一、为什么之前的备份都失败了（我查过 `backup_runs` 记录）

看下最近 4 次跑：

| 时间 | 结果 | 卡在哪里 |
|---|---|---|
| 6-29 11:57 | ❌ | `The schema must be one of the following: public, graphql_public` — 备份代码直接查 `storage.objects` 系统表，被 PostgREST 拒了 |
| 6-29 19:00（自动） | ❌ | 只推进到 19/58 张表，被 2 小时超时判死 |
| 6-30 19:00（自动） | ❌ | 只推进到 21/58 张表，同上 |
| 7-01 09:00（手动） | ⏳ | 还卡在 11/58 张表，页面一关就不动了 |

**三个根因：**

1. **每次调用只处理 1 张表**就返回，58 张表要 58 次调用才走完 → cron 一晚只触发 1 次，永远备不完。
2. **手动备份靠前端 setTimeout 续跑**，一旦你关掉 `/portal` 页面，循环立刻断，之前那条 "running" 就一直挂着，2 小时后被系统判死。
3. **图片/视频阶段用 `admin.schema("storage").from("objects")` 查表** — Lovable Cloud 的 PostgREST 明确禁止访问 `storage` schema，所以每次跑到图片视频阶段都会立刻报 schema 错。

结论：**从 6-29 到现在，没有一次真正成功过**。腾讯云桶里目前只有一堆"半成品"数据库快照，图片/视频一个都没备。

---

## 二、修复方案

### 1. 一次 tick 尽量多推进（`backup-all-to-cos/index.ts`）
- 数据库阶段：在 25 秒预算内循环 `dumpTable`，一次搞定所有小表 + 大表分页，直到超时或走完 58 张。
- 图片阶段：**弃用** `admin.schema("storage")`，改回文件里已经写好但没用的 `walkStorage()`（走 `storage.from(bucket).list()` 官方 API，不受 schema 限制）。用 bucket 顺序游标记录进度（`{ bucketIndex, prefixCursor }`），一 tick 处理 80 个文件。

### 2. 服务端自动续跑，不依赖前端
- 每个 tick 结束时如果 `phase !== "done"`，用 `EdgeRuntime.waitUntil(fetch(self))` 立刻自触发下一次调用。
- 前端页面关掉也不影响，函数自己一直跑到 done 或失败为止。
- 前端 `BackupPanel.tsx` 的 setTimeout 续跑逻辑保留作为保底。

### 3. 错误友好化
- schema/权限类错误映射成"备份程序权限不足，请联系开发者更新"。
- 单张表报错时继续跑下一张，最后汇总，不再一挂全挂。

### 4. 一次性把历史 "running" 挂单标记 failed（迁移一条 SQL）

---

## 三、你的备份存在腾讯云什么位置

**桶：** `lovable-backup-1257117127`　**地域：** `ap-shanghai`
**访问域名：** `https://lovable-backup-1257117127.cos.ap-shanghai.myqcloud.com`

```
桶根/
├── db-backups/                     ← 数据库备份
│   ├── daily/YYYY-MM-DD/tables/<表名>/part-000000.json.gz
│   │   （每天一份，每张表一个文件夹，大表按 200 行分包）
│   └── monthly/YYYY-MM-01/tables/…  ← 每月 1 号额外多存一份长期归档
│
└── storage-mirror/                 ← 图片 / 视频原文件
    ├── product-images/…            商品识别图
    ├── avatars/…                   用户头像
    ├── voucher-screenshots/…       券使用截图
    ├── activity-posters/…          活动海报
    └── marketing-videos/…          营销视频
```

**格式说明：** 每个 `.json.gz` 解压后是 UTF-8 JSON：

```json
{
  "backed_up_at": "2026-07-01T09:00:17Z",
  "format": "boomer-table-backup-v1",
  "table": "products",
  "from": 0,
  "rows": [ { …一行行原表数据… } ]
}
```

图片/视频文件是**原样存的**，扩展名 / MIME 不变，直接拿来能用。

---

## 四、别的 APP 怎么读取（3 种方式，按推荐度）

### 方式 A（推荐）：腾讯云 COS 官方 SDK
在腾讯云控制台新建一个**只读**子账号（比现在的 `lovable-backup-bot` 权限更小，只给 `GetObject` + `GetBucket`），把 SecretId/Key 配到你的新 APP 里，用官方 SDK：

- Node.js：`npm i cos-nodejs-sdk-v5`
- Python：`pip install cos-python-sdk-v5`
- Java/Go/PHP/iOS/Android/小程序 都有官方包 → https://cloud.tencent.com/document/product/436/6474

示例（Node）：
```js
const COS = require('cos-nodejs-sdk-v5');
const cos = new COS({ SecretId, SecretKey });
cos.getObject({
  Bucket: 'lovable-backup-1257117127',
  Region: 'ap-shanghai',
  Key: 'db-backups/daily/2026-07-01/tables/products/part-000000.json.gz',
}, (err, data) => { /* data.Body 是 gzip 后的 buffer，用 zlib.gunzip 解开就是 JSON */ });
```

### 方式 B：S3 兼容接口
COS 支持 AWS S3 协议，直接用 aws-sdk / boto3 也行：
- Endpoint: `https://cos.ap-shanghai.myqcloud.com`
- Region: `ap-shanghai`
- AK/SK 用腾讯云的 SecretId/SecretKey

### 方式 C：命令行 / 一次性下载
- `coscli`（腾讯云官方 CLI）：`coscli sync cos://lovable-backup-1257117127/db-backups ./local-backup`
- 或用图形化工具 **COSBrowser**（腾讯云出品，Mac/Windows/手机都有）直接浏览下载。

---

## 五、我会新增一份 `docs/backup-locations.md`
把上面第三、四节内容永久沉淀下来，方便你转给外部 APP 开发者。

---

**改动清单：**
- ✏️ `supabase/functions/backup-all-to-cos/index.ts` — 循环推进 + 自续跑 + 换回 walkStorage
- 🗄 一条迁移：把当前挂着的 running 记录标 failed 释放锁
- 📄 新增 `docs/backup-locations.md`
- （前端 `BackupPanel.tsx` 不动，保留兜底轮询）

要我按这个方案改吗？
