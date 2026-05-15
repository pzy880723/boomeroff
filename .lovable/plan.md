## 目标
为 ScheduleManager 增加 4 项排班能力：AI 不覆盖手动、员工色块、周 5 天上限强制、班次互换。

## 1. AI 排班不覆盖手动
- 前端 `aiGenerate()`：调用 edge function 时改为 `overwrite: false`，并提示"AI 仅排空缺日子"。
- `generate-schedule/index.ts`：
  - `overwrite=false` 时不再 delete 旧排班；
  - 读取本周已有排班（含 source=manual / ai），构造 `existing` 传给 AI（系统提示："已被占用的 user×date 不要再排"），并在结果回写时跳过任何已存在 user+date；
  - upsert 改为 insert（忽略冲突），避免覆盖手动；
  - 同时把"每人本周 ≤ 5 天"硬约束（含已存在天数）加入 prompt 与回写校验。

## 2. 每人默认色块
- `src/lib/scheduleUtils.ts` 新增 `colorForUser(userId)`：根据 user_id hash 选择固定色板（10 个 HSL 语义友好的浅底+深字组合，定义在 utils 内部，不写死 tailwind 颜色，使用内联 style 给 background/color）。
- `ScheduleManager.tsx` 渲染排班 chip 时，用该色作为背景；AI 排班保留右上角小角标或边框（如黄色 ring）以区分，但底色仍按人员走。
- "员工排班属性"区域的按钮也带同色小圆点，便于对照。

## 3. 周 5 天上限强制
- 沿用 `staff_profiles.max_per_week`（默认 5），把它视为硬上限：
  - 前端 `validateAssign` 中"超出上限"由 warning 改为 **hard block**：直接 toast.error 并 return，不再弹 confirm 强制。
  - cell 的"+"候选列表 `candidates` 过滤掉本周已排满 max_per_week 的员工（显示为灰色禁用项更直观）。
  - AI prompt 把第 6 条硬约束措辞改为绝不超过；回写时统计每人本周天数，超额条目直接丢弃。

## 4. 换班功能
- 工具栏新增"换班"按钮（`ArrowLeftRight` 图标）。点击进入 swap 模式：
  - 状态：`swapMode: boolean`、`swapFirst: Sched | null`。
  - swap 模式下，cell 中的人员 chip 变为可点（不再显示 X 删除）；点击第一个选中并高亮，点击第二个弹 confirm 后调用 swap。
  - swap 实现：交换两条记录的 `user_id`（保持原 date+shift_code 不变是真正的"班次互换"）。两条 update：A.user_id=B.user_id, B.user_id=A.user_id；本地 `setScheds` 同步。
  - 校验：互换后双方都需通过 validateAssign（available_weekdays / blocked_shifts / day_offs / max_per_week —— 因为只是换人不会改变各自周总天数，max 通常 ok），若违规弹 confirm 是否强制。
  - 再点"换班"按钮或 ESC 退出 swap 模式；UI 上 banner 提示当前模式。

## 不改动
- 数据库 schema、RLS、权限、其他 tab；StaffProfileDialog；ai 生成函数权限校验逻辑。

## 文件
- `supabase/functions/generate-schedule/index.ts`
- `src/lib/scheduleUtils.ts`
- `src/components/admin/ScheduleManager.tsx`
