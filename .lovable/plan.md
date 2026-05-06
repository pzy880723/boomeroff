# 联网取真实图 + 底款图

## 目标
- 新增知识卡时，先**联网搜真实商品图**（图集 + 底款），AI 仅作兜底。
- 所有商品都尝试一张「底款（背面/底标）」图，独立字段，详情页单独展示。

## 1. 数据库
- `official_knowledge` 新增字段：
  - `backstamp_url text` — 底款图 URL
- 不动 `gallery / cover_url`。

## 2. 联网搜图通道
- 接入 **Firecrawl 连接器**（`standard_connectors--connect firecrawl`）。
- 新建 edge function `web-search-images`：
  - 入参：`{ query, intent: 'gallery' | 'backstamp', limit }`
  - 走 Firecrawl `/v2/search`：`scrapeOptions.formats=['links','html']`，对结果页提取 `<img>` 真实大图（过滤 favicon/广告/小图、限制白名单/过滤敏感站）。
  - 对 backstamp 自动追加 query 后缀：`底款 OR backstamp OR mark OR 銘 OR 底部`。
  - 返回 `{ images: [{url, source, width?, height?}] }`，按尺寸/相关度排序。
  - 超时 8s，失败返回空数组（不抛错），让上游兜底。

## 3. 生成流程改造（`AiKnowledgeDialog` + `enrich-knowledge-core`）
当 AI 拿到 `name` 后，并行：
1. **封面 cover_url**：先调 `web-search-images(query=name, intent=gallery, limit=1)`；命中→用真实图；未命中→现有 `generate-knowledge-cover` AI 生成。
2. **图集 gallery**（目标 3 张）：`web-search-images(query=name, limit=6)` 取前 3 张真实图；不足 3 张时，剩余位用 `generate-knowledge-cover` AI 角度图补齐。
3. **底款 backstamp_url**：`web-search-images(query=name, intent=backstamp, limit=1)`；命中→存真实图；**未命中时不 AI 生成**（底款 AI 画不准，宁缺毋滥），前端显示「暂无底款图」。

所有真实图统一通过 `download → upload 到 product-images bucket` 落地，避免外链失效（新增小工具函数 `mirrorRemoteImage`）。

## 4. 前端
- `AiKnowledgeDialog` PreviewCard：
  - 图集行旁标注每张来源（真实/AI）。
  - 新增「底款」一栏：显示 `backstamp_url` 或「暂无底款图」+「重新搜底款」按钮。
- `OfficialDetail.tsx`：在图集下方新增独立「底款」区块，点击可放大；无底款则不显示该区块。

## 5. 配置 & 安全
- Firecrawl 通过连接器注入 `FIRECRAWL_API_KEY`，仅在 edge function 中使用。
- `web-search-images` 需登录调用（校验 JWT）。
- 加简单内存限流（每用户 10 req/min）。

## 技术细节
- 图片过滤规则：宽高 ≥ 400、非 svg/gif、URL 不含 `sprite|icon|logo|avatar`。
- 镜像存储路径：`official/{id}/gallery-{n}.jpg`、`official/{id}/backstamp.jpg`。
- 失败降级顺序：真实图 → AI（仅封面/图集）→ 留空（仅底款）。

## 文件改动
- 新建：`supabase/functions/web-search-images/index.ts`
- 改：`supabase/functions/enrich-knowledge-core/index.ts`、`src/components/admin/AiKnowledgeDialog.tsx`、`src/pages/OfficialDetail.tsx`
- 迁移：加 `backstamp_url` 列
- 连接器：Firecrawl
