## 改动概览

涉及 3 个文件，不动数据库：
- `src/hooks/useDashboardData.ts` — 同事查询逻辑 + 真实姓名 + 门店名
- `src/components/dashboard/SchedulePanel.tsx` — 仪表盘排班卡片展示
- `src/components/me/SchedulePanel.tsx` — "我的"页排班面板重做（去 Tab）

`src/components/me/MyScheduleList.tsx` 和 `ShopScheduleList.tsx` 会被弃用（暂保留文件，新组件不再引用，确认无误后可删）。`src/pages/MySchedule.tsx` 路由已删除，无需处理。

---

## 1. 仪表盘"同班同事" → "今日同店"

**问题：** 当前只查询「同班次 + 同门店 + 排除自己」的同事，A 班用户看不到 A 班其他人，且只显示 `profiles.display_name`（注册名）。

**改法（`useDashboardData.ts` 同事查询块 + `DashColleague` 类型）：**
- 查询条件改为「同门店 + 今日 + 排除自己」，去掉 `shift_code` 过滤，**包含所有班次**的同事
- 每位同事额外携带 `shift_code` 字段，便于 UI 显示班次小色块
- 姓名优先用 `staff_profiles.real_name`，回退到 `profiles.display_name`，最后回退到「店员」
- 顺便取出当前用户所在门店的 `shops.name`，挂在 `DashData.shopName` 上

**UI 调整（`dashboard/SchedulePanel.tsx`）：**
- 顶部「今日班次」卡：在班次时间右侧加一个 `MapPin` + 门店名小标签
- 「同班同事」标题改为「今日在岗」，每个头像下方除了姓名再加一个班次色块（A/B/C…），方便一眼看到谁在哪个班
- 文案 `${peers.length} 位同事在岗` 保持

---

## 2. "我的"页排班面板重做

**目标：** 今日 / 明日大字突出 + 30 天紧凑列表，去掉门店 Tab 也去掉我的 Tab。

**新结构（`me/SchedulePanel.tsx` 重写）：**

```text
┌─ 卡片：📅 我的排班          [门店名 · 30天上班 N 天]
│
│  ┌────────── 今日 ──────────┐  ┌──────── 明日 ────────┐
│  │ [A]  09:00–18:00         │  │ [休]  休息            │
│  │  早班 · 同店 X 人在岗     │  │  —                   │
│  └──────────────────────────┘  └──────────────────────┘
│
│  ── 未来 30 天 ─────────  [收起 ▼]
│  11/18 周二  [A] 09:00–18:00  同班：李四、王五
│  11/19 周三  休
│  11/20 周四  [B] 13:00–22:00  同班：—
│  …(默认显示前 7 天，点击"查看更多"展开全部)
└────────────────────────────────────────────────────────
```

实现要点：
- 一次查询：30 天内自己排班 + 同店全部排班 + shifts 字典 + staff_profiles.real_name + 门店名
- 「今日」「明日」两张并排卡片，休息日显示「休息」+ 灰底，避免看起来像没数据
- 30 天列表每行一天：日期 / 星期 / 班次色块 / 时段 / 同班同事姓名（取 real_name）
- 列表默认展开 7 天 + "查看更多"按钮，避免一打开就很长
- 完全移除 Tabs / 门店折叠面板，`MyScheduleList` / `ShopScheduleList` 不再被引用

---

## 3. 顺手修复 / 建议

- **门店 Tab 重复班次原因（确认弃用前记录一下）：** 旧 `ShopScheduleList` 按 `shifts.map` 嵌套渲染，但如果一位员工被同时排进多个 `shift_code`，他会在多个班次区块里都出现 —— 新结构按"每人一行"组织，从根上避免。
- **建议加一个「请假/调班」入口（可选，不在本次范围）：** 今日卡右上角放一个小按钮跳转到管理员可见的调班申请，先留位置不实现，等你确认再做。
- **姓名口径统一：** 所有排班相关位置统一走 `real_name ?? display_name ?? '店员'`，避免出现 email 前缀这种"注册名"。

---

## 技术细节

- 类型变更：`DashColleague` 增加 `shift_code: string`；`DashData` 增加 `shopName: string | null`
- 缓存 key 不变（仍按 `user.id`），新字段会被自然纳入 `dashCache`
- 查询次数不增加：今日同事查询本来就跑一次，仅去掉 `eq('shift_code', …)` 过滤；门店名在已有的 staff_profiles 查询之后追加一次 `shops.select('name')`（命中缓存后续走缓存）
- 新 `me/SchedulePanel.tsx` 总查询数：`staff_profiles`+`shops`+`shift_schedules(self)`+`shift_schedules(shop)`+`shop_shifts`+`profiles`+`staff_profiles(peers)` 共 7 次 Promise.all，和现状 Tab 切换时累计一致甚至更少
