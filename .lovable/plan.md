## 问题诊断

1. **Banner 闪现旧图**：`Home.tsx` 的 Banner `<img>` 使用了 `bannerNote?.image_url || bannerDefault`。资讯还没加载完（`notes` 为空）时 fallback 到本地的 `banner-default.jpg`（AI 设计的那张），加载完后再换成真实资讯图 —— 产生「先旧图，后真图」的闪烁。

2. **返回落到资讯页**：Home 的 Banner 通过 `<Link to="/notifications?tab=news&open={id}">` 打开；`Notifications.tsx` 把 `?open=` 认到后打开详情弹窗，同时 `replace` 掉 URL。用户关闭详情后停在资讯列表页，需要再点一次「返回」才能回到首页。

## 计划

### 1. Home.tsx —— 消除 Banner 闪现
- 从 `useNotifications()` 一起取出 `loading`。
- Banner 渲染逻辑改为：
  - `loading` 期间：渲染一个纯色/骨架占位（`bg-muted` + 轻微 shimmer），**不再显示** `bannerDefault`。
  - 加载完成后：有资讯 → 直接显示真实图；无资讯 → 才 fallback 到 `bannerDefault`（保留品牌兜底）。
- 图片自身仍保留 `loading="eager"` + `fetchpriority="high"`，切换时用 `key={bannerNote?.id}` 避免同一 `<img>` 复用旧 src。

### 2. Home → 资讯详情 → 返回首页
- Home 的 `<Link>` 携带 state：`state={{ fromHome: true }}`。
- `Notifications.tsx`：
  - 使用 `useLocation()` 读取 `location.state?.fromHome`，用 `useRef` 记住（因为一旦 replace URL 后 state 也会变）。
  - 详情弹窗的 `onOpenChange(false)` 关闭时：若来自首页，则 `navigate('/', { replace: true })`；否则维持现有行为（留在资讯页）。
- 只影响「从首页 Banner 打开」这条路径；从「中古圈 / 消息中心 Tab 内部」打开的详情关闭后仍留在资讯页。

### 3. 不做的事
- 不改资讯详情弹窗本身样式。
- 不动 `useNotifications` 数据结构。
- 不改路由结构（不新增独立详情路由）。

## 需要你确认
- 加载中占位就用「灰底 + 轻微骨架」即可吗？还是想显示一张固定的 BOOMER GO 品牌背景？（默认按前者实现，最不闪。）
