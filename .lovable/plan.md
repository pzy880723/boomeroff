## 问题

顾客把 `/u`、`/u/community` 等链接发给朋友/发到微信时，社交平台抓取到的还是 `index.html` 里的「门店运营辅助系统 / AI 识物 · 知识共享 · 排班管理 · 销售辅助」这套**面向店员**的文案，体验完全错位。

社交爬虫（微信、LinkedIn、Slack 等）**不执行 JS**，所以不能只用 react-helmet-async 在客户端覆盖 head；必须把 `index.html` 的静态 head 默认换成**面向顾客**的版本，再用 helmet 在店员端反向覆盖即可。

---

## 文案方案（润色后，统一面向顾客）

| 用途 | 新文案 |
|---|---|
| 站点 `<title>` | 中古识物 · 拍一拍,认识每一件中古好物 |
| Meta description | 对准货架上的中古杂货拍一张,1-3 秒告诉你它的名字、年代和故事。免费 · 无需注册 · 拍完即得。 |
| og:title | 中古识物 · 拍一拍 |
| og:description | 一只昭和茶碗、一台老 Walkman、一枚玻璃胸针——拍一张,让 AI 替它讲故事。 |
| og:url | https://boomeroff.lovable.app/u |
| 微信/系统分享 share text | 「拍一拍,认识中古好物」——AI 帮你看懂每一件旧物的来历 |

> 店员端（登录后)使用 react-helmet-async 在内部页面覆盖回 `门店运营辅助系统` 的 `<title>`,以免运营自己日常使用时浏览器 tab 显示成「中古识物」。

---

## 修改清单

### 1. 反转 `index.html` 默认 head 为顾客版
- `<title>`、`description`、`og:title`、`og:description`、`twitter:*` 全部改为上面顾客版文案。
- `og:url` 设为 `https://boomeroff.lovable.app/u`。
- 保留现有 `apple-mobile-web-app-title=门店助手`(原生 App 名)。

### 2. 安装 `react-helmet-async`,在店员端覆盖 head
- `bun add react-helmet-async`
- `src/main.tsx` 用 `<HelmetProvider>` 包裹 App。
- 在 **店员端布局** `src/components/layout/MainLayout.tsx` 顶部加一段 `<Helmet>`,把 `<title>` 改回「门店运营辅助系统 | BOOMER-OFF」、description 改回内部文案;`/portal`、`/login` 同理(单独在对应页面/组件内加 Helmet,或统一加在 MainLayout 即可覆盖大部分店员路由)。
- 顾客端 `PublicLayout` 不加 Helmet,沿用 index.html 顾客文案。

### 3. 系统级分享(navigator.share)措辞润色
- `src/components/share/ShareMenu.tsx` 第 44 行:把 `title: data.name, text: data.name` 改为 `title: '中古识物 · ' + data.name`、`text: '我用「中古识物」拍了一件 ${data.name},你也来看看 →'`。
- `src/pages/public/PublicResult.tsx` 分享发布成功的 toast 文案保持「已匿名发布到中古圈」不变;另把页面顶部分享 hero 卡的副文案润色为「让更多人看到这件好物」(若现状非此)。

### 4. 不动的部分
- `public/manifest.json` 仍是「门店运营辅助系统/门店助手」(PWA 安装名,通常是店员安装,不影响顾客分享预览)。
- 顾客端 UI 视觉、`PublicAbout` 等正文文案保持不变(本身已是顾客口吻)。
- 所有 edge functions、AI prompt 不动。

---

## 验收

1. 微信/iMessage/Slack 中粘贴 `https://boomeroff.lovable.app/u` 或任意 `/u/*` 链接,卡片标题显示「中古识物 · 拍一拍」。
2. 浏览器打开 `/u` tab 标题为「中古识物 · 拍一拍...」;打开 `/scan`、`/portal` 等店员页 tab 标题为「门店运营辅助系统 | BOOMER-OFF」。
3. 顾客点页面右上分享按钮,系统分享面板里的标题/描述是顾客口吻,不再出现「店员/排班/管理」等词。
