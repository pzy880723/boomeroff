## 「今日任务」每项加「去完成」跳转按钮

让没完成的每日任务多一个 CTA，点了直接跳到对应页面，关闭浮窗。

### 跳转映射

| 任务 | 路由 |
| --- | --- |
| `daily_first_scan` 完成 1 次识别 | `/scan` |
| `daily_3_scans` 完成 3 次识别 | `/scan` |
| `daily_quiz` 通过一次知识测试 | `/library`（官方知识库，店员从这里进 quiz） |
| `daily_post` 发一条中古圈帖子 | `/community` |

### 改动

只改两个文件，纯前端：

1. **`src/components/dashboard/TaskCenterCard.tsx`**
   - Props 加 `onNavigate: (path: string) => void`（沿用 FloatingDashboard 里现有的 `go` 模式：先关抽屉再跳）。
   - 每个 daily task：
     - **未完成**：右侧渲染主按钮「去完成 →」（点击 `onNavigate(map[t.key])`），灰色金额标签 `+N` 移到按钮内或左侧小字，避免和现在的灰 `+N` 占用同一位。
     - **已完成未领**：保持现在的金色「领 +N」按钮。
     - **已领**：保持「已领 +N」灰字。
   - 事件型 `pending` 列表按钮逻辑不变。

2. **`src/components/dashboard/FloatingDashboard.tsx`**
   - 把抽屉里现有的 `go` 函数（已经是 `onClose` + `setTimeout(navigate)` 模式）传进 `<TaskCenterCard onNavigate={go} />`。

### 不做的事

- 不改数据库 / RPC / hook 逻辑
- 不动事件型 `pending` 项（它们本就是被动产物，没有"去完成"概念）
- 不改胶囊角标或卡片样式总体结构

### 验收

1. 打开仪表盘 → 「完成 1 次识别」右侧有「去完成 →」。
2. 点击 → 抽屉关闭 → 跳到 `/scan`。
3. 当天扫一个商品 → 回到仪表盘，该任务变「领 +5」金色按钮。
4. 已领状态依然只显示灰字「已领 +5」，无按钮。
