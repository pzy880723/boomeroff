## 问题定位

刚才上一轮虽然改了 `index.css` 主色和 `BottomTabBar` 结构，但**品牌资产层几乎没动**，所以你在 `/me` 页面看到的还是"BOOMER-OFF + 老 logo"。具体遗漏：

1. **Logo 图片**：全站仍在用 `src/assets/boomer-off-vintage-logo.png`，你附件里的新 Logo（`BO_logo_画板_1_副本.png`）根本没有导入。
2. **品牌名文案**：`Header.tsx`、`Me.tsx`（个人卡片下方 "BOOMER-OFF · v0.1.0"）、`MainLayout` 的 `<title>`/`<meta>`、登录页、通知模板等仍写着 `BOOMER-OFF`。
3. **底部导航**：结构确实换成了黑色悬浮胶囊，但在 `/me` 会被 FloatingDashboard 海獭浮标遮挡 / 视觉上跟旧版差别不明显 —— 需要给主按钮加**红色描边光晕 + 顶起阴影**，并在 `/me` 页面下移浮标位置避免遮挡。

## 改造计划

### 1. 引入新 Logo
- 将 `BO_logo_画板_1_副本.png` 复制到 `src/assets/boomer-go-logo.png`。
- 新建 `src/assets/brand.ts` 统一导出 `BRAND_LOGO`、`BRAND_NAME = 'BOOMER GO'`、`BRAND_TAGLINE = '门店运营系统'`，避免以后再散落各处。

### 2. 全站文案与 Logo 替换
批量替换以下位置的 `boomer-off-vintage-logo` 与 `BOOMER-OFF` 字样：
- `src/components/layout/Header.tsx`（顶栏 Logo + 品牌名）
- `src/pages/Me.tsx`（底部关于卡片 Logo + "BOOMER-OFF · v0.1.0" → "BOOMER GO · v0.2.0"）
- `src/components/layout/MainLayout.tsx`（`<Helmet>` title、og:title 改为 `BOOMER GO · 门店运营系统`）
- `src/pages/Auth.tsx`（登录页 Logo + 副标题）
- `src/pages/Home.tsx`（顶部问候语已经是 "BOOMER GO"，补一个左上角 Logo 徽标）
- `index.html`（`<title>` 与 meta description）

### 3. 底部导航强化视觉
- 在 `BottomTabBar.tsx` 给中间 "AI 识物" 主按钮加：
  - 外圈 `ring-4 ring-primary/25` 呼吸光晕；
  - 底部 `after:` 三角小尾巴，形成"胶囊 + 凸起圆"融合造型；
  - 激活项加短横线指示器。
- 在 `FloatingDashboard`（海獭浮标）里把默认位置从底部右下上调 `bottom-28`，避免遮挡导航胶囊。

### 4. 首页 (`Home.tsx`) 顶部品牌区
- 左上角加 Logo 徽章 + "BOOMER GO 门店运营系统" 字样，让"改版后打开首页第一眼"就能看到新品牌。
- 保持红白色调、硬阴影卡片风格不变。

## 不改动
- 现有 8 个仪表盘卡片布局、通知/官方知识/AI 识物业务逻辑。
- 数据库、Edge Function、权限模型。
- BOOMER 海獭吉祥物本身（浮标形象保留，仅调位置）。

## 验收
- 打开 `/`、`/me`、`/library` 都能看到新 Logo 与 "BOOMER GO" 字样；
- 底部黑色胶囊 + 红色 AI 识物凸起按钮明显区别于旧版；
- 浮标不再压在导航胶囊上。

确认后我按此执行。
