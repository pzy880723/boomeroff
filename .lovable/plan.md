## 抵用券与活动系统重构方案

### 一、整体结构变化

```text
旧结构：voucher_types(模板) → vouchers(实例,绑定 share_token)
新结构：
  vouchers(抵用券=模板,带门槛规则) ──┬─→ voucher_claims(直接转发链接产生的领取/核销实例)
                                    └─→ activities(活动) → activity_applications(用户申请+自定义字段) → 审核 → 短信 → voucher_claims
```

废弃 `voucher_types` 表（保留迁移，不删数据）。

### 二、数据库改动（一个 migration）

**1. 改造 `vouchers` 表（变模板）**
- 新增字段：`threshold_type`（`'none'` 无门槛 / `'min_spend'` 满减）、`discount_amount`（抵扣金额）、`min_spend`（门槛金额，门槛模式必填）、`valid_days`（有效期天数）、`terms`（使用说明）、`active`（是否启用）
- 移除/弃用：`applicant_name`、`applicant_phone`、`screenshot_url`、`status`、`share_token`、`code` 这些"实例字段"——迁移到 `voucher_claims`
- 兼容策略：保留旧字段允许 NULL，新逻辑只读写新字段

**2. 新建 `voucher_claims`（核销实例）**
- `voucher_id`、`activity_application_id`（可空）、`code`（8 位唯一，复用 `gen_voucher_code()`）、`share_token`（uuid，免登录领取入口）
- `recipient_name`、`recipient_phone`、`recipient_extra`（jsonb，存活动自定义字段）
- `status`：`unclaimed` → `claimed` → `redeemed` / `expired` / `void`
- `claimed_at`、`redeemed_at`、`redeemed_by`、`expires_at`
- 来源标记：`source`（`'direct'` 直接转发 / `'activity'` 活动审核通过）

**3. 新建 `activities`（活动）**
- `name`、`description`、`cover_url`、`voucher_id`（关联模板）、`share_token`（公开申请入口）
- `form_fields` jsonb：动态字段定义（每项含 `key/label/type/required/options/placeholder`，type 支持 `text/phone/url/image/textarea/select`）
- `status`：`draft` / `active` / `closed`
- `created_by`、`starts_at`、`ends_at`、`max_applications`（可空）

**4. 新建 `activity_applications`（活动申请）**
- `activity_id`、`applicant_name`、`applicant_phone`（必填，用于发短信）、`form_data` jsonb（按 form_fields 收集）
- `status`：`pending` / `approved` / `rejected`
- `reviewed_by`、`reviewed_at`、`reject_reason`
- `voucher_claim_id`（审核通过后生成的 claim）
- `sms_sent_at`、`sms_error`

**5. 新建 `voucher_logs` 扩展**
- 已存在，增加 `claim_id`、`activity_id` 列以记录新流程

**RLS 与 GRANT**（关键点）
- `vouchers`、`activities`：管理员可写，所有员工可读（已存在权限 key `voucher.manage`）
- `voucher_claims`、`activity_applications`：仅服务端写入；普通用户走 edge function 公开接口
- 公开读取（凭 `share_token` 查询）一律通过 edge function 而非 RLS 暴露

### 三、Edge Functions

| 函数 | 鉴权 | 作用 |
|---|---|---|
| `voucher-claim-create` | 管理员 | 直接转发模式：管理员选模板 → 生成一条 `voucher_claims` → 返回 share_token |
| `voucher-claim-status` | 公开 | 凭 share_token 或 (code+phone) 查询 claim 状态 |
| `voucher-claim-accept` | 公开 | 用户在领取页填姓名/手机 → 把 claim 从 `unclaimed` 改为 `claimed` |
| `voucher-redeem` | 登录+`voucher.redeem` | 现有函数改造为操作 `voucher_claims`（按 code 或扫码 token） |
| `activity-apply` | 公开 | 凭 activity share_token 提交申请；按 form_fields 校验；图片字段走 base64 上传到 `voucher-screenshots` bucket |
| `activity-review` | 管理员 | 通过/拒绝；通过则生成 `voucher_claims` + 调短信函数 |
| `send-sms` | 内部 | 阿里云**或**腾讯云短信发送，签名+模板 ID 从 secrets 读取；返回结果写回 `sms_sent_at/sms_error` |

短信内容示例：`【店名】您申请的"小红书探店活动"已通过审核，点击领取专属优惠：https://app.com/u/claim/{token}` （短链 token 即 claim.share_token）

### 四、需要您准备的短信凭证（任选其一）

**阿里云**：`ALIYUN_SMS_ACCESS_KEY_ID`、`ALIYUN_SMS_ACCESS_KEY_SECRET`、`ALIYUN_SMS_SIGN_NAME`（已审核签名）、`ALIYUN_SMS_TEMPLATE_CODE`（已审核模板）

**腾讯云**：`TENCENT_SMS_SECRET_ID`、`TENCENT_SMS_SECRET_KEY`、`TENCENT_SMS_SDK_APP_ID`、`TENCENT_SMS_SIGN_NAME`、`TENCENT_SMS_TEMPLATE_ID`

实施时我会先建好基础设施，到调用短信那一步停下来请您把对应 secret 填入。模板变量约定 `{1}=活动名` `{2}=领取链接短码`。

### 五、前端页面

**管理员 / 店员（`/me/vouchers` 改造 + `/me/activities` 新增）**
- `VouchersMine.tsx` 改名职责：列出"抵用券（模板）"，新建按钮打开 `VoucherEditDialog`
  - 字段：名称、门槛类型 RadioGroup（无门槛 / 满减）、抵扣金额、（满减时）门槛金额、有效期天数、使用说明
  - 列表每条卡片：编辑、停用、"直接转发"按钮（生成 claim 并复制链接）、查看核销记录
- 新增 `MyActivities.tsx`：活动列表 + 新建活动
  - `ActivityEditDialog`：名称、描述、封面、选抵用券、动态字段编辑器（增删字段、设字段名/类型/是否必填）、生效时间
  - 详情页 `ActivityDetail.tsx`：申请列表（待审/通过/拒绝 Tab）、每条申请查看自定义字段+截图、通过/拒绝按钮、短信发送状态
- `Me.tsx` 入口新增"我的活动"

**Portal（管理员后台）**
- 删除"券类型管理"tab；改为"抵用券审核"已不再需要（直接转发模式无审核），保留为"活动审核"——管理员能看到所有活动的待审申请，集中处理

**公开页（免登录）**
- `/u/claim/:token`：用户领取抵用券页面（直接转发模式入口）。展示券面 → 填姓名+手机 → 显示二维码（含 redeem code）
- `/u/activity/:token`：活动申请页。展示活动信息 → 动态渲染 form_fields 表单 → 提交后展示"审核中" → 凭手机号可查询状态
- `/u/claim-status`：凭手机号或 code 查询状态（小工具页）
- 短信中链接直达 `/u/claim/:token`，已审核通过的 claim 会跳过表单直接展示二维码

**核销页（已有）**
- `/me/vouchers/redeem/:code` 改为对接 `voucher_claims`

### 六、技术细节

- `voucher_claims.code` 复用现有 `gen_voucher_code()` + trigger
- `voucher_claims.expires_at` 由 trigger 在 `claimed_at` 写入时按 `voucher.valid_days` 计算
- 动态表单字段在前端用一个统一 `<DynamicForm fields={...} />` 组件渲染；图片字段在 edge function 端做 base64 上传
- 短信失败不阻塞审核：审核通过先入库，再异步调 `send-sms`，失败把错误存进 `sms_error` 并在管理员后台显示"重发短信"按钮

### 七、不在本次范围

- 抵用券核销金额结算 / 收银台对接（仅状态变更）
- 微信小程序原生分享卡片（继续用 H5 链接）
- 短信营销/群发（仅事务性"审核通过"通知）

### 八、实施步骤

1. Migration：改造 `vouchers`，新建 `voucher_claims` / `activities` / `activity_applications`，加 GRANT/RLS/trigger
2. 删除/废弃旧 edge functions（`voucher-apply`、`voucher-review`、`voucher-status`）
3. 新建 7 个 edge functions
4. 前端：编辑器、列表、详情、动态表单组件
5. 公开页：claim / activity / status
6. 短信：等您选定阿里云或腾讯云后我请求对应 secrets，再写 `send-sms`

预计工作量：1 migration + 7 edge functions + 约 10 个前端文件改/新建。
