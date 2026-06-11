## 目标

简化活动报名流程：保留报名表单，但去掉「需审核」选项与短信通知。用户扫码 → 填写表单 → 立即跳转抵用券领取页。

---

## 改动清单

### 1. 公开报名页 `src/pages/public/PublicActivity.tsx`
- 移除 `done` 状态分支（"申请已提交，待审核通过后将通过短信通知"）。
- 提交成功后总是 `navigate(/u/c/{short_code})`，不再判断 `requires_review`。
- 卡片文案 "通过审核可获" → "报名后可领"。

### 2. 报名 edge function `supabase/functions/activity-apply/index.ts`
- 删除 `requires_review` 分支：无论活动设置如何，统一走"直接审批 + 生成 voucher_claim + 返回 short_code"路径。
- 保留手机号去重逻辑（已领过则返回原 short_code + `already: true`）。
- 不再写入 `pending` 状态。

### 3. 活动新建/编辑 `src/components/voucher/ActivityEditDialog.tsx`
- 删掉「需要审核 / 无需审核」二选一卡片 UI 和 `requiresReview` state。
- 保存时固定 `requires_review: false`（数据库列保留，向后兼容旧数据，但 UI 不再暴露）。

### 4. 活动详情 `src/pages/ActivityDetail.tsx`
- 移除信息卡上的「需审核 / 免审核」Badge（148 行）。
- 统计卡（176-204 行）：始终显示「已领取 / 已核销」两格版式，移除 `requires_review ? ...` 三格分支。
- 列表区（207 行起）：移除 `requires_review` 三 Tab（待审/通过/拒绝）分支，始终显示"已领取列表"。其余审核按钮逻辑随之删除。

### 5. 我的活动列表 `src/pages/ActivitiesMine.tsx`
- 移除卡片上 `需审核 / 免审核` 文案（131 行）。

### 6. 不做的事
- **不动数据库**：`activities.requires_review` 列保留，仅默认/写入 `false`；`activity_applications` 状态机不变。
- **不动短信基建**：`send-sms`、腾讯云密钥保留，留给抵用券领取 OTP 等其它流程使用。
- **不动** `activity-review` edge function、`PublicClaim.tsx`、其它审核逻辑文件以外的页面。

---

## 验收

1. 创建活动 → 表单里看不到「是否审核」选项。
2. 扫码报名 → 提交后直接进入 `/u/c/:short_code` 抵用券页。
3. 同一手机号二次报名 → 跳回原 short_code，提示"您已领取过"。
4. 活动详情页只有"已领取 / 已核销"统计 + 已领取名单，无审核 Tab。
