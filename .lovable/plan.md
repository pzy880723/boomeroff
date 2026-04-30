## 目标

统一所有 Tab 页面的顶部栏样式，把识别页（AI 识物）的右侧操作合并到「我的」，让中间的主按钮更克制。

## 具体改动

### 1. `PageHeader.tsx` — 统一顶部栏（左侧 logo）

把 `PageHeader` 改造成所有 Tab 页通用的顶部栏：
- **左侧**：BOOMER-OFF logo（沿用 `Header.tsx` 中的 logo 资源 + 五次点击进入后台的逻辑）
- **中间**：页面标题（如「官方知识」「个人知识」「AI 识物」「中古圈」「我的」）
- **右侧**：可选的 `right` 插槽（默认空）

logo 高度统一为约 `2.25rem`（比当前 `Header.tsx` 中的 5.25rem 小很多，避免顶部栏过高），整个 header 高度统一为 `3.5rem`。

保留点击 logo 5 次弹后台密码框的隐藏入口（沿用 `useLogoTapCounter`）。

### 2. `Scan.tsx` — 改用统一 PageHeader

移除 `Header` 组件的引用，改为 `PageHeader title="AI 识物"`，不传 `right`。这样：
- 「每日知识」「历史记录」按钮 → 取消（历史记录已在「我的」里）
- 头像下拉里的「退出登录」「角色徽标」「个人资料」 → 已经在「我的」里

### 3. `Me.tsx` — 已包含历史记录入口、修改密码、退出登录，无需新增。但补充：
- 「每日知识」入口（如果你想保留这个功能），加在设置卡片里。如果不需要可以省略。

### 4. `BottomTabBar.tsx` — 弱化中间按钮

- 文案：`AI 识别` → `AI 识物`
- 中间按钮尺寸：从 `w-16 h-16 -mt-6` 改为 `w-12 h-12 -mt-3`，去掉 `ring-4`，保留轻微阴影和 `bg-primary` 高亮，仅比其他 tab 略大略突出
- 图标 `w-7 h-7` → `w-5 h-5`
- 文字尺寸保持和其他 tab 一致

### 5. 其他 Tab 页面适配

`OfficialLibrary.tsx`、`MyLibrary.tsx`、`Community.tsx`、`Me.tsx` 已经在用 `PageHeader`，自动获得新的统一 logo 顶部栏。各页若已传 `title`，不变；若有自定义 `right`（如搜索按钮），保留。

### 6. `Header.tsx`

仅 `History` 页还在使用旧 `Header`。两个选择：
- (a) `History` 也改用 `PageHeader`（带返回按钮回 `/me`）
- (b) 保留 `Header.tsx` 仅供 History 等独立页使用

采用 (a)：`History.tsx` 改为 `PageHeader title="历史记录" back="/me"`，然后删除 `Header.tsx`（或保留以防其它地方引用，先不删）。

## 文件改动清单

- 改：`src/components/layout/PageHeader.tsx`（加 logo + 隐藏后台入口）
- 改：`src/components/layout/BottomTabBar.tsx`（中间按钮缩小、文案改名）
- 改：`src/pages/Scan.tsx`（用 PageHeader 替换 Header）
- 改：`src/pages/History.tsx`（用 PageHeader 替换 Header）
- 不改：`OfficialLibrary` / `MyLibrary` / `Community` / `Me`（自动继承新 PageHeader 样式）

确认后我切到执行模式实施。