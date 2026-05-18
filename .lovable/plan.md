## 目标
游客版（PublicResult / GuestProductCard）的识别结果卡片中，移除「市场参考价」（marketValue / 价格区间）的展示。其他字段（稀缺度、年代、产地、收藏理由等）保持不变。

## 改动范围
仅前端展示层，单文件改动：

**`src/components/recognition/GuestProductCard.tsx`**
- `ValuationHero` 组件中删除「市场参考价」整块（含 `TrendingUp` 图标 + `市场参考价` 标签 + `marketValue` 数值 + 「来源公开二手市场估算 · 非本店售价」说明）。
- 原先的 2 列 grid（`sm:grid-cols-[1.3fr_1fr]`）改为单列，「稀缺度」直接展示，去掉左侧分隔线。
- `hasAny` 判断条件中移除 `marketValue`，避免误判空。
- 移除 `marketValue` 相关 prop / 类型 / 调用处传参，清理未用到的 `TrendingUp` 引入。

## 不改动
- `useGuestRecognition` / `recognize-product-public` edge function 仍可返回 `marketValue`（数据层保留，仅 UI 不显示），便于以后恢复或在其他地方使用。
- 店员版（`ProductDetailCard` 等）不动。
- 估值速览卡的其他视觉（光晕、标题 Valuation · 估值速览、稀缺度星级、年代/产地胶囊、buyReason 引言）保持原样。

## 验收
- /公共识别结果页 不再出现"市场参考价"文案与金额。
- 稀缺度、年代、产地、收藏理由仍正常显示。
- 控制台无 TS / lint 报错。
