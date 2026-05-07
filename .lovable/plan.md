## 调整分享长图样式

重做 `src/components/share/ShareCard.tsx`，让长图更接近手机浏览的实际宽高比例和字号，并修正 logo 显示。

### 尺寸与排版

- 画布宽度从 750px 改为 **390px**（与移动端视口一致），`html-to-image` 仍以 `pixelRatio: 2` 输出，最终生成约 780px 宽的高清 PNG —— 文件大小合适，且字号视觉上和真实手机一致。
- 整体字号同步缩小到移动端真实比例：
  - 标题 H1：`20px / 600`
  - 副标题（IP·年代·产地）：`12px`
  - 推荐语 / 摘要正文：`14px`，行高 1.7
  - 价格数字：`18px / 700`，标签 `11px`
  - 卖点正文：`13px`
  - 类目徽章：`11px`
- 主图：保持正方形，宽度 = 卡片宽减去左右 padding（约 334px），圆角 14px。
- 整体 padding：外层 16px，卡片内部 18px。

### 内容增加

让信息更饱满（之前太少），按可用字段补足：

- **副标题行**：除了 IP/年代/产地，再追加「材质 / 工艺 / 尺寸」中存在的字段（识物卡走 spec_basic，知识卡走 fields）。
- **摘要 / 一句话推荐**：截断长度从 120 字提高到 **180 字**。
- **核心卖点**：从 3 条提高到 **最多 5 条**，每条最多 60 字。
- **小贴士**：保留，最多 60 字。
- **新增「适用场景 / 鉴别要点」分块**（仅当数据存在时渲染），知识卡使用 `fields.identification` / `fields.scenarios`，识物卡使用 `value_factors` / `caution`（如有）。

`ShareCardData` 接口新增可选字段 `extras?: { label: string; value: string }[]`，由调用方按需传入，避免改动太大。

### Logo 与底部署名

- **去掉顶部品牌条上的 logo 和「BOOMER-OFF」文字**，顶部只保留分类徽章（右对齐）。
- **底部新增居中的 logo + 文案**：
  - 一张 logo 居中（48×48，圆角 10）
  - 下方一行小字：`由 boomeroff 官方生成`（12px，居中，灰色 `#737373`）
  - 不再显示链接 URL（链接由「复制链接」操作单独承担）
- 用 `object-fit: contain` 显示 logo，避免被裁切/拉伸压缩；外层容器宽高固定，内部 img 用 `width:100%; height:100%; object-fit:contain`。
- 移除当前底部那行「由 BOOMER-OFF 生成 · 长按或点击下载保存图片」(此提示文案搬到 `ShareMenu` 预览弹窗里，不进截图)。

### 调用方对齐

- `ProductDetailCard.tsx` 和 `OfficialDetail.tsx` 在构造 `ShareCardData` 时按上面新字段补充 `points`（最多 5）、`extras`（鉴别/场景）。
- `ShareMenu.tsx`：离屏容器宽度跟随 ShareCard（390px），不需改逻辑；预览弹窗内已有「iOS 长按保存」提示，新增一行「由 boomeroff 官方生成」的说明放预览弹窗即可。

### 文件改动

- 编辑 `src/components/share/ShareCard.tsx`（重写样式 + 新增 extras 渲染 + 改 logo 位置）
- 编辑 `src/components/share/ShareMenu.tsx`（仅微调底部提示文案，无逻辑变更）
- 编辑 `src/components/recognition/ProductDetailCard.tsx`（补充 points/extras）
- 编辑 `src/pages/OfficialDetail.tsx`（补充 points/extras）
