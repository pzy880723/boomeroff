## 目标

活动审核通过后，给申请人发**一条无变量的通知短信**，引导到固定网址 `ai.boomeroff.com/q`；申请人**输入申请时填写的手机号即可领取优惠券**，全程免登录。

---

## 现状梳理

数据库与 Edge Function 大部分已就绪，无需重新搭建：

- `activities` / `activity_applications`（含 `sms_sent_at`、`sms_error`、`voucher_claim_id`）
- `voucher_claims`（含 `recipient_phone`、`short_code`、`status`、`expires_at`、`claimed_at`）
- Edge Functions：`activity-apply`、`activity-review`、`activity-public`、`voucher-claim-*`、`send-sms`
- 公开页面：`/u/activity/:shareToken`（申请页）、`/u/claim/:shareToken`、`/u/c/:short`（已有领取页）

需要新增/调整的只是**最后一公里**：审核通过时发什么短信、博主从哪个入口进、怎么按手机号找到自己的券。

---

## 短信文案（最终定版）

签名：`【宝暮上海品牌管理】`（11 字）
正文：`恭喜通过探店活动申请！请访问 ai.boomeroff.com/q 领取您的专属优惠券`
总长约 42 字，单条短信内。短信类型选**通知短信**，无变量，提交腾讯云审核即可。

---

## 实施步骤

### 1. 新增公开领取页 `/q`（落地页）

新文件 `src/pages/public/PublicClaimByPhone.tsx`，路由 `/q`（不在 `/u` 下，路径越短越省短信字数）：

- 顶部：品牌 Logo + 标题"领取您的专属优惠券"
- 表单：手机号输入框（仅 11 位中国手机号，自动校验） + 图形/简单防刷（先不上，按用户答复"只输手机号即可"）
- 点击"领取"→ 调用新 Edge Function `voucher-claim-by-phone`
- 成功 → 跳转 `/u/c/:short_code` 已有领取详情页（复用现有 UI 展示券码、二维码、有效期）
- 失败 → 友好错误：未找到/已领取/已过期/已被核销

App.tsx 新增 `<Route path="/q" element={<PublicClaimByPhone />} />`。

### 2. 新建 Edge Function `voucher-claim-by-phone`

`supabase/functions/voucher-claim-by-phone/index.ts`，公开调用（`verify_jwt = false` 不需手动设）。

逻辑：

1. 入参校验：`phone` 字段，正则 `^1[3-9]\d{9}$`
2. 用 service-role client 查 `voucher_claims`：
   ```
   WHERE recipient_phone = :phone
     AND status IN ('unclaimed','claimed')   -- 未核销
     AND (expires_at IS NULL OR expires_at > now())
   ORDER BY created_at DESC
   LIMIT 1
   ```
3. 命中后：
   - 若 `claimed_at IS NULL`：更新 `claimed_at = now()`、`status = 'claimed'`（保留 short_code 以供再次访问）
   - 返回 `{ ok: true, short_code }`
4. 未命中：
   - 区分"未找到任何申请记录" vs "已被核销"，给出对应文案
5. 加简单速率限制：同一 IP 60 秒内最多 5 次（用 `guest_daily_usage` 表或内存计数都行；先用 `guest_daily_usage` 复用）

### 3. 调整审核通过逻辑（`activity-review` edge function）

审核通过时已经在创建 `voucher_claim`，只需把发出去的短信改为新文案 + 新链接：

- 移除原来的 OTP/带 token 短链逻辑
- 调用 `send-sms`，模板 ID 改为腾讯审核通过的"活动报名通知"模板 ID
- 由于通知短信无变量，`templateParam` 传空数组 `[]`
- 把审核结果写回 `activity_applications.sms_sent_at` / `sms_error`

需要新增的 Secret：`TENCENT_SMS_NOTIFY_TEMPLATE_ID`（区别于现有的 `TENCENT_SMS_OTP_TEMPLATE_ID`）。在腾讯云审核通过后让用户填入。

### 4. 域名 `ai.boomeroff.com`

短信里写的是 `ai.boomeroff.com/q`。两条路：

- **方案 a（推荐）**：用户在 Lovable 项目里把 `ai.boomeroff.com` 设为自定义域名，路由 `/q` 即生效
- **方案 b（过渡）**：先用现有 `boomeroff.lovable.app/q`，等自定义域名接好再改腾讯模板

模板里写的域名不可改（改了要重审），所以**短信模板提交前必须先把 `ai.boomeroff.com` 接好**。这是用户需要在控制台手动操作的一步。

### 5. 兼容/清理

- 旧的 `/u/claim/:shareToken` 和 `/u/c/:short` 保留，作为审核员手动发链接、或者老数据兼容用
- `voucher-claim-send-otp` / `voucher-claim-accept` 保留不删——后续如果想做"OTP 二次校验"还能复用

---

## 安全说明（坦白讲给用户）

只凭手机号领券的风险点：

1. 别人猜到手机号 → 能领。缓解：手机号本身是个 11 位空间，且要"刚通过审核"才有效，对方还得猜中是哪个活动
2. 同一手机号多次申请同一活动 → 只发一张券；多个不同活动 → 各发一张，互不冲突
3. 速率限制 + 单券一次性领取后状态变 `claimed`，再访问只展示已领取的券码

如果后续发现被刷，可以一键开启二次校验（在落地页加"申请时填写的姓名末字"或"图形验证码"），改动只在 `PublicClaimByPhone.tsx` + Edge Function 内，对短信文案零影响。

---

## 用户需要手动做的事

1. 在腾讯云控制台用上面定稿的文案提交**通知短信模板**审核
2. 审核通过后，把新模板 ID 告诉我，我帮你存到 `TENCENT_SMS_NOTIFY_TEMPLATE_ID`
3. 在 Lovable 项目里把 `ai.boomeroff.com` 配置为自定义域名（DNS CNAME 到 Lovable）

我这边可以先把代码（落地页 + edge function + 审核逻辑改造）做好，等你拿到模板 ID 和域名就能直接上线。
