# 让"AI 修改"对话也能换主图

## 现状（为什么截图里 AI 答应了却没换图）

`AiKnowledgeDialog.tsx` 的 `send()` 里：

```ts
if (newPrompt && newPrompt !== coverPrompt && !coverUrl) {
  void triggerCover(newPrompt);
}
```

只有"当前没封面"才会真的画。已存在封面（你这条大仓陶园 OKURA 已经有图）→ 即便 AI 回复"我将为主图寻找一个具有代表性的封面"，前端也直接跳过，所以"答应了不动手"。

而且 `generate-official-knowledge` 的 system prompt 默认让 AI **不返回** `cover_prompt`，只在外观字段变化时才给 → 用户单独说"换主图"时 AI 经常根本不给 prompt。

## 目标

在"AI 修改"聊天里，用户用自然语言说"换主图 / 重画封面 / 找一张更代表性的图 / 主图换成日式茶杯"等，系统应该：

1. 识别这是"换封面"意图。
2. 让 AI 这一轮**强制返回 cover_prompt**（可结合用户的描述）。
3. 前端**强制调用 `generate-knowledge-cover`**（即便已有封面），生成完即时替换并落库。
4. 整个过程在聊天气泡里有进度反馈：「正在生成新封面…」→「✅ 已更新主图，可在右侧预览」。失败时给出可重试按钮。

## 改动点

### 1. `src/components/admin/AiKnowledgeDialog.tsx`
- 新增 `wantsCoverRedraw(text)`：用关键字匹配（封面 / 主图 / 换图 / 重画 / 重新生成 / 换张图 / 找一张 / cover）。
- `send()` 里：
  - 调 `generate-official-knowledge` 时多带一个 `forceCover: true` 字段（仅当意图命中）。
  - 拿到响应后：
    - 命中意图 → 即便 `coverUrl` 已存在，也调用 `triggerCover(newPrompt || coverPrompt)`；生成成功后立刻 `update official_knowledge.cover_url` + `onSaved()`，并在聊天里追加一条 assistant 气泡「✅ 已更新主图」。
    - 未命中 → 维持现在逻辑（仅无封面时才画）。
- `triggerCover` 增加可选参数 `{ persist?: boolean }`，命中意图时 persist=true 直接落库。
- 失败时聊天追加「主图生成失败，[重试]」按钮（点了重新调用）。
- 在快捷按钮区加一颗「换主图」chip，点了填入示例文本「主图换一张更有代表性的，重点突出 …」。

### 2. `supabase/functions/generate-official-knowledge/index.ts`
- 接收 `forceCover` 参数。
- 当 `forceCover === true`：在 chatMessages 末尾追加一条 system 指令：「本轮用户希望更换封面，请**必须**返回 cover_prompt，按封面铁律来写；其他字段除非用户提到，否则不要改。」
- tool schema 不动（`cover_prompt` 仍可选，但通过 system 指令强制本轮一定给）。

### 3. UX 文案
- HELLO_EDIT 例子里加一条："想换主图就说『主图换成 XX 风格』或『重画封面』"。

## 不在范围
- 不改一键丰富流程。
- 不改 `KnowledgeRichEditDialog`（基础表单编辑里仍是 URL 直填）。
- 不改 `OfficialDetail` 上的入口按钮（继续走 `Wand2` → `AiKnowledgeDialog`）。

## 技术细节

- 关键字匹配（不区分大小写）：`/(主图|封面|换图|换张图|重画|重新生成|找[一张]*图|cover)/i`。
- `triggerCover` 成功后：
  ```ts
  setCoverUrl(url);
  if (editingItem) {
    await supabase.from('official_knowledge').update({ cover_url: url }).eq('id', editingItem.id);
    onSaved();
  }
  ```
- 失败保留原 `coverUrl`，只 toast + 聊天气泡提示，不破坏其他字段。
- 与"一键丰富"互斥：丰富中禁止单独换图按钮（已有 `enrichStage` 状态可用）。
