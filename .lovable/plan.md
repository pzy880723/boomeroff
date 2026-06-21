## 目标

把系统里散落的"知识"统一成 **一份品牌专属 RAG 检索库**，所有 AI 入口（生图 / 文案 / 视频 / **浮标 BOOMER 对话**）默认都先检索这份库再回答；并且让它**自己长大**——新增/修改/被采纳的内容会自动回流。

最终效果：BOOMER 不只是一个聊天助手，而是 **BOOMER·OFF 品牌的专属大模型**——越用越懂品牌、越懂门店、越懂运营。

## 知识来源（全部接入）

| 来源 | 表 | 进库 |
|---|---|---|
| 官方知识 | `official_knowledge` | 标题+正文+卖点 |
| 个人词条 | `product_knowledge` | 标题+卡片 |
| 识别历史（资料完整 + admin 标记沉淀） | `products` | 名称+描述+卖点 |
| 店铺画像 | `shops` + `shop_marketing_profiles` | 定位/卖点/口吻/人群 |
| 门店 SOP / 顾客 QA | `shop_kb_entries` | 标题+正文 |
| 品牌系统提示 / 平台 / 口吻 / 镜位 | `marketing_presets` | 每条 preset 一文档 |
| 营销素材 | `marketing_assets` | 文件名+caption+tags（vision 自动补描述） |
| 人物设定 | `marketing_characters` | 名字+人设+风格 |
| 中古圈精选帖 | `community_posts.is_featured` | 文案+话题 |
| **运营 OKR / 月度主题** | **新增 `operation_okrs`** | 周期+目标+关键动作 |
| 手动自由词条 | `source_type='manual'` | 管理员任意写 |
| **被采纳的 AI 输出（含 BOOMER 对话精选）** | `source_type='accepted_output'` | 点"加入知识库"回流 |

## 数据模型

### `kb_documents`
```text
id uuid pk
source_type text   -- official/product_kb/product/shop_profile/shop_sop/shop_qa
                   -- preset/asset/character/community/okr/manual/accepted_output
source_id   text
shop_id     uuid?
scopes      text[] -- {'image','copy','video','chat'} 默认全开（chat = BOOMER 浮标）
title       text
content     text   -- chunk 后正文
metadata    jsonb  -- {tags, weight, original_url, content_hash, ...}
embedding   vector(3072)
embed_model text
updated_at  timestamptz
```
HNSW (`vector_cosine_ops`) + RLS：管理员全权，店员按 shop_id 读。

### `kb_ingest_queue`
`id, source_type, source_id, op (upsert/delete), enqueued_at, processed_at, error`

### `operation_okrs`
`id, period_start, period_end, scope (brand/shop), shop_id?, title, objective, key_results jsonb, key_actions, tags[]`

### RPC `match_kb(query vector, k int, scope text, shop uuid)`
按 `scope = ANY(scopes)` 过滤 + shop_id 偏好加权，返回 top-k。

## Edge Functions

### 新增
- `kb-embed` — 调 `google/gemini-embedding-001` (3072d) 批量出向量。
- `kb-ingest` — 消费队列：拉源 → chunk（≈800 字、重叠 100、标题重复在头）→ content_hash 变化才 re-embed → upsert。支持 `?backfill=all` 一次性回填。
- `kb-search` — `{query, scope, shop_id, k}` → embed → `match_kb`。相似度 < 0.55 全部丢弃。
- `kb-analyze-asset` — 给 `marketing_assets` 跑视觉模型补 caption / tags。
- `kb-accept` — "★ 加入知识库" 按钮入口，写 `accepted_output` + 入队。

### 改造（注入检索结果 + 返回 `__kb_sources` 元数据）
- `generate-marketing-copy` (scope=copy)
- AI 生图 edge fn (scope=image)
- 视频脚本 / 镜位 (scope=video)
- `generate-shop-kb` (scope=copy + shop_id)
- **`spirit-chat`（BOOMER 浮标）(scope=chat)** ← 本次新增重点
  - 流式 SSE 前先同步 `kb-search`（k=6），把命中片段塞进 system prompt 顶部：
    `【BOOMER 知识库参考】\n---\n{title}\n{content}\n---\n...`
  - 在 SSE 首个 event 里把 `__kb_sources` 推给前端用于展示徽章。
  - 仍不持久化对话本体，但 "加入知识库" 仍可把任意一条助手回复回流。

## 自动成长

`AFTER INSERT/UPDATE/DELETE` 触发器入 `kb_ingest_queue`：
`official_knowledge / product_knowledge / products(资料完整时) / shops / shop_marketing_profiles / shop_kb_entries / marketing_presets / marketing_assets / marketing_characters / community_posts(featured) / operation_okrs`

`pg_cron` 每分钟跑 `kb-ingest`。识别校正循环已写 `official_knowledge` → 自动覆盖。

## 前端

### `/portal` → 新 "知识库" Tab（管理员）
- 列表 / 筛选（source_type / scope / shop / 是否含 chat scope）
- 手动 CRUD `manual` 词条
- 每条调权：scopes 复选（含 `chat`）+ weight 滑块
- "重建全部 / 重建某类" 入队按钮
- 队列状态 + 失败重试
- 子页 "运营 OKR" CRUD

### 生成页 & BOOMER 浮标
- 顶部小徽章 `🧠 已参考 N 条品牌知识` → 展开列表（标题 / source_type / 相似度）。
- 任一输出 / BOOMER 回复右下：`★ 加入知识库` → `kb-accept`，选 scopes（默认全勾）。

## 实施顺序

1. Migration：`kb_documents` / `kb_ingest_queue` / `operation_okrs` + RLS + GRANT + HNSW + `match_kb` + 触发器。
2. Edge：`kb-embed` → `kb-ingest`(+backfill) → `kb-search` → `kb-analyze-asset` → `kb-accept`。
3. 跑一次 backfill 把现有数据全部入库。
4. 改造 5 个 edge fn（含 `spirit-chat`）注入检索 + 返回 `__kb_sources`。
5. `/portal` 知识库 Tab + 运营 OKR Tab。
6. 生成页 & **BOOMER 抽屉对话气泡** 加 "参考来源" 徽章 + "加入知识库" 按钮。
7. `pg_cron` 每分钟跑 `kb-ingest`。

## 技术细节

- 模型：`google/gemini-embedding-001`，3072d，走 `LOVABLE_API_KEY`。
- Chunk：≈800 字符 / 重叠 100；中文按 `。！？\n` 优先切；title 始终重复在 chunk 头。
- 检索：k=6，min similarity 0.55；BOOMER chat 场景再加最近 3 条 user message 拼成检索 query，避免上下文丢失。
- 成本：content_hash 不变跳过 re-embed。
- 隐私：店员侧 `kb-search` 强制注入 `shop_id`；私有识别历史不入库（仅 admin 沉淀的进库）。
- 失败：`kb_ingest_queue.error` 红标 + 手动重试。

## 不在本次范围

- 多模态以图搜图（保留扩展位 `gemini-embedding-2`）。
- 跨店员私有历史共享。
- 微调专属基座模型（先做 RAG，等量足了再评估）。
