## 排班双视图 + 多门店预留

### 一、数据库改动（migration）

新增 `shops` 表 + 把 `shop_id` 加到 `staff_profiles` / `shift_schedules` / `shop_shifts` / `shop_holidays` / `shop_kb_categories` / `shop_kb_entries`。

```text
shops            id, name, address, sort_order, active, created_at
```

- `staff_profiles.shop_id uuid` — 员工归属门店（一个员工归一家）
- `shift_schedules.shop_id uuid` — 排班所在门店
- 其它表的 `shop_id` 用于多门店时的范围隔离
- 自动建一条默认门店 "本店"，把现有 staff_profiles / shift_schedules 全部回填到该门店
- RLS：所有人可读 shops；admin 可写
- 给 `shift_schedules (shop_id, work_date)` 建索引

> 当前 UI 仍按"单门店"运转：用户和排班默认绑定到第一家 shop；后台可后续扩展添加门店与切换。本次先打基础 + 走通双视图。

### 二、/me/schedule 页面重构

把现有 `MySchedule.tsx` 从"周表格"改成 Tabs 架构：

```text
顶部 Tabs：[ 我的 ] [ 门店 ]
```

#### Tab 1 · 我的（近 30 天）
- 拉取 `shift_schedules` where `user_id = me` AND `work_date BETWEEN today AND today+29`
- 仅展示我有班的日期，按日期升序
- 每张卡片：
  - 左：日期 `11/14 周五` + 班次徽章（A/B/C 颜色 + 时间段）
  - 右：当天同店同日的其他同事 chips（不论班次），点击 chip 可看其班次时间 tooltip
- 顶部小结："未来 30 天 X 天上班 / Y 天休息"
- 空状态："近 30 天暂无排班"

#### Tab 2 · 门店（近 30 天折叠列表）
- 拉取我所在 shop 的 `shift_schedules` where `work_date BETWEEN today AND today+29`
- 每天一行 Accordion（默认折叠，今日默认展开）：
  - 折叠头：`11/14 周五` + 节假日标签（如有） + 在岗人数 `5 人`
  - 展开内容：按 A/B/C 班次分组，每组显示时间段 + 人员 chips；当天我自己高亮
- 节假日来源 `shop_holidays`，整天无排班且为节假日 → 显示"全员休 / 仅实习生"

### 三、新增 / 修改文件

- `supabase/migrations/...` — 新表 + 列 + 回填 + RLS
- `src/pages/MySchedule.tsx` — 改造为 Tabs 容器
- `src/components/me/MyScheduleList.tsx` — 我的 30 天列表
- `src/components/me/ShopScheduleList.tsx` — 门店 30 天折叠列表
- `src/components/me/ShiftBadgeRight.tsx` — 排班徽章已有，无需改（仍读今日/明日）
- `src/lib/scheduleUtils.ts` — 新增 `next30Days(today)` 工具

### 四、不做（本次）
- 不新增门店管理 UI（admin 后续在 /portal 增加 ShopManager）
- 不改 ShiftBadgeRight、SOP/QA、AI 排班逻辑
- 不影响 ScheduleManager 后台周视图（仍按单店运转，默认 shop_id）

### 五、技术细节
- 同店同事查询：先取我的 staff_profile.shop_id，缺失则取第一家 shop
- 30 天范围全部按 Asia/Shanghai 计算（沿用 scheduleUtils）
- 所有数据通过 RLS 受控；门店排班视图仅显示同 shop 数据
- 页面在 390px 视口测试折叠/展开手感
