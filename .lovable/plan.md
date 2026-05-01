## 问题诊断

截图里 AI 回复里出现了一大段 `"description": "..."`、`"tips": "..."`、`"confidence": 0.5` 这样的原始代码，**不是 bug，而是设计缺陷**：

当前 `refine-recognition` 的 system prompt 要求 AI 每次都输出两部分：
1. 一段 ≤80 字的中文说明
2. 一个完整的 ` ```json ... ``` ` 代码块（用来给前端解析成新结果）

前端 `RefineDialog` 用 `ReactMarkdown` 把整段都渲染出来 → JSON 代码块也被原封不动显示给主播看。主播看到的就是"一堆代码"，体验非常差。

## 修复方案

**核心思路**：JSON 是给机器解析的，不该让用户看到。让 AI 还是输出 JSON（前端需要它来更新结果），但**渲染时把 JSON 代码块剥离掉，只显示自然语言部分**。

### 1. 改 `RefineDialog.tsx` 渲染逻辑
- 新增一个 `stripJSONBlocks(text)` 函数：
  - 移除所有 ` ```json ... ``` ` 代码块
  - 兜底：移除裸露的顶层 `{...}` 块（针对 AI 偶尔忘了加 fence 的情况）
  - trim 多余空行
- 渲染 assistant 消息时用 `stripJSONBlocks(m.content)` 而不是原文
- `extractJSON(acc)` 保留不变 —— 解析仍用原始累积文本，新结果照常显示在底部绿色卡片里
- 流式过程中如果剥离后为空（说明 AI 还在吐 JSON），显示"AI 正在整理结果…"占位，避免闪烁

### 2. 加固 system prompt（`refine-recognition/index.ts`）
- 明确要求："自然语言说明在前，JSON 代码块在后，两者之间空一行"
- 加一句："JSON 仅供系统解析，不要在自然语言里复述 JSON 字段名或大括号内容"
- 避免 AI 在说明里也夹一堆 `"name":`、`"era":` 这种字符串

### 3. 顺手优化（小）
- 流式输出过程中，如果检测到正在输出 JSON（出现 ` ```json `），自动把后续内容先缓存不渲染，等流结束再剥离展示
- pendingResult 卡片已经把新结果以人话展示出来了，所以彻底不显示 JSON 是安全的

## 不改的部分

- `extractJSON` / `jsonToResult` / `submit-correction` 不动 —— JSON 解析链路本来就没问题
- 中古圈手动分享逻辑、纠错入库逻辑都不动

## 涉及文件

- `src/components/recognition/RefineDialog.tsx`（核心改动：渲染前剥离 JSON）
- `supabase/functions/refine-recognition/index.ts`（prompt 微调，要求格式更稳定）

修完后，主播看到的会是一句人话（例如"我把品类从青花改成了九谷烧赤绘，因为底款是…，置信度提到 0.7"），底部绿色卡片显示新结果，下方按钮"应用新结果"，干净清爽。