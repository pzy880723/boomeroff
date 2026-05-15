## 目标

把抽象的等级变成"看得见、够得着的小目标"。在浮窗仪表盘里新增一张「等级进度卡」，露出当前等级 + 进度条 + 距离下一级所需经验，并把今天可做的得经验动作摆出来，让店员一眼知道"再做什么就升级"。

## 改动范围（仅前端展示层）

只新增/修改一个组件，挂到 `FloatingDashboard` 的全屏抽屉内容区。无数据库、无 edge function、无新 hook：所需数据 (`totalExp / currentStreak / checkedToday / stats.weekScans`) 都已经在 `useDashboardData` 里。

### 1. 新组件 `src/components/dashboard/LevelProgressCard.tsx`

输入：`data: ReturnType<typeof useDashboardData>` + `navigate`。

布局（自上而下）：

- 头部一行：左侧 `Lv.X · {title}`（来自 `getLevelInfo`），右侧 `{totalExp} EXP`
- 进度条：用 `@/components/ui/progress`（已存在），值 = `progress * 100`
  - 满级时进度满，副标题展示"已达最高等级 · {title}"
  - 未满级副标题：`再获得 <b>{expForNext - expIntoLevel}</b> 经验升级到 Lv.{level+1}「{nextTitle}」`
- 「今天能做什么」一栏（横向 3 个 chip / 紧凑列表）：
  1. 每日签到 +3（连签解锁 +3/+10/+30 角标提示）  
     状态：`checkedToday` → 已完成 ✓；未完成 → 显示"去签到"，点击触发与 `TodayOpsCard` 相同的 `perform_check_in` RPC（直接 import supabase 调用，并 toast + `data.refresh()`）
  2. 识别商品入库 +5  
     状态：今日识别次数 = `data.stats.todayScans` 或退化为"本周 {weekScans}"；按钮"去识别"→ `navigate('/scan')`
  3. 通过个人知识测试 +15  
     按钮"去做题"→ `navigate('/library')`
- 底部一行小字链接："查看全部经验规则 →" → `navigate('/me')`（Me 页已有 `LevelCard` 完整规则列表）

文案规范：100% 中文，不出现"主播"。

### 2. 在 `FloatingDashboard.tsx` 抽屉内容区插入

位置：`ShiftHeroCard` 之下、`NotificationCard` 之上（紧跟在排班 Hero 后，让"今天的具体目标"与排班相邻）。

```text
今日标语
排班 Hero
等级进度  ← 新
系统通知
今日运营
今日学习
待办 / 同事动态
```

### 3. 视觉与一致性

- 复用 `Card p-4 border-border/50 shadow-sm rounded-2xl` 样式
- 进度条使用 `bg-primary` 填充，背景 `bg-muted`
- 图标：`Trophy` / `Sparkles`（lucide）
- 全部颜色走语义 token，不写死 hex

## 不做的事

- 不改数据库、不加新经验规则
- 不动 Me 页的 `LevelCard`（保留为完整规则页）
- 不在浮窗胶囊（折叠状态）显示等级，避免视觉拥挤；仅在抽屉打开时展示

## 验证

- 手动在 `/me` 路径打开浮窗，确认新卡显示且进度数值与 `LevelCard` 一致
- 未签到时点击"去签到"应签到成功并刷新 `checkedToday`
- 满级账号显示"已达最高等级"