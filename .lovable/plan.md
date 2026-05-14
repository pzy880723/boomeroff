# AI 智能排班规则升级

## 目标

把排班从「只按员工属性」升级到「时间维度 × 门店维度 × 个性化禁排规则」。
管理员可在 `/portal → 排班管理` 选择门店、设置规则，再由 AI 一键生成。

---

## 一、数据库新增/扩展（schema 变更）

### 1. 扩展 `staff_profiles`（员工属性）
- `allowed_shop_ids uuid[]`：员工可上班的门店列表（空 = 不限）。替代单一 `shop_id` 的硬绑定，用于跨店调度；保留 `shop_id` 作为「主门店」。
- `blocked_shifts text[]`：明确不排的班次代号（如 `['C']` = 不排晚班）。和现有 `preferred_shifts`（偏好）配合使用。
- `blocked_weekdays int[]`：固定每周哪几天不上（如 `[0,6]` = 周末不上）。比 `available_weekdays` 更直观，二者取交集。

### 2. 新表 `staff_day_offs`（个性化日期禁排）
| 字段 | 说明 |
|---|---|
| user_id | 员工 |
| off_date | 日期 |
| reason | 原因（请假/调休/培训…）|
| shop_id | 可选：仅限某门店不排，留空 = 全部门店 |
RLS：管理员可写，员工可读自己的。

### 3. 扩展 `shop_holidays`
- 已有 `shop_id` 字段，UI 加上门店选择（之前没暴露）。

### 4. 新表 `schedule_rules`（全局/门店级规则，可选高级）
- `shop_id` (nullable, 全局)
- `rule_type`: `min_per_shift` / `max_consecutive_days` / `forbid_back_to_back_late_early`
- `value jsonb`
> 这一项作为 V2，先放一个最常用的「连续上班最多 N 天」字段也可。

---

## 二、后台 UI 变更

### 1. 排班管理页 `ScheduleManager.tsx`
- 顶部新增 **门店切换器**（下拉），只显示该门店的班次/员工/排班。
- 现有按周表格不变，但 `addAssign` / `aiGenerate` 都带上 `shop_id`。
- AI 按钮旁新增「**排班规则**」按钮，打开侧边 Sheet 展示：
  - 该门店的班次概览
  - 节假日列表（可快速增删，绑定当前门店）
  - 全局规则（连续上班天数上限等）

### 2. 员工资料对话框 `StaffProfileDialog.tsx`
现有：可上班星期、偏好班次、每周上班天数。新增：
- **可上班门店**（多选 chip，从 `shops` 表）
- **不排班次**（多选 chip，与偏好班次互斥提示）
- **固定休息日**（周一~周日多选，等同 blocked_weekdays）
- 新增子区块「**禁排日期**」：列表 + 「+ 添加」，可选日期、可选「仅本门店」、原因
  - 写入 `staff_day_offs` 表

### 3. 班次设置面板 `ShiftSettingsPanel.tsx`
- 班次和节假日卡片各自加上「所属门店」标签和过滤器（已有 `shop_id` 列，只是没暴露）。

---

## 三、Edge Function: `generate-schedule` 升级

接收 `{ week_start, shop_id, overwrite }`。流程：
1. 查询本门店的：`shop_shifts` (active)、`shop_holidays`、本周 `shift_schedules`。
2. 查询符合条件的员工：`allowed_shop_ids` 包含当前门店或为空、且未 suspended。
3. 查询本周内每位员工的 `staff_day_offs`。
4. 组装 staff 对象，新增字段：`blocked_shifts`、`blocked_weekdays`、`day_offs`、`allowed_shops`。
5. 在 system prompt 增加规则：
   - 员工在 `blocked_shifts` 列表中的班次绝不排
   - 员工在 `blocked_weekdays` 或 `day_offs` 中的日期绝不排
   - 排班只允许在当前 `shop_id`，员工必须 allow 该门店
   - 「连续上班最多 N 天」（来自 schedule_rules 全局值，默认 6）
6. 写入 `shift_schedules` 时附带 `shop_id`。

---

## 四、前端 Me 页 `SchedulePanel.tsx` 微调
- 「我的」Tab 显示 `shop_id` 对应的门店名（多门店员工能看出当天在哪家上班）。
- 「门店」Tab 加门店切换（管理员/可见多店的员工才显示）。

---

## 五、技术细节

```text
staff_profiles
├─ shop_id (主门店, 已存在)
├─ allowed_shop_ids uuid[] (新, default '{}')
├─ blocked_shifts text[]   (新, default '{}')
└─ blocked_weekdays int[]  (新, default '{}')

staff_day_offs (新表)
├─ id, user_id, off_date, reason, shop_id (nullable), created_by, created_at
└─ unique(user_id, off_date, coalesce(shop_id, '00000000-...'))

shift_schedules (已有 shop_id, 仅前后端补传)
```

AI 工具调用 schema 增加约束说明，仍走 `submit_schedule` function-call 输出。

---

## 六、不做（明确范围外）

- 不做跨门店自动调剂（同一员工同一天被多门店争抢的冲突解决，目前以「员工每天最多 1 个班次」简单约束）。
- 不做轮班公平性历史回顾（夜班轮转），后续可基于 `shift_schedules` 历史扩展。
- 不引入新的第三方排班库，全部用现有 Lovable AI Gateway。

---

请确认后我会按顺序：① 写 migration ② 改两个 admin UI ③ 升级 edge function ④ 微调 Me 页。
