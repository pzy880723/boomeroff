## 排查结论

我用 `13917915095` 实际查了一下数据库 + 后端函数：

- `activity_applications`：李暖暖这条已经是 `approved`，并且关联了 `voucher_claim_id = 1fe9b14e…`。
- `voucher_claims`：对应的券 `short_code = 6M7EUC`，`status = claimed`，没核销也没过期。
- 直接调 `voucher-claim-by-phone` 函数返回 `{ ok: true, short_code: "6M7EUC" }`，公开页 `/q` 输入手机号是能查到的。

**所以券其实存在、能领，问题出在后台 UI**：

> 在「活动详情 → 报名列表」（截图那一页）里，每条报名只显示状态徽章和「发布确认」按钮，**没有任何入口能直接看到这张券、复制领取链接或转发给客户**。
> 客户说"找不到券"时，店员也只能口头让她去 `/q` 自己查 —— 体验断了。

## 修复方案（只动前端 UI，不改数据/后端）

### 1. `src/pages/ActivityDetail.tsx` — 每条报名卡新增"券"入口

在 `app.publish_confirmed` 按钮旁边、且 `app.status === 'approved' && app.voucher_claim_id` 时，加一组小按钮：

- **「复制领取链接」**：`navigator.clipboard.writeText(buildClaimShareUrl(short_code))`，toast 成功；
- **「查看券」**：`navigate('/me/vouchers/share/' + voucher_claim_id)`，跳到已有的 `VoucherSharePoster` 页（带二维码 + 短链 + 海报）。

为了拿到 `short_code`，把现有的 `apps` 查询里 `voucher_claim:voucher_claims(...)` 字段补上 `short_code, share_token, status`（找到 `loadApps` 里的 select 语句加字段即可）。

被拒 / 待审核的报名不显示这两个按钮。

### 2. `src/components/voucher/VoucherDetailDialog.tsx` — 列表加搜索框

顺手在 50 条领取记录上方加一个手机号/姓名搜索框（纯前端 filter），方便店员按手机号定位某位客户的券，避免以后再次"找不到"。

### 3. 兜底文案

如果某条 `approved` 的报名 `voucher_claim_id` 为空（历史脏数据），按钮文案显示「补发券」，点击调用现有 `voucher-claim-create` 函数生成一条 claim 并回写到 `activity_applications.voucher_claim_id`。本次李暖暖这条不需要走这条路径，但可避免类似 case。

## 技术细节

- `buildClaimShareUrl` 已存在于 `src/lib/voucher.ts`，直接复用。
- `/me/vouchers/share/:claimId`（`VoucherSharePoster`）已存在，能展示二维码 + 短链。
- 不改任何 RLS、edge function、表结构。
- 校验改完之后用 tsgo 跑一次类型即可。

完成后店员在那张报名卡上一键就能把券发给客户，再也不会出现"在后台找不到她的券"的情况。
