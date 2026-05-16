## 问题

当前仪表盘用了独立的冷色深蓝 `#0f1320 → #1a1f33` + 青色高光，跟全站的暖色复古（米白底 / 浓缩咖啡棕 `--primary` / 古铜金 `--accent`）完全脱节，戴在 Me 页里像两个 App。

## 方案：复用现有 design tokens，不再自造冷色

### 1. 重做 `.dashboard-deep-surface`（src/index.css）

从冷蓝改成深咖暖色，全部走 HSL token，亮/暗模式自动跟随：

```css
.dashboard-deep-surface {
  background:
    linear-gradient(180deg,
      hsl(25 18% 10%) 0%,
      hsl(25 16% 13%) 60%,
      hsl(28 18% 16%) 100%);
  color: hsl(var(--primary-foreground));
}
.dashboard-deep-surface::before {
  background:
    radial-gradient(circle at 18% 8%, hsl(var(--accent) / 0.18), transparent 45%),
    radial-gradient(circle at 88% 92%, hsl(var(--primary-glow) / 0.16), transparent 50%);
}
```

效果：底色变成深咖啡，高光来自品牌古铜金 + 浓缩咖啡暖光，跟首页/我的页同源。

### 2. 卡片描边、文字、分隔线统一换 token

把仪表盘内 5 个 Panel + `SectionCard` 中所有写死的 `white/8`、`white/[0.04]`、`#e8ebf2`、`text-white/60` 之类，全部换成：

- 卡片底：`bg-[hsl(var(--accent)/0.05)]`，描边 `border-[hsl(var(--accent)/0.18)]`
- 内发光：`shadow-[inset_0_1px_0_hsl(var(--accent)/0.12)]`
- 主文字：`text-[hsl(var(--primary-foreground))]`
- 次文字：`text-[hsl(var(--primary-foreground)/0.65)]`
- 分隔线：`border-[hsl(var(--accent)/0.15)]`

### 3. 强调色全部回到品牌古铜金

- 进度条、Lv 徽章、Tab 高亮、"领取 +5 经验"按钮：从原来的 cyan / 自定义紫，统一改成 `bg-gradient-accent` + `text-accent-foreground`
- 未读红点：保留 `bg-destructive`
- 已完成对勾：`text-success`
- 数字 / 数据高亮：`text-accent`（不再用 `#3FB8AF`）

### 4. 顶部 Tab Bar、底部胶囊按钮

- Tab Bar 底：`bg-[hsl(25_16%_13%/0.7)] backdrop-blur`，激活态下划线用 `bg-accent`
- 胶囊：从纯黑/冷蓝换成 `bg-gradient-primary` + `ring-1 ring-accent/40`，未领取的金色脉冲点直接用 `bg-accent`

### 5. `btn-shine` 高光颜色

把扫光从纯白 `rgba(255,255,255,.35)` 改成暖白 `hsl(var(--accent) / 0.35)`，避免在暖底上显得刺眼。

## 涉及文件（仅 UI / CSS，不动逻辑）

- `src/index.css` —— `.dashboard-deep-surface` / `.btn-shine` 配色
- `src/components/dashboard/primitives/SectionCard.tsx` —— 描边、底色、内发光
- `src/components/dashboard/FloatingDashboard.tsx` —— Tab Bar、胶囊、容器底
- `src/components/dashboard/ProfileHeaderCard.tsx`、`TodayPanel.tsx`、`TasksPanel.tsx`、`MessagesPanel.tsx`、`SchedulePanel.tsx`、`primitives/RingProgress.tsx`、`Sparkline.tsx` —— 移除所有硬编码颜色 / `text-white*`，统一换 token

## 不动的

- 所有数据、hooks、RPC、布局结构、4 个 Tab、动画时序
- `tailwind.config.ts`（已有 keyframes 够用）
- 浅色模式：因为仪表盘只在抽屉里出现且本就走深色调，仍保持深色底，但深色由 `--primary` 系暖色生成，跟 `.dark` 主题天然兼容

## 验收

- 打开仪表盘，整体色调是"深咖啡 + 古铜金"，跟 Me 页 / 首页 logo / 历史卡片色系一致
- 没有任何冷蓝 / 青色 / 纯白硬编码
- 切换 4 个 Tab，按钮、进度、徽章高亮全部是品牌金色
