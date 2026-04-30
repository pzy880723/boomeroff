
## 改造目标

把当前系统从「直播话术工具」转型为**中古杂货铺店员销售辅助系统**：拍照 → 1-3 秒内拿到商品详细介绍和卖点 → 自动入库 → 每日生成知识点供店员学习。

---

## 1. 品牌升级

- 上传新 logo `BO_logo_画板_1_副本_2.png` → `src/assets/boomer-off-vintage-logo.png`
- 更换 `Header.tsx` 和 `AuthPage.tsx` 中的 logo 引用
- 文案统一改为「**中古商品实时识别系统**」
  - `index.html` 的 `<title>` 和 meta description
  - `AuthPage` 副标题改为「中古杂货 · AI 秒级识别 · 店员销售辅助」
  - Header alt 文案
  - README 标题

---

## 2. 识别输出重构（核心改动）

把"10秒卖点"升级为**结构化商品详细介绍**，让没见过该商品的店员也能立即上手介绍。

### 后端改造 `supabase/functions/recognize-product/index.ts`

- 升级模型：`google/gemini-2.5-flash-lite` → **`google/gemini-3-flash-preview`**（最新、速度与质量平衡，仍可保 2 秒级）
- 重写 prompt，输出 JSON 字段：
  ```
  {
    name,           // 商品名称
    category,       // 品类
    era,            // 年份/年代（如「昭和中期 1960s」）
    origin,         // 产地（如「日本京都 清水烧」）★新增
    material,       // 材质
    craft,          // 工艺特点
    sellingPoints,  // 卖点数组（3-5 条短句，最重要的字段）★新增
    description,    // 整体介绍（80-120字，店员可直接讲）
    tips,           // 店员小贴士（保养、辨识真伪、文化背景一两句）★新增
    imageHash       // 缓存匹配关键词
  }
  ```
- 移除 `suggestedPriceRange`、`scripts.{professional/sales/cultural}` 三种风格
- 缓存命中时返回新结构

### 数据库迁移

新增 `products` 字段：
- `origin TEXT` — 产地
- `selling_points JSONB` — 卖点数组
- `tips TEXT` — 店员贴士

保留现有 `description` / `era` / `material` / `craft`，废弃 `scripts` 字段（保留列以兼容旧数据，但前端不再展示三风格 Tab）。

不动 `price_records` 表的 schema（避免破坏旧数据），仅前端不再读写。

### 前端识别结果展示

- 新组件 `ProductDetailCard.tsx`（替换 `ScriptDisplay`）：
  - 顶部：商品名 + 品类 + 年代 + 产地 徽章
  - 「**核心卖点**」高亮区，列表展示每条卖点（最显眼）
  - 「**详细介绍**」段落，含复制 + 朗读按钮
  - 「**材质 / 工艺 / 尺寸 / 品相**」信息网格
  - 「**店员贴士**」浅色提示框
- `LiveStreamPanel.tsx`：
  - 删除整个「**价格参考**」区域、`historicalPrices`、`livePrice`、`fetchHistoricalPrices`、`saveLivePrice`
  - 删除 `PriceDisplay` 组件的引用
  - 入库逻辑去掉 `price_records` 写入

---

## 3. 历史记录与详情页

- `History.tsx` 卡片：把"卖点脚本预览"改为展示 `selling_points` 前两条
- `ProductDetailDialog.tsx`：
  - 删除「销售话术」三 Tab、删除「价格记录」整块
  - 改用新的 ProductDetailCard 同款布局：卖点 / 详细介绍 / 贴士
- `ProductEditDialog.tsx`：增加 `origin`、`selling_points`（多行文本，按行分割）、`tips` 字段编辑

---

## 4. 每日知识点（新功能）

帮助店员在没识别商品时也能学习库存知识。

### 数据库

新建表 `daily_knowledge`：
```
id uuid pk
date date unique
content jsonb       -- {summary, highlights[], featured_products[]}
created_at timestamptz
```

RLS：所有登录用户可读，仅 service role 可写（由 edge function 写入）。

### Edge Function `generate-daily-knowledge`

- 触发方式：店员每天首次进入首页时前端检查"今天是否已有"，若无则调用一次（用 unique date 防并发）
- 逻辑：拉取昨天/最近 7 天新增的商品，调用 `google/gemini-3-flash-preview` 总结生成：
  - 今日学习要点（3-5 条，跨商品提炼的中古知识）
  - 重点商品速记（挑 3 件代表，每件 1 句话核心卖点）
- 写入 `daily_knowledge`

### 前端「每日知识点」卡片

- 在 `Dashboard` 摄像头区**上方**新增可折叠的「📚 今日知识点」卡片
- 展示当日 summary + highlights + 重点商品缩略图
- 点击展开/收起，默认展开

---

## 5. 用户体验微调

- Auth 副标题与角色保持不变（admin/anchor），但 UI 文案把「主播/直播」类描述替换为「店员/识别」
- 移除 `RecognitionPanel.tsx`（已未被路由使用，确认后删除）
- 摄像头按钮文案：「启动摄像头」保持，识别中提示「AI 识别中…」保持

---

## 技术细节（开发参考）

**文件改动清单：**
- 新增：`src/assets/boomer-off-vintage-logo.png`、`src/components/recognition/ProductDetailCard.tsx`、`src/components/dashboard/DailyKnowledgeCard.tsx`、`supabase/functions/generate-daily-knowledge/index.ts`
- 修改：`Header.tsx`、`AuthPage.tsx`、`index.html`、`LiveStreamPanel.tsx`、`History.tsx`、`ProductDetailDialog.tsx`、`ProductEditDialog.tsx`、`useProductRecognition.tsx`、`types/index.ts`、`supabase/functions/recognize-product/index.ts`、`supabase/config.toml`
- 删除（或停用）：`RecognitionPanel.tsx`、`PriceDisplay.tsx`（如未在它处引用）、`ScriptDisplay.tsx`

**类型变更：**`RecognitionResult` 新增 `origin/sellingPoints/tips`，移除 `scripts/suggestedPriceRange/enrichedContent/subCategory/vesselType`。

**模型选择：** 识别用 `google/gemini-3-flash-preview`（最新 flash，质量优于 2.5-flash-lite，速度可接受）。每日知识点用同模型，文本任务无压力。

**速度保障：** prompt 仍保持紧凑（≤200 字），输出字段控制在 8 个以内，目标识别 ≤3 秒。

---

## 实施顺序

1. 数据库迁移（新字段 + daily_knowledge 表）
2. logo 资源 + 品牌文案
3. recognize-product edge function 重写 + 类型更新
4. ProductDetailCard 新组件 + LiveStreamPanel 移除价格区
5. History + ProductDetailDialog + ProductEditDialog 适配
6. generate-daily-knowledge edge function + DailyKnowledgeCard
7. 清理废弃组件
