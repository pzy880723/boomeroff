## 调整内容

针对 `GuestProductCard.tsx`（识别结果 + 中古圈帖子详情共用）：

### 1. 删除「收藏价值」
- `ValuationHero` 中移除整段 `collectionValue` 渲染（标签 + 配色 chip）
- 移除 `COLLECTION_VALUE_STYLE` 常量
- props 仍保留 `collectionValue`（向后兼容数据），仅不渲染

### 2. 稀缺度默认 ≥4 星
- 在 `ValuationHero` 内：`stars = max(4, round(rarity || 4))`，并 clamp 到 5
- 即 AI 给的若 <4 自动抬到 4；缺失时默认 4
- 同时在 `recognize-product-public` 边缘函数 prompt 中追加："稀缺度 rarity 取值范围 4-5（默认偏高，营造稀缺感）"，让落库数据也偏高

### 3. 日本 IP 产品产地默认「日本」
- 在 `recognize-product-public` 边缘函数：判定为日本相关品类（`jp_porcelain / incense / anime_toy / otaku_goods / walkman / ccd / media_record / playback_device / game_console`）时，若 AI 没给 `origin` 或给的不是日本相关，强制 `origin = '日本'`
- 同时在 `GuestProductCard` 兜底显示：当 `origin` 缺失且 category 属于上述日本品类时，渲染「日本」

### 4. 商品名移到图片下方
- 现状：hero 图左上角是品类 chip，左下角白字叠了 `era · origin`，标题在图外下面
- 改为：
  - 移除图片底部的 era/origin 白字浮层 + 黑色渐变蒙层
  - 图片下方紧跟 `<h1>` 商品名块（保留现在的 `Discovery · 品类` 小标签 + 大标题）
  - 估值速览卡放到标题下方（顺序：Hero 图 → 标题 → 估值速览卡 → meta → 故事…）
  - 估值卡里继续展示 era / origin chips，避免信息丢失

## 不改动

- 数据库结构不动（`collection_value` 字段保留）
- `submit-public-post`、`useGuestRecognition` 透传字段不动
- 其他模块（看点 / 故事 / 保养）样式不动
