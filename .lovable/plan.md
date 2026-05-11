## 目标

在「中古圈帖子详情」和「识别结果」的商品卡顶部，加入一张高识别度的「估值速览卡」，把 **年代 / 产地 / 稀缺程度 / 收藏价值 / 市场价值** 用突出版式排在最前面，并紧跟一句「为什么值得入手」的购买理由，引导用户产生「划算」「捡漏」的感觉。

## 一、视觉设计（在 `GuestProductCard.tsx` 头图下方新增模块）

```text
┌─────────────────────────────────────────────┐
│  VALUATION · 估值速览                        │
│                                              │
│   市场参考价                                  │
│   ¥ 1,800 – 2,400        稀缺度  ★★★★☆      │
│   ───────────             收藏价值 高          │
│                                              │
│   年代  1980s  ·  产地  日本 · 京都           │
│                                              │
│  ┝━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┥     │
│   "出自京都老铺的限定花纹，存世已不多，        │
│    遇到就是缘分，错过基本只能去拍卖行寻。"    │
└─────────────────────────────────────────────┘
```

要点：
- 整张卡用 `bg-gradient-to-br from-accent/10 to-primary/5` + `ring-1 ring-accent/30`，与下方故事/看点区拉开层级
- 「市场参考价」用 `font-display` 大号（24-28px），下方注脚「市场参考·非本店售价」灰字
- 稀缺度用 5 星填充图标；收藏价值文字标签（极高/高/中/一般）配色：极高=rose，高=amber，中=emerald，一般=muted
- 年代/产地用一行内联 chip，弱化为副信息
- 一句话购买理由用 `border-l-2 border-accent` 引文样式，斜体或 `font-display`

## 二、数据字段（AI 输出 → 存库 → 渲染）

新增 4 个字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `rarity` | int 1-5 | 稀缺度，1 常见 → 5 极罕见 |
| `collection_value` | text | 收藏价值标签：`极高 / 高 / 中 / 一般` |
| `market_value` | text | 市场参考价区间，如 `¥1,800 – ¥2,400`、`¥800 起` |
| `buy_reason` | text | 一句话购买理由，30-60 字，"偶遇/捡漏/错过就没了" 风格 |

> 关于「市场价稍微夸张」：在 prompt 里给 AI 明确指令——按公开二手市场（闲鱼/煤炉/Yahoo Auctions 日拍）参考价的 **上沿** 给区间，并明确"宁可偏高，不可偏低"，但保持合理（不超过常见行情上限的 1.3 倍），并标注"市场参考·非本店售价"避免合规风险。

## 三、改动清单

### 1. 数据库迁移
给 `community_posts` 表新增 `rarity int`, `collection_value text`, `market_value text`, `buy_reason text`（都可空，老数据兼容）。

### 2. 边缘函数 `recognize-product-public`
- prompt 中追加这 4 个字段的输出要求 + 市场价"取上沿"指令
- 返回 JSON 中包含这 4 个字段

### 3. 边缘函数 `submit-public-post`
- 透传这 4 个字段写入 `community_posts`

### 4. `useGuestRecognition.tsx` & `RecognitionResult`/`GuestRecognitionResult` 类型
- 新增 4 个可选字段，从 `data` 透传

### 5. `GuestProductCard.tsx`
- 新增 `<ValuationHero />` 子组件，**渲染顺序：Hero 大图 → 估值速览卡 → 标题 → meta 表格 → 它的故事 …**
- 老数据没有这 4 字段时整卡不渲染，回退到现有版式

### 6. `PublicCommunity.tsx` & `PublicResult.tsx`
- `select` 与 `cardData` 透传新字段

## 四、不在本次范围

- 不改造识别管线缓存逻辑（hash/name cache 命中时若无新字段，下次刷新会被 AI 补齐）
- 不改 `official_knowledge` / `product_knowledge`（管理员后台可后续再加）
- 不调整价格记录、闲鱼快照等已有价格模块

## 五、技术细节

- 所有颜色走 `text-accent / text-rose-500 / text-amber-500 / text-emerald-600` 等 Tailwind tokens，已有设计体系
- 星级用 `lucide-react` 的 `Star` + `StarOff`（或填充透明度）
- 估值卡放在 hero 图下、标题上方，移动端单列；桌面端可保持单列以求专注
- 合规小字「市场参考·来源公开二手平台估算，非本店售价」放在估值卡右下 `text-[10px] text-muted-foreground/70`