## 问题诊断

排查后发现两处高度相关的 bug：

### 1. 顶栏（Header.tsx）logo 严重溢出
`src/components/layout/Header.tsx`:
- 容器声明 `className="h-15"`（Tailwind 没有 h-15）+ 内联 `style={{ height: '3.75rem' }}`（60px）
- 但里面的 logo 是 `h-[5.25rem] w-[5.25rem] sm:h-[6.5rem]`（84–104px）

logo 比顶栏本身还高 24–44px，导致顶栏被撑大或 logo 被裁切，视觉上"高度错误"。

### 2. 底栏（MainLayout + BottomTabBar）安全区预留不足
- `BottomTabBar` = `h-12`（48px）导航 + `safe-bottom`（≥12px，iOS 刘海机最多 ~34px）≈ 60–82px
- `MainLayout` 只给 `pb-16`（64px），iOS 上底部内容会被 tab 栏遮住

另外，`PageHeader` 也带了一个 logo 按钮（h-8），和 PageHeader title 并列在 h-12 容器里，移动端 440px 视口下与 `right` 槽位会挤压标题区。

## 修复方案

### A. Header.tsx
- 移除非法的 `h-15`，统一容器高度为 `h-14`（56px），删除内联 style
- logo 缩到 `h-10 w-10 sm:h-11 sm:w-11`（40–44px），与顶栏高度协调
- 保留 5 次点击进入后台逻辑

### B. MainLayout.tsx
- `<main>` 的 `pb-16` 改为 `pb-[calc(3.5rem+env(safe-area-inset-bottom))]`，正确避开底栏 + 安全区

### C. BottomTabBar.tsx
- 容器固定高度由 `h-12` 改为 `h-14`（56px），与 main 的预留对齐；图标/字号不变，仅去掉底部 `pb-0.5` 让 `safe-bottom` 自然撑开
- 中间凸起按钮的 `w-7 h-7` 微调为 `w-9 h-9`，与 56px 高度更匹配

### D. PageHeader.tsx
- 把右上角重复的 logo 按钮移除（顶部品牌已经在 Header 里；PageHeader 只用于二级页且本身不显示 Header，因此保留 logo 按钮以维持"5 次点击入口"）→ 改为只保留隐形点击区，不再渲染 `<img>`，避免高度抖动
- 容器高度 `h-12` 改为 `h-14`，与 Header 一致

### 不会改动
- 路由、业务逻辑、AI 流程、RLS、edge functions
- 设计 token / 配色

### 验证
- 在 440×798 视口截图确认顶栏 56px、底栏 56px+安全区，logo 不溢出
- 切换 Scan / OfficialLibrary / Community / Me 各页，底部最后一行内容不被遮挡
