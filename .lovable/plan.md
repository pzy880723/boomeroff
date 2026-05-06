# 知识卡/识物卡分享功能

为「官方知识详情」(`OfficialDetail`) 和「识物卡」(`ProductDetailCard`) 增加统一的分享按钮，支持两种方式：

1. **分享链接** — 复制可访问的页面链接（识物卡需要可分享 URL，见下）
2. **保存长图** — 生成一张精简核心内容 + 品牌 logo 的竖版长图，可直接保存到相册

## 交互

- 顶部操作栏（详情页右上角 / 识物卡右上角）增加「分享」图标按钮
- 点击弹出底部抽屉（Sheet）两个选项：
  - 复制链接（带 toast 提示，移动端优先尝试 `navigator.share`）
  - 保存长图（生成中显示 loading，完成后弹出全屏预览，长按保存或点「下载」按钮）

## 长图设计（宽 750px，高度自适应，2x 输出 1500px 宽）

竖版卡片，圆角 24px，纯白底 + 浅灰渐变包边：

```text
┌──────────────────────────────┐
│  [BOOMER-OFF logo]    分类徽章 │
│                              │
│  [主图，正方形，圆角 16]      │
│                              │
│  商品名（24pt 粗体）          │
│  IP / 年代 · 产地（小字灰）   │
│  ─────────────────────────   │
│  ★ 一句话卖点（识物卡）       │
│   或 摘要 summary（知识卡）   │
│                              │
│  价格区（突出显示）           │
│   建议: ¥xxx                 │
│   历史: ¥xxx                 │
│                              │
│  3 个核心卖点（带 ▸）         │
│                              │
│  ─────────────────────────   │
│  [小 logo] BOOMER-OFF         │
│  扫码/链接 · 中古好物识别助手  │
└──────────────────────────────┘
```

**核心内容取舍**：
- 知识卡：cover_url + name + category/era/origin + summary（截 80 字）+ 前 3 个 selling_points + 一句店员小贴士
- 识物卡：主图 + name + category + 一句话推荐语 + 建议价/历史价 + 前 3 个卖点
- 不包含：完整 body 长文、视频、聊天、操作按钮

## 实现技术

- **截图库**：`html-to-image` (~12KB，比 html2canvas 更轻、对现代 CSS 支持好)。新建 `src/lib/share-image.ts` 封装。
- **共用组件**：`src/components/share/ShareCardCanvas.tsx` —— 隐藏的离屏 DOM (`fixed -left-[9999px]`)，用 React 渲染上面布局，再 `htmlToPng()` 转图片。
- **共用按钮**：`src/components/share/ShareMenu.tsx` —— 触发 Sheet，处理复制链接 + 生成图片 + 预览/下载。
- **品牌 logo**：复用 `src/assets` 已有的 `boomer-off-logo`（参考 brand-identity memory）。
- **链接**：
  - 知识卡 → `${origin}/library/${id}`（已存在）
  - 识物卡 → 暂用社区分享链接 `${origin}/community/${post_id}`；若识别尚未发布到社区，先弹出「发布到中古圈以获取链接？」二选一，或仅允许「保存长图」。

## 改动文件

- 新增 `src/lib/share-image.ts`
- 新增 `src/components/share/ShareMenu.tsx`
- 新增 `src/components/share/ShareCardCanvas.tsx`
- 编辑 `src/pages/OfficialDetail.tsx` —— 在顶栏右上添加 `<ShareMenu kind="official" item={item} />`
- 编辑 `src/components/recognition/ProductDetailCard.tsx` —— 添加 `<ShareMenu kind="recognition" item={...} />`
- 安装 `html-to-image`

## 兼容性

- iOS Safari 不支持自动下载，预览页给出「长按图片保存」提示
- Android / 桌面：直接触发 `<a download>` 下载 PNG
- 离屏渲染时用 `useLayoutEffect` 等待 cover 图加载完毕再截图，避免空白
