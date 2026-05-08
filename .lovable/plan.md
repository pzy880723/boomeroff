## 目标
识图结果里去掉「张口就讲」（opener / highlight / story）这一整张大卡和顶部「深度故事补充中…/已补充深度故事」徽章；工艺信息之后**直接接「一句话讲给客人」(KnowledgeCardSections)**。

## 改动点

### 1. `src/components/recognition/ProductDetailCard.tsx`
- 删除整块「张口就讲」Card（≈ 行 277-336，含 opener/highlight/story/复制全文/朗读按钮）。
- 删除顶部 pipeline 徽章里的两块：
  - `result.isEnriching` 时的「深度故事补充中…」徽章
  - `enriched?.story` 时的「✨ 已补充深度故事…」徽章
  保留 `pipelineBadge` 主徽章（缓存/AI/耗时）。
- 顶部那个保留单独的「知识卡补充中」状态：复用 `KnowledgeCardSections` 自带的 loading 占位即可（它已经支持），不需要单独徽章。
- `pitch / copyAll / speakText / isSpeaking / speak / stop / copied / Copy / Check / Quote / Volume2 / VolumeX` 等只为「张口就讲」服务的变量/import，如果没有别处引用，一并清理掉避免 lint 报错。
- ShareMenu 里 `pitch?.highlight || pitch?.story` 改为优先用 `enriched?.one_liner`，没有就用 `description`。

### 2. `supabase/functions/enrich-recognition/index.ts`
- 从 `submit_enrichment` schema 的 required 中移除 `story / highlight`（保留富知识卡字段为必填：`one_liner / quick_facts / customer_pitches / comparisons` + `selling_points_rich`）。
- 把 `story / highlight / objection / memory` 字段改为可选（或干脆删掉），系统提示里删除 story 长度/口吻要求，专注产出知识卡。
- 缓存命中条件由 `cached?.story && cached?.one_liner` 改为只看 `cached?.one_liner`。
- 解析后 `if (!parsed?.story)` 改为 `if (!parsed?.one_liner)`，否则视为失败。
- 调小默认模型描述里的字数要求；可继续保留 `google_search` 工具供模型核实数据。

### 3. `src/components/dashboard/LiveStreamPanel.tsx`
- 注释「后台触发深度故事补充」相关注释统一改为「后台触发知识卡补充」。逻辑代码不动（继续调 enrich-recognition，只是返回的是知识卡，不再含 story）。

## 不动
- 数据库结构、`ai_analysis.enriched` JSON 形状（仅历史 story 字段不再生成，旧数据自然过期）。
- 官方知识卡 / 个人知识库的「深度阅读 body」与本次无关，不动。
- 卖点 (`selling_points` / `selling_points_rich`)、tips、speech 朗读功能在 KnowledgeCardSections 中本来就有保留。
