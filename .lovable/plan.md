## 目标
把活动分享从「复制链接」改为「生成分享海报图片」。二维码内容用 `window.location.origin` 在运行时拼接，部署/换域名后自动生效，不会指向旧地址。

## 改动范围
仅前端展示层，不动后端、不动表结构、不动 edge functions。

### 1. 新组件 `src/components/voucher/ActivitySharePoster.tsx`
- 用 `<canvas>` 在客户端生成海报（约 750×1100 设计稿尺寸，导出 PNG）。
- 海报包含：
  - 顶部品牌区（BOOMER-OFF logo + 应用名）
  - 活动封面图（若有 `cover_url`）+ 活动名 + 描述（line-clamp）
  - 活动时间（复用 `fmtRange`）
  - 「需审核 / 免审核」徽章
  - 中间偏下：用 `qrcode` 包生成的二维码（内容 = `buildActivityShareUrl(share_token)`，运行时取 `window.location.origin`）
  - 二维码下方："扫码参与活动 / 长按保存图片分享"
- 提供导出方法：`canvas.toBlob` → `URL.createObjectURL`，用于预览与下载。

### 2. `src/pages/ActivityDetail.tsx`
- 「分享链接」这一行的「复制」按钮改为「生成分享海报」按钮（图标用 `ImageDown` 或 `Share2`）。
- 点击流程：
  1. 打开一个 `Dialog`，立即显示骨架 + 文案「正在生成分享海报…」
  2. 异步渲染 canvas（在 dialog 内的隐藏区/离屏 canvas）
  3. 完成后在 dialog 内展示海报预览图
  4. 底部两个按钮：「保存图片」（移动端触发下载 / iOS 长按提示） + 「复制链接」（保留作为兜底）
- 保留原 `shareUrl` 显示用，但主操作变成海报。

### 3. `src/pages/ActivitiesMine.tsx`
- 列表卡片右上角下拉菜单里的「复制链接」改为「生成分享海报」，复用同一个 `ActivitySharePoster` dialog 组件（抽成可在两处复用的受控组件 `ActivityShareDialog`）。

### 4. URL 动态性保证
- `buildActivityShareUrl` 已经是 `${window.location.origin}/u/activity/${share_token}`，海报里二维码每次点击「分享」时**实时调用**这个函数，不缓存、不写死域名。换域名后用户在新域名下点击分享，二维码就是新域名 URL。
- 海报组件不接受 origin 参数，强制内部读取 `window.location.origin`，避免被父组件意外注入旧值。

## 技术细节
- 二维码：`QRCode.toDataURL(url, { margin: 1, width: 480, errorCorrectionLevel: 'M' })`，再 `drawImage` 到主 canvas。
- 封面图：用 `new Image()` + `crossOrigin = 'anonymous'`，加载失败时跳过封面区，海报仍可生成。
- 字体：用系统字体栈（PingFang SC / Microsoft YaHei / sans-serif），避免外部字体加载。
- 颜色用 hsl 读取自 CSS 变量（`getComputedStyle(document.documentElement).getPropertyValue('--primary')`），与设计系统保持一致；如读取失败兜底用 `#0f172a` / `#ffffff`。
- 「正在生成」状态：dialog 打开后用 `requestAnimationFrame` + `await` 把绘制让出主线程，保证 loading 文案可见至少一帧。
- 下载：`a.download = '活动-{name}.png'; a.href = blobUrl; a.click()`。

## 不做的事
- 不引入新依赖（`qrcode` 已存在）。
- 不改 `buildActivityShareUrl` 签名。
- 不动 `/u/activity/:token` 公开页。
- 不做服务端海报生成（无需 edge function）。
