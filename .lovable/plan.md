## 目标

在 `/portal` → 官方知识 标签页里，管理员点「新增」时，除现有的手动表单外，新增一个 **「AI 智能生成」** 入口：管理员用自然语言（或直接贴一张参考图）描述想要的中古商品/IP，AI 自动产出完整的官方词条字段，并自动生成一张封面图，管理员校对后一键入库。

## 用户流程

1. 进入 后台 → 官方知识 → 点「新增」旁的新按钮 **「AI 生成」**（Sparkles 图标）。
2. 弹出对话框，包含：
   - 多轮聊天区（默认欢迎语：「告诉我你想新增的商品，例如：昭和时期的伊万里烧小皿…」）
   - 输入框 + 可选「上传参考图」按钮
   - AI 回复后右侧实时渲染一张「待入库卡片」预览（名称/品类/IP/年代/产地/简介/卖点/小贴士/封面图）
3. 管理员可以继续追问让 AI 修改（「卖点再凝练一些」「换一张更素雅的封面」「改成大正时期」等），卡片字段会被增量更新。
4. 满意后点 **「保存到官方知识」**：直接 `INSERT` 进 `official_knowledge`，封面图先上传到 `product-images` bucket 再写 `cover_url`。
5. 关闭对话框后列表自动刷新。

## 技术实现

### 1. 新 Edge Function：`generate-official-knowledge`
- 路径：`supabase/functions/generate-official-knowledge/index.ts`
- 校验 JWT + admin 角色（复用 `has_role` 通过 service role 查 `user_roles`）。
- 入参：
  ```ts
  { messages: ChatMsg[], currentDraft?: Partial<Item>, referenceImageUrl?: string }
  ```
- 调用 Lovable AI Gateway，模型 `google/gemini-3-flash-preview`，使用 **tool calling** 强制结构化输出：
  ```ts
  tools: [{ type:'function', function:{ name:'upsert_knowledge', parameters:{ /* category/name/ip_name/era/origin/summary/selling_points[]/tips/cover_prompt + assistant_reply */ }}}]
  tool_choice: { type:'function', function:{ name:'upsert_knowledge' } }
  ```
- System prompt：要求基于中古杂货背景、用简体中文（遵守"不使用主播称谓"core rule）、`selling_points` 3–5 条短句、`cover_prompt` 是一句英文图像描述（用于 nano banana）。
- 返回：`{ reply: string, draft: Partial<Item>, coverPrompt: string }`。

### 2. 新 Edge Function：`generate-knowledge-cover`
- 调用 `google/gemini-2.5-flash-image`（nano banana），`modalities:["image","text"]`，将返回的 base64 解码上传到 `product-images/official-covers/{uuid}.png`，返回 public URL。
- 单独拆分是因为图像生成 5–10s，不阻塞文本对话。前端在 AI 文本回复落地 + 拿到 `coverPrompt` 后并行触发本函数，封面以「生成中…」骨架显示，完成后无缝替换。
- 同时支持「重新生成封面」按钮（带额外 prompt 微调）。

### 3. 前端：`src/components/admin/AiKnowledgeDialog.tsx`（新文件）
- Dialog（max-w-3xl，左右两栏，移动端纵向堆叠）
  - 左：聊天记录 + 输入框 + 「上传参考图」（直接转 base64 传给 edge function 作为 user message 的 image_url）
  - 右：实时预览的 `OfficialKnowledgeCard`（名称、品类徽章、IP、年代·产地、简介、卖点列表、小贴士、封面图带骨架/重新生成按钮）
- 状态：`messages`, `draft`, `coverUrl`, `isThinking`, `isPaintingCover`
- 操作：
  - 「保存到官方知识」→ `supabase.from('official_knowledge').insert(draft)`，成功后 `onSaved()` 触发列表刷新并关闭。
  - 「弃用并改回手动表单」→ 关闭本弹窗，打开原 `OfficialKnowledgeManager` 的手动 Dialog（带预填）。

### 4. 接入 `OfficialKnowledgeManager.tsx`
- 在「重算重要程度」与「新增」之间加按钮：
  ```
  <Button size="sm" variant="outline" onClick={()=>setAiOpen(true)}>
    <Sparkles className="w-4 h-4 mr-1.5" /> AI 生成
  </Button>
  ```
- 引入 `<AiKnowledgeDialog open={aiOpen} onOpenChange={setAiOpen} onSaved={load} />`。

### 5. 存储
- 复用现有公开 bucket `product-images`，新增前缀 `official-covers/`。无需建新 bucket。
- 不新建数据表；直接写入 `official_knowledge`（字段已齐备）。

## 文件清单

新增：
- `supabase/functions/generate-official-knowledge/index.ts`
- `supabase/functions/generate-knowledge-cover/index.ts`
- `src/components/admin/AiKnowledgeDialog.tsx`

修改：
- `src/components/admin/OfficialKnowledgeManager.tsx`（加入 AI 入口按钮 + dialog 挂载）

## 不在本次范围

- 不改动手动新增/编辑流程，保持作为兜底。
- 不引入图像编辑（如根据参考图改图）—— 仅支持参考图作为「文本理解辅助」。如后续需要可加 `--edit-image` 类逻辑。
- 不批量导入。
