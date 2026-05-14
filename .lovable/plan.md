
## 目标
将 Me 页的「我的排班」从默认展开改为默认收起，收起态高度与「每日打卡 / 等级」卡片相当，点击展开才显示完整 Tabs 内容。

## 改造范围
仅修改 `src/components/me/SchedulePanel.tsx`，不改动 `MyScheduleList` / `ShopScheduleList` 内部逻辑。

## 收起态设计（约 72–88px 高，对齐打卡/等级卡片）

布局：单行卡片，左图标 + 中部摘要 + 右展开箭头

```text
┌──────────────────────────────────────────────────┐
│ 📅  我的排班                            今日 早班 │
│     未来30天 上班18天 · 下一班 明天 中班    ▼   │
└──────────────────────────────────────────────────┘
```

要点：
- 标题行：日历图标 + "我的排班"，右侧用 Badge 显示「今日班次」（如 `早 09:00-13:00`），无班则显示「今日休息」
- 副行：小字摘要 = `未来30天 · 上班 N 天` + `下一班：{日期+班次代码}`（无则「近期无排班」）
- 整卡可点击 → 展开；右侧 ChevronDown/Up 箭头随状态旋转
- 高度通过 `p-4` + 两行文本控制，与 `CheckInCard` / `LevelCard` 视觉对齐

## 展开态
- 在同一卡片内向下展开，渲染现有 Tabs（我的 / 门店）
- 使用 Radix `Collapsible`（项目已有 `@/components/ui/collapsible`）做平滑展开/收起
- 展开后内容与现状一致

## 数据获取
- 收起态需要「今日班次 + 未来30天计数 + 下一班」三个摘要值
- 方案：`SchedulePanel` 自身做一个轻量 query（只查当前用户 `shift_schedules` 未来30天 + `shop_shifts` 元数据），用于摘要展示
- 展开后 `MyScheduleList` 仍按原逻辑独立加载完整列表（其内部 useEffect 已存在），首次展开时触发，避免未展开就拉同店全量数据
- 可选优化：用 `mountOnExpand` 模式 —— Tabs 内容仅在 `open === true` 时挂载，进一步减少初始请求

## 交互细节
- 默认 `open = false`
- 点击整张头部区域切换；箭头 `transition-transform rotate-180`
- 收起时不渲染 Tabs，避免子组件请求
- 加载摘要时显示骨架文字「加载中…」

## 不改动
- `MyScheduleList.tsx`、`ShopScheduleList.tsx`
- `Me.tsx` 中 `<SchedulePanel />` 的位置
- `/me/schedule` 路由（已移除）
