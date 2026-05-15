# 仪表盘视觉与内容微调

仅改 `src/components/dashboard/FloatingDashboard.tsx`，4 处调整，不动数据层。

## 1. 配色对齐其他页面

参考 `AuthPage`：使用 `bg-gradient-surface` + `radial-gradient` 主辅色光晕，让仪表盘和登录页 / Me 页观感一致，而不是大面积纯白。

- 全屏容器：`bg-background` → `bg-gradient-surface relative`，并叠一层 `pointer-events-none opacity-40 [background:radial-gradient(circle_at_20%_10%,hsl(var(--accent)/0.15),transparent_40%),radial-gradient(circle_at_80%_90%,hsl(var(--primary)/0.12),transparent_40%)]`
- 卡片背景维持 `bg-card`，但 Hero 标语卡用 `from-accent/10 via-primary/5` 的渐变，与登录页强调色统一
- 底部"收起"渐变蒙层背景色同步替换为 surface 色

## 2. 顶部用品牌 Logo 替代"仪表盘"三字

- 移除 `<h2>仪表盘</h2>`
- 使用 `import logo from '@/assets/boomer-off-vintage-logo.png'`，渲染 `<img src={logo} className="h-8 w-auto object-contain" alt="BOOMER-OFF" />`
- 右侧仍保留 `日期 · 问候语,姓名` 小字
- 顶栏 padding 略增加呼吸感

## 3. 打气标语加标题"今日标语"

Hero 卡内增加一个小标题行：
```
[Sparkles] 今日标语        (右上角原 Sparkles 移除，改为标题左侧小图标)
今天给店员的金句正文…
```
- 标题：`text-[11px] font-semibold tracking-[0.15em] text-primary/80 uppercase` 风格的小标，中文用 `今日标语`
- 正文 quote 维持 `text-xl font-bold leading-snug`

## 4. 排班 Hero 同时展示今日 + 明日

`ShiftHeroCard` 改为左右两栏（mobile 下上下两栏）：
- 左：今日（沿用现有大色块 + 班次名 + 时间 + 同事头像；休息时显示"今日休息"）
- 右：明日（小一号：`shift.code` 小色块徽章 + 班次名 + 时间；休息时显示"明日休息 🌿"；无排班数据时显示"明日待排"）
- 数据来源：`data.todayShift` 和 `data.weekShifts[1]`（已是今天+1天）
- 整卡仍点击跳 `/me`；分隔用 `border-t md:border-t-0 md:border-l border-border/50`

布局示意：
```text
+------------------------------------------+
| [大色块 D] 早班 09:00-18:00              |
|            👥 2 位同事在岗               |
| ----------------------------------------|
| 明日  [N] 晚班 14:00-22:00              |
+------------------------------------------+
```

## 不变内容

- 浮标拖拽 / 吸附 / 每日自动打开 / zoom 动画 / 收起按钮
- `NotificationCard` / `TodayOpsCard` / `LearningCard` / `TodoActivityCard` 内部样式
- `useDashboardData` hook 不动

## 技术细节

- 文件改动范围：`FloatingDashboard.tsx` 中的 `DashboardFullscreen` 顶栏 + Hero quote 卡 + `ShiftHeroCard`，约 +60 / -30 行
- 需新增 import：`import logo from '@/assets/boomer-off-vintage-logo.png'`
- `bg-gradient-surface` 已在 `tailwind.config.ts` 中存在（登录页在用），无需新增 token
