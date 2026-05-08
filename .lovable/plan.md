## 目标

把官方知识卡里的「金句 / 速记卡 / 客户话术三场景 / 易混对比 / 别名读音」这套富字段，复用到：

1. **AI 识图结果卡**（ProductDetailCard）
2. **个人识别历史**（products → ProductDetailDialog）
3. **个人手建词条**（product_knowledge → MyLibrary 详情）

不复制 `body`（官方知识专属的深度阅读长正文）。识别保持「先快出基础结果，富字段后台 enrich 异步补」的现有节奏。

---

## 一、统一一份「知识卡 schema」

在 `src/types/index.ts` 新增类型 `KnowledgeCard`，作为官方/个人/识别共用的富字段载体（与 `official_knowledge.content` 字段对齐，去掉只属于官方的 body）：

```ts
KnowledgeCard {
  one_liner?: string            // 一句话金句
  pronunciation?: string         // 读音
  aliases?: string[]             // 别名
  quick_facts?: { label, value }[]   // 速记卡 5 条
  customer_pitches?: { scene, line }[]  // 送礼/自用/收藏
  selling_points_rich?: { tag, text, detail? }[]
  comparisons?: { name, diff }[]
  pitch?: { opener, highlight, story? }    // 沿用旧字段
  tips?: { memory?, objection? }
}
```

`RecognitionResult.enriched` 扩展为 `KnowledgeCard`，去掉只在官方使用的 body。

## 二、数据库（最小改动）

只复用已有 jsonb 字段，不加新列：

- **products**：富字段写入 `ai_analysis.card`（已存在 jsonb，目前仅放 `enriched`）。
- **product_knowledge**：新增一个 `content jsonb DEFAULT '{}'` 列承载富字段（迁移）。
- 不动 `official_knowledge`。

## 三、识别链路（先快后富）

### 1. recognize-product 不变
依旧 1-3 秒返回基础字段（名称、类目、年代、产地、材质、卖点、pitch、tips、置信度、`__pipeline`）。

### 2. 升级 enrich-recognition
扩充工具 schema，新增字段：`one_liner / pronunciation / aliases / quick_facts(5) / customer_pitches(3) / comparisons(2-4) / selling_points_rich`。
- `story / highlight / objection / memory` 沿用。
- 输出禁用「主播」字样，写明「店员/您」。
- 同步把这套结果写回 `products.ai_analysis.card`，下次同款识别命中缓存即可秒读。
- 命中 hash/name 缓存且已有 `card` 时，直接把 `card` 透传给前端，无需再 enrich。

### 3. useProductRecognition / hooks
- `RecognitionResult.enriched` 类型扩展。
- 把 `card` 字段从 edge 响应/缓存里透传出来。

### 4. ProductDetailCard 渲染
按官方详情页同样的视觉顺序补 4 块（在现有"张口就讲""核心卖点"之间和之后插入），全部带「该字段还在补充中…」骨架占位：

```
[一句话金句 + 朗读/复制]
[张口就讲 pitch（已有）]
[速记卡 quick_facts，2 列网格]
[客户话术 customer_pitches，三场景卡]
[核心卖点 sellingPoints，已有，但优先用 selling_points_rich 带 detail]
[易混对比 comparisons]
[完整介绍 description（已有，折叠）]
[店员小抄 tips（已有）]
```

「深度故事补充中…」徽章保留；新富字段也走同一套 `isEnriching` loading。

## 四、个人识别历史（products / ProductDetailDialog）

- 读取 `ai_analysis.card`（含 enrich 后台写回的富字段）。
- ProductDetailDialog 复用与 ProductDetailCard 同套渲染块（抽到 `KnowledgeCardSections.tsx` 共享组件，避免双份维护）。
- 编辑入口（ProductEditDialog）暂不改 UI，富字段后续走 AI 重生成或保留已有内容；本轮只做「显示同步」。

## 五、个人手建词条（product_knowledge / MyLibrary）

- MyLibrary 详情查询补 `content` 列。
- 把现在简单的 `selling_points / tips` 显示替换为 `KnowledgeCardSections`。
- 「我建的」如果还没有 `content`，提供一个「AI 一键生成知识卡」按钮（管理员/作者可见），调用 `enrich-knowledge-core` 类似函数（现成，专门为官方知识卡核心字段做的）填回 `product_knowledge.content`。

## 六、不做的事

- ❌ 不生成 / 不显示 body 长正文（深度阅读）
- ❌ 不做 cover_prompt / 视频 / 图集（这些是官方专属）
- ❌ 不改 official_knowledge 表结构
- ❌ 不动现有识别缓存哈希逻辑

---

## 文件改动清单

新增
- `src/components/knowledge/KnowledgeCardSections.tsx`（共享渲染组件）
- 迁移：`product_knowledge` 加 `content jsonb default '{}'`

修改
- `src/types/index.ts`：扩 `RecognitionResult.enriched` 字段
- `supabase/functions/enrich-recognition/index.ts`：扩 tool schema + 写回 `ai_analysis.card`
- `supabase/functions/recognize-product/index.ts`：缓存命中时透传 `card`
- `src/hooks/useProductRecognition.tsx`：透传 card
- `src/components/recognition/ProductDetailCard.tsx`：用 `KnowledgeCardSections`
- `src/components/history/ProductDetailDialog.tsx`：用 `KnowledgeCardSections`
- `src/pages/MyLibrary.tsx`：详情读 `content`，用 `KnowledgeCardSections`，加「AI 生成知识卡」按钮

## 验证

1. 拍一张已识别过的商品 → 缓存命中 + 富字段直出。
2. 拍一张新商品 → 1-3 秒出基础卡 → 5-15 秒后金句 / 速记卡 / 三场景话术陆续出现。
3. 个人历史里点开同款 → 显示与识别完成时一致。
4. 在「个人知识库」点「我建的」词条 → 点「AI 生成知识卡」→ 富字段填好并持久化。
5. 全程 UI 无「主播」字样，无 body 深度阅读区块。
