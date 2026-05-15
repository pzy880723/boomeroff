## 目标

把面向店员/管理端的系统名称统一改为 **门店运营辅助系统**，同步更新分享卡片、PWA、原生 App 名称与所有相关文案。  
顾客扫码进入的 `/u` 公共端继续保留「中古识物」品牌不变。

---

## 文案方案（润色后）

| 用途 | 新文案 |
|---|---|
| 系统全称 | 门店运营辅助系统 |
| 简称 / App 名称 | 门店助手 |
| 页面 `<title>` | 门店运营辅助系统 \| BOOMER-OFF |
| Meta description | 一站式门店运营辅助平台：AI 秒级识别商品、知识库共享、班次排班与日常运营管理，让店员的每一天都更顺手。 |
| og:title | 门店运营辅助系统 |
| og:description | AI 识物 · 知识共享 · 排班管理 · 销售辅助，门店日常运营一个工具搞定。 |
| 登录页副标题 | 门店日常运营 · AI 识物 · 知识共享 · 排班管理 |
| 登录页主标题 | 门店运营<accent>辅助</accent>系统 |
| Manifest name | 门店运营辅助系统 |
| Manifest short_name / Android / iOS / Capacitor appName | 门店助手 |

---

## 修改清单（仅店员/管理端）

### 1. 站点 head 与 PWA
- **`index.html`**
  - `<title>` → 新文案
  - `<meta name="description">` → 新文案
  - `<meta name="author">` 保持 `BOOMER-OFF Vintage`
  - `og:title` / `og:description` → 新文案
  - `twitter` 同步
  - `<meta name="apple-mobile-web-app-title">` → `门店助手`
- **`public/manifest.json`**
  - `name` → 门店运营辅助系统
  - `short_name` → 门店助手
  - `description` → 新 description

### 2. 原生 App 壳
- **`capacitor.config.ts`** `appName` → `门店助手`
- **`android/app/src/main/res/values/strings.xml`** `app_name` / `title_activity_main` → `门店助手`
- **`ios/App/App/Info.plist`** `CFBundleDisplayName` → `门店助手`

### 3. 店员端 UI 文案
- **`src/components/auth/AuthPage.tsx`**
  - 主标题改为「门店运营<gradient>辅助</gradient>系统」
  - 副文案改为「门店日常运营 · AI 识物 · 知识共享 · 排班管理」
  - logo `alt` → `门店运营辅助系统`
- **`src/components/layout/Header.tsx`** logo `alt` → `门店运营辅助系统`
- **`src/components/layout/PageHeader.tsx`** logo `alt` → `门店运营辅助系统`

### 4. 不动的部分
- `src/pages/public/PublicScan.tsx`、`PublicResult.tsx`、`PublicAbout.tsx`、`src/components/layout/PublicLayout.tsx` —— 顾客版，保留「中古识物 / 拍一拍 / 中古杂货」原文案。
- 所有 `supabase/functions/*` 中的 AI prompt（含「中古杂货」「中古商品」等领域词）—— 这些是识别/知识生成的业务上下文，不属于品牌名，保持不变。
- README.md（开发说明）不改。
- Logo 图片资源、`BOOMER-OFF` 母品牌名保留。

### 5. 收尾
- 更新 `mem://interface/brand-identity` 备注：店员端品牌名已变更为「门店运营辅助系统 / 门店助手」，顾客端仍为「中古识物」。
- 更新 `mem://index.md` 中的 Core 一行，注明双品牌策略。

---

## 验收

1. `/login`、店员端任何页面顶部 logo `alt`、登录页标题/副标题均显示新名称。
2. 浏览器分享 / 微信分享卡片 title + description 为新文案。
3. 安装 PWA 或打包 App 后名称显示「门店助手」。
4. 顾客访问 `/u`、`/u/community`、`/u/about` 仍看到「中古识物」品牌，无任何更名痕迹。
