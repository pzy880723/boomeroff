# 抵用券核销系统

## 业务流程

```
管理员创建券类型 (/portal · 券类型管理)
        ↓
店员/管理员 在「我的」新建抵用券 → 选择券类型 → 生成专属链接
        ↓ 转发
客户(免登录) 打开链接 → 填写 姓名 / 电话 / 主页截图 → 提交申请
        ↓
管理员在 /portal「抵用券审核」查看 → 通过/拒绝
        ↓ 通过
客户领券页自动显示 二维码 + 券编号 (凭手机号或券码查询)
        ↓ 到店
店员在「我的 · 核销」扫码 → 登录态确认 → 标记已核销
        ↓
客户端实时同步状态为「已核销」+ 后台留记录
```

## 数据库

新增 4 张表（全部加 RLS + GRANT）：

- **`voucher_types`** — 券类型字典  
  字段：name / description / face_value (numeric) / valid_days (int) / terms (text) / active (bool)  
  读：authenticated + anon (领券页要看)；写：admin

- **`vouchers`** — 抵用券实例（一张实物券）  
  字段：code (短码 8 位唯一)、type_id、created_by、shop_id、note、share_token (uuid，用于公开链接)、status (`pending_apply` → 待客户申请 / `pending_review` → 待审核 / `approved` → 已发放 / `rejected` / `redeemed` → 已核销 / `expired`)、applicant_name / applicant_phone / applicant_screenshot_url、approved_by / approved_at、redeemed_by / redeemed_at、expires_at  
  读：店员/管理员看自己创建的 + admin 全看；公开领券页通过 edge function 凭 share_token 读；写：店员/管理员创建，admin 改状态

- **`voucher_logs`** — 操作流水（创建/申请/审核/核销）  
  读：admin；写：触发器或 edge function

- **存储桶 `voucher-screenshots`** — 公开桶，存客户上传的主页截图  
  写策略：通过 edge function 上传（无需登录），路径含 share_token

## 后端 Edge Functions（免登录入口）

- `voucher-apply` — 公开。入参 share_token + 姓名/电话 + 截图(base64 或预签名上传)。校验券处于 `pending_apply`，写入申请字段，状态置 `pending_review`。
- `voucher-status` — 公开。凭 share_token 或 (code + phone) 查询券的当前状态、二维码内容、券类型。
- `voucher-redeem` — 需登录(店员/管理员)。入参 redeem_token (二维码内容)，校验状态 `approved` + 未过期，置 `redeemed`，记录 redeemed_by/at。
- 核销 token：用 vouchers.code + 一个 redeem_secret 拼短签名，二维码内容 = `https://<app>/u/voucher/<code>?t=<sig>`，登录态店员扫到即跳确认页。

## 前端

### /portal 新增两个 Tab
1. **券类型管理** — CRUD `voucher_types`
2. **抵用券审核** — 列表（按状态过滤），点开看申请人信息+截图 → 通过/拒绝；也能看核销状态、撤销、导出

### 「我的」页新增模块「抵用券」
- 入口卡片：`抵用券` → 进入 `/me/vouchers`
- 列表：我创建的所有券，按状态分组（待申请/待审核/已发放/已核销/已过期）
- 「新建抵用券」按钮 → 弹窗：选券类型、备注、(可选)预填客户信息 → 创建后展示 **分享链接 + 复制按钮 + 微信/系统分享**
- 「扫码核销」按钮 → 打开摄像头扫码（复用现有 camera hook）→ 跳到 `/me/vouchers/redeem/:code?t=...` 确认页
- 点开任一券：看详情 + 申请人信息 + 二维码（仅 approved 状态显示）+ 核销记录

### 公开领券页 `/u/voucher/:shareToken`
- 未提交：表单（姓名 / 手机号 / 主页截图上传），提交后调用 `voucher-apply`
- 待审核：显示「申请已提交，正在审核」+ 凭手机号自动轮询状态
- 已通过：大幅展示 二维码 + 券编号 + 面额 + 有效期 + 使用说明 + 「保存图片」
- 已核销：显示「已核销 · 核销时间」灰色态
- 已拒绝/过期：对应提示

### 实时同步
- 客户端领券页订阅 `vouchers` 表 realtime（按 share_token 过滤）→ 审核通过/核销后立刻刷新
- 「我的 · 抵用券」列表同样订阅

## 路由新增
- `/me/vouchers` — 我的券列表
- `/me/vouchers/new` — 新建（或弹窗）
- `/me/vouchers/redeem/:code` — 扫码后的确认核销页（登录态）
- `/u/voucher/:shareToken` — 公开领券/状态页（PublicLayout 下）

## 安全要点
- 公开 edge function 用 share_token (uuid v4) 做凭据，不暴露内部 id
- 截图上传走 edge function 服务端转存，避免直接给 anon 写 storage 权限
- 核销二维码包含 HMAC 签名 (`crypto.subtle` + 服务端 secret)，防伪造
- 手机号查询带速率限制（per-IP）
- `redeem` 操作必须验证调用者有 `voucher.redeem` 权限（在 app_permissions 里新增）

## 不做（本期）
- 不做客户端账户体系（完全免登录）
- 不做支付/核销金额抵扣计算（只标记状态，金额仅展示）
- 不做批量发券（一次一张，转发即可复用）

## 估算改动
- 1 个迁移（4 表 + RLS + GRANT + storage bucket + 2 个新权限）
- 3 个 edge functions
- 6~8 个新前端文件（VouchersPanel、NewVoucherDialog、RedeemPage、PublicVoucherPage、PortalVoucherTypes、PortalVoucherReview 等）
- 路由 + Me 页入口接线
