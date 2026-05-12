# 修复"官方新知识 AI 生成主图缺失 + 重新生成崩溃"

## 现象
1. 在管理员后台 `OfficialKnowledgeManager` → 「AI 生成」打开 `AiKnowledgeDialog`，输入名称后系统会自动跑 `oneClickEnrich`，但常常没有生成主图。
2. 预览卡上点击主图区域的「重新生成」按钮后页面卡死/崩溃。

## 根因
**主图缺失**（`src/components/admin/AiKnowledgeDialog.tsx` 中 `oneClickEnrich` 第 540–571 行 + edge function）：
- 封面步骤完全依赖两个来源：`webSearchImages(name)` 联网真实图，或 `coreData.cover_prompt` + `generate-knowledge-cover`。
- `enrich-knowledge-core` 的 system prompt 没有强制 `cover_prompt`，模型经常省略不返回；同时 Firecrawl 联网搜图在很多商品名上返回空。两边都拿不到 → 直接静默跳过封面，所以"没有主图"。
- 没有任何兜底：从 `name + category + era + origin` 自己拼一个安全的英文 prompt 喂给 `generate-knowledge-cover`。

**重新生成崩溃**（`src/components/admin/AiKnowledgeDialog.tsx` `triggerCover` 第 185–218 行 + `supabase/functions/generate-knowledge-cover/index.ts`）：
- `triggerCover` 在异常 catch 里执行 `'封面生成失败：' + (e?.message ?? '')`。当 `supabase.functions.invoke` 返回的 `FunctionsHttpError` 没有 `message` 属性、或其 `context` 含循环引用 / Response 对象时，进一步与字符串拼接或被 React 当 children 渲染会触发未捕获错误，让整个 Dialog 树崩掉。
- edge function 文件里有一段死代码（line 142 之后第二个 `if (!dataUrl?.startsWith("data:image/"))` 引用了未定义的 `data` 变量），虽然当前路径不会执行到，但是埋雷；同时 502 错误把英文 + 中文混合返回，当客户端二次封装时容易把整个 Response/JSON 当作 message。
- 该按钮也没有把 button 包在 try/catch 之外的状态机里：`setPainting(true)` 后若 `triggerCover` 有同步抛出（例如 `coverPrompt` 未通过闭包更新而是 `null`），`finally` 仍会 reset，但中间任何 `setMessages` 拼接 `e?.message` 渲染失败则会让整个 React 树报错。

## 修复方案

### 1. `src/components/admin/AiKnowledgeDialog.tsx`
- **加封面 prompt 兜底函数** `buildFallbackCoverPrompt(draft)`：根据 `name / category / era / origin / summary` 拼一段中性、去品牌化的英文 prompt（结尾固定 "on plain white background, soft natural light, centered, photorealistic, no text, no watermark, no logo"）。
- **改 `triggerCover`**：
  - 永远先确保 `prompt` 非空，否则用 `buildFallbackCoverPrompt(draft)` 兜底。
  - catch 里把 `e` 安全地转成 string（`e instanceof Error ? e.message : (typeof e === 'string' ? e : '请稍后重试')`），不再直接拼任何对象到 `setMessages`。
  - 加按钮级别的防抖：`if (painting) return;` 防止快速连点。
- **改 `oneClickEnrich` 的 cover 段（约 539–571 行）**：
  - 计算 `coverPromptToUse = newPrompt || buildFallbackCoverPrompt(coreDraft)`。
  - 联网无果时一定走 `generate-knowledge-cover` 兜底；若仍失败，弹一条非阻塞 toast 而非静默吞掉。
- **改"重新生成"按钮渲染条件（约 976–984 行）**：
  - 改成 `!painting`（去掉对 `coverPrompt` 的判断），让没有 `coverPrompt` 时也能点；点击时用 `coverPrompt || buildFallbackCoverPrompt(draft)`。
  - 同时把按钮包到一个 `<ErrorBoundary>` 不必要的话至少 wrap 在 `onClick={async () => { try { await triggerCover(...) } catch {} }}`，防止 promise rejection 冒泡。

### 2. `supabase/functions/generate-knowledge-cover/index.ts`
- **删掉第二段死代码** `if (!dataUrl?.startsWith("data:image/"))` 块（引用未定义 `data`）。
- **统一错误返回结构** `{ error: string }`，并把 502 文案精简为单句中文（避免客户端误把整段 JSON 当 message）。
- **加 8s + 12s 两次更短超时**：当前 attempts 串行最坏要打 3 个 image API 全跑完才返回，可能超过 Edge Function 30s 限制。改成 `AbortController` + `Promise.race` 给每次 attempt 设 12s 超时，确保整体 ≤30s 内必返回。
- 仍然返回 200/`{ url }` 或 4xx-5xx/`{ error }`，客户端无需改动。

## 验收
1. 新建一条新词条（例如「香兰社咖啡杯」），自动跑完一键丰富后封面区域应有图（联网或 AI 兜底）。
2. 主图存在/不存在两种情况下点「重新生成」都能正常 toast / 更新，不再让 Dialog 崩溃。
3. Edge function 日志里可以看到 `Image succeeded on attempt: ...` 或单一 502 错误，不会出现 ReferenceError。
