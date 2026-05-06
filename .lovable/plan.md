## 问题诊断

当前一键丰富会卡死的根因（已在网络日志验证）：

1. **单次调用太重**：`generate-official-knowledge` 用 `gemini-2.5-pro` 一次性产出 7 个结构化字段 + 800字 body + 封面 prompt，模型实际耗时常常 60–120 秒，超过网关/浏览器等待，前端表现为 `Failed to fetch`。
2. **封面串在后面**：即使主体生成成功，再串一次封面又要 30–60 秒，整体时间继续叠加。
3. **进度条是假的**：纯前端按目标值平滑爬，没有真实节点反馈，一旦后端慢就显得"卡住"。

## 解决方案

### 1. 后端拆分为三个轻量函数

新增/拆分 edge function，每个只做一件事，单次都能在 10–25 秒内返回：

- **`enrich-knowledge-core`**（新建）  
  模型：`google/gemini-2.5-flash`  
  只产出：`name / category / ip_name / era / origin / summary / one_liner / aliases / pronunciation / quick_facts / customer_pitches / selling_points / comparisons / tips / importance_score / cover_prompt`。  
  典型耗时 5–12 秒。

- **`enrich-knowledge-body`**（新建）  
  模型：`google/gemini-2.5-pro`（正文质量优先）  
  入参：上一步产出的 core draft；只产出 `body`（≥800字 markdown，强制 6 个二级标题）。  
  典型耗时 20–40 秒，独立调用不会拖累其它步骤。

- **`generate-knowledge-cover`**（已存在，沿用）  
  仅当 `editingItem.cover_url` 为空时才调用。

> 现有 `generate-official-knowledge`（聊天用的"AI 修改"）保持不变，这次只为一键丰富新建专用函数。

### 2. 前端编排（在 `AiKnowledgeDialog.tsx` 的 `oneClickEnrich` 改写）

真实的 5 段式进度，每段都有真实事件驱动：

```
collect    0% → 10%   读取 itemToDraft
core      10% → 45%   await enrich-knowledge-core
body      45% → 80%   await enrich-knowledge-body
cover     80% → 92%   仅当无封面时调 generate-knowledge-cover；有封面直接跳过
save      92% → 100%  写回 official_knowledge
```

进度条 `STAGE_TARGET` 改为对应阶段的真实终点，每步完成就立刻把进度置到该阶段终点（去掉只靠定时器爬升的假动效，但保留小步缓动 100ms 让数字平滑）。

### 3. 自动重试一次

封装一个小工具：

```ts
async function withRetry<T>(fn: () => Promise<T>, label: string) {
  try { return await fn(); }
  catch (e) {
    console.warn(`[${label}] retry once`, e);
    await new Promise(r => setTimeout(r, 800));
    return await fn();
  }
}
```

`core / body / cover` 三步都用 `withRetry` 包起来，仍失败才 toast 报错并 `resetEnrich()`。

### 4. 失败/取消的 UX

- 任意步失败：toast 显示失败的阶段（"内容生成失败"/"正文生成失败"/"保存失败"），进度条变红 800ms 后回到 idle。
- 进行中再次点击按钮：已禁用，无副作用。
- `body` 步骤可选给一个 60 秒前端兜底 `AbortController`，超时则按失败处理。

## 受影响文件

```text
supabase/functions/enrich-knowledge-core/index.ts   新建
supabase/functions/enrich-knowledge-body/index.ts   新建
src/components/admin/AiKnowledgeDialog.tsx          改 oneClickEnrich + 阶段定义
```

## 验收

- 在当前 `/library/1da84972-...` 词条点"一键丰富"，每段进度都能看到真实推进，core 一般 10 秒内、body 一般 30 秒内完成。
- 已有封面时跳过 cover，整体可在 ~40 秒内结束。
- 强制断网模拟一次失败，看到自动重试日志后成功；持续失败则 toast 并重置进度。
