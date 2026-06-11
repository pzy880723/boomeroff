## 目标

让"新建活动"支持两种模式：
- **需要审核**（现有流程）：申请 → 管理员审核 → 通过后发短信领券
- **无需审核**（新）：扫码/打开活动链接 → 直接跳到抵用券领取页填写姓名+手机号 → 立即生成并领取

同时简化字段编辑 UI，并补全活动的增删改查 + 详情统计。

---

## 1. 数据库迁移

在 `activities` 表新增一列：

```text
requires_review boolean NOT NULL DEFAULT true
```

`activity_applications` 表保持不变；无需审核模式会写一条 `status='approved'` 的记录（便于在详情列表里统一展示），并立即生成 `voucher_claims` 行（`status='claimed'`），不发短信。

## 2. 新建/编辑活动 Dialog（`ActivityEditDialog.tsx`）

UI 改动：
- 顶部新增一个二选一开关组件："需要审核 / 无需审核"，默认"需要审核"。
- "申请字段"区块标题改为"**添加填写内容**"；底部说明文案保留"姓名、手机号默认必填，无需自定义"。
- 移除每个字段卡片下方的"字段键(英文)"输入框（图1 红框部分）。字段 `key` 改为自动生成：`field_{时间戳}` 或 `field_{i}`，对用户不可见。
- 同一弹窗复用为"编辑活动"：支持传入 `activityId` 进入编辑态，加载已有数据，保存改为 `update`。

新增字段时仍生成内部 `key`，但 UI 只显示"字段标题 / 类型 / 必填 / 删除"。

## 3. 我的活动列表（`ActivitiesMine.tsx`）

每张卡片右上角加一个"操作菜单"（更多图标），包含：
- 编辑（打开 ActivityEditDialog 编辑态）
- 删除（确认弹窗 → 删除 activities 行，级联 applications/claims 由数据库外键处理或前端提示）
- 复制活动链接（保留）

点击卡片主体仍跳转到详情。

## 4. 活动详情页（`ActivityDetail.tsx`）

顶部活动信息卡升级为完整详情：
- 活动名称（已在 PageHeader）
- 模式徽章：需要审核 / 无需审核
- 活动时间范围：`starts_at ~ ends_at`（无则显示"长期有效"）
- 创建时间
- 活动内容 / 描述
- 三个统计数字（卡片网格）：**已申请人数 / 已通过人数 / 已拒绝人数**
- 右上角两个按钮：**修改**（打开编辑弹窗） / **删除**（确认）
- 复制活动链接（保留）

下面的 Tabs 保留：
- 需要审核模式：保留三个 Tab（待审 / 通过 / 拒绝）+ 审核按钮
- 无需审核模式：只显示一个"已领取"列表 —— 列出**姓名 / 电话 / 核销状态**（"已领取" / "已核销"），数据来自 `activity_applications` join `voucher_claims.status`。隐藏审核按钮。

## 5. 公开活动页（`PublicActivity.tsx` + edge function）

`activity-public` 返回额外的 `requires_review` 字段。

- `requires_review=true`：保持现有 UI 与文案"审核通过后将通过短信通知您领取抵用券"。
- `requires_review=false`：
  - 提交成功后**不**显示"申请已提交"页，而是 `navigate` 到对应的抵用券领取页 `/u/c/{short_code}`，并让烟花动画在该页触发（复用现有领取页机制）。
  - 服务端 `activity-apply` 在该模式下：写入 `activity_applications`（`status='approved'`，`reviewed_at=now()`）→ 生成 `voucher_claims`（`status='claimed'`，`claimed_at=now()`，关联 application）→ 返回 `{ ok: true, short_code, requires_review: false }`，**不发短信**。
  - 前端用返回的 `short_code` 跳转。

## 6. 边缘函数改动汇总

- `activity-public`：select 多带 `requires_review`，返回中带出。
- `activity-apply`：根据 `activity.requires_review` 分支：
  - true：现有逻辑不变。
  - false：插入 application(approved) + voucher_claims(claimed)，返回 `short_code`。
- `activity-review`：保持不变（仅审核流使用）。
- 新增（前端调用）：删除活动直接走 supabase client `delete from activities where id=?`（RLS 已限制 created_by）。

## 技术细节

- `src/lib/voucher.ts` 的 `Activity` 类型加 `requires_review: boolean`。
- 详情统计直接对 `apps` 数组按 status 计数，不需要额外查询。
- 删除活动时由于存在外键 `activity_applications.activity_id`、`voucher_claims.activity_application_id`，迁移里同时把这两个外键改成 `ON DELETE CASCADE`，确保前端一键删除不会因外键约束失败。
- 编辑活动时 `voucher_id` 允许更换，但若已有 application 通过/已领取，则禁用更换（提示已有领取记录）。
- ActivityEditDialog 增加 prop `activityId?: string`；为空=新建，否则=编辑。

## 不在本次范围

- 不改抵用券模板编辑 UI。
- 不改核销扫码流程（已存在）。
- 不改无需审核模式下的短信逻辑（直接不发）。
