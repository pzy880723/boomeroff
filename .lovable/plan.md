# 修复活动海报扫码进不去报名页

## 目标
顾客长按 / 扫码活动海报 → 必须直接进到报名表单,**永远不能再出现**"页面出错了 / 刷新重试 / 返回首页 / 在浏览器中打开"这类提示。以后我不再需要自己测能不能进。

## 根因
- `/u/activity/:shareToken` 路由用 `lazyWithRetry` 懒加载。微信 X5 webview 冷启动拉公开 URL 时,chunk 经常失败,且抛出的错误信息不一定匹配 `chunkLoadRecovery` 里的关键字白名单。
- 一旦不匹配,根级 `ErrorBoundary` 就显示那张红色错误卡片(就是截图里那个)。
- 即便匹配,目前的兜底文案"返回首页"按钮会跳 `/scan`,顾客在公开域名上根本没首页可去——本身就是不该出现的 UI。

## 改动

### 1. 公开路由全部改成"急加载",不再走懒加载分包
`src/App.tsx`:把这几个公开页直接 `import`,而不是 `lazy(...)`:
- `PublicActivity`
- `PublicClaim`
- `PublicClaimByPhone`
- `PublicLayout` + `PublicScan` / `PublicResult` / `PublicCommunity` / `PublicAbout`

代价:首包多几十 KB;收益:微信 X5 一次性就能拿到全部 JS,不会再因为二级 chunk 拉不到而崩。这是最根本的解法。

### 2. 给 `/u/*` 公开路径套一个"静默"ErrorBoundary
新增 `src/components/system/PublicErrorBoundary.tsx`:
- 捕获任何错误时,**不显示红色错误卡片**。
- 第一次错误:按 build key 写一次 `sessionStorage` 标记,自动 `location.reload()`,屏幕上只显示淡米色背景 + 小 loading 圆圈,文案"正在打开活动…"。
- 如果同一个 build 下已经 reload 过一次还出错(极少数情况),显示极简的纯文案兜底:"网络繁忙,请稍后重试",不带任何按钮 / 不提"用系统浏览器"——这条用户已经说不要再让顾客看到任何提示了。

在 `App.tsx` 里只对 `/u/...` 路由用这个 ErrorBoundary 包裹;管理端继续用原来的根级 ErrorBoundary(那张红卡片对内部用户是有用的)。

### 3. `PublicActivity` 加防御
`src/pages/public/PublicActivity.tsx`:
- `activity-public` edge function 返回错时:不再显示三角形错误卡片,而是直接显示同款暖棕背景 + 一行小字"活动暂时无法打开,请稍后重试",不带任何按钮 / 不提返回首页。
- `useMemo(agreementText)` 等地方对 `activity` 字段做空值兜底,避免渲染期抛错把整个页面打挂。

### 4. (无关代码改动)
- 不动 `ErrorBoundary.tsx` 现有文案,管理端继续用。
- 不动 edge function、不动数据库、不动海报二维码生成逻辑(二维码本身的 URL 是对的)。
- 不动其他营销中心改造工作。

## 验收口径
我自己扫海报二维码(微信扫一扫 + 微信里长按识别两种),应该:
- 直接进表单页;
- 即使第一次失败,屏幕上只会闪一下淡色 loading 然后自动进表单;
- **任何情况下都不会出现红色错误卡片、"刷新重试"、"返回首页"、"在系统浏览器中打开"这三句话**。
