## 活动时间限制 + 默认字段显示

### 1. 新建/编辑活动：强制活动时间
`ActivityEditDialog.tsx`
- 新增两个必填字段：**活动开始时间**（默认当前时间）和**活动结束时间**（默认空，必须晚于开始时间）。
- 使用 `<Input type="datetime-local">`（轻量，无需引入 datepicker）。
- 校验：保存时若结束时间 ≤ 开始时间 → toast 报错；两者都必填。
- 写入 `activities.starts_at` / `activities.ends_at`。
- 编辑时回填已有时间。

### 2. 默认字段（姓名 / 电话）显示
`ActivityEditDialog.tsx`
- 在「添加填写内容」列表最上方，渲染两条**固定的不可编辑/不可删除**默认项：
  - 姓名（文本，必填）
  - 电话（手机号，必填）
- 视觉上灰底 + 标 "默认"，不写入 `form_fields`（保持现有数据结构，避免污染存量数据）。
- 移除原来 "姓名、手机号默认必填,无需自定义" 的纯文字提示。

### 3. 活动详情页展示
`ActivityDetail.tsx`
- 「领取列表」每条记录目前已显示 `applicant_name` / `applicant_phone`（顶部一行），保留不变。
- 在信息卡的 "活动时间" 行格式升级为 `yyyy-MM-dd HH:mm ~ yyyy-MM-dd HH:mm`（带时分），让创建者能看到精确时间窗。
- 在「领取列表」上方新增一个简短的"收集字段"说明区，列出：姓名 / 电话 + 所有自定义字段名 —— 让管理员一眼看清这个活动收集了什么。

### 4. 公开报名页：活动未开始 / 已结束拦截
`PublicActivity.tsx` + `activity-apply` edge function
- 前端：若 `starts_at > now()` → 显示"活动尚未开始（X 月 X 日开始）"，隐藏表单；若 `ends_at < now()` → 显示"活动已结束"。
- 后端 `activity-apply/index.ts`：在现有 `ends_at` 校验旁，新增 `starts_at > now()` → 返回 "活动尚未开始"。
- `activity-public` 已经返回 `starts_at`，无需改。

### 技术细节
- 不动 `activities` 表结构（`starts_at` / `ends_at` 列已存在）。
- 不动 `form_fields` 数据结构，姓名/电话仍按现有方式（独立字段 `applicant_name` / `applicant_phone`）处理。
- 仅前端 + 1 个 edge function 改动，无数据库迁移。

### 涉及文件
- `src/components/voucher/ActivityEditDialog.tsx`
- `src/pages/ActivityDetail.tsx`
- `src/pages/public/PublicActivity.tsx`
- `supabase/functions/activity-apply/index.ts`
