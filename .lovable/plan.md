## 问题定位

数据库里 `香兰社 KORANSHA` 的 `body` 字段是 **NULL**，所以详情页的「深度阅读」卡片不出现。

**为什么会缺失：**
- 普通对话生成走的是 `generate-official-knowledge` 这条边缘函数。它的 system prompt 里**明确写着「默认不要返回 body 长正文，除非用户明确说要改正文」**（index.ts 第 167 行）。
- 这条规则是为了节省 token、加快多轮对话用的。
- 而真正会写长正文的只有两个入口：
  1. 编辑模式下的「✨ 一键丰富」按钮（依次调 core → body → cover）。
  2. 用户在对话里**显式**说「写一段长正文 / 加深度阅读」，AI 才可能返回 body。
- 香兰社这条只走了普通生成 + 保存，没有触发 body，所以保存到库里 body=NULL，详情页自然就没有「深度阅读」。

## 方案

让"完整生成"必然产出 body，无需用户记得点二次按钮。两步改动，只动前端 `AiKnowledgeDialog.tsx`：

### 1. 保存时，如果 `draft.body` 为空，自动补写一次长正文

在 `save()` 里、调用 update/insert 之前：
- 如果 `draft.body` 为空且 `draft.name` 已就绪，先 `supabase.functions.invoke('enrich-knowledge-body', { body: { coreDraft: draft } })`，拿到 body 后写入 payload。
- 出错只 `toast.warning` 不阻断保存（保持现在的"核心字段优先落库"原则）。
- 给保存按钮加一个"正在补写正文…"的中间态文案，让用户知道在等什么。

### 2. 新建模式也暴露「一键丰富 / 写深度阅读」按钮

目前 `isEdit` 才显示一键丰富面板。改成：
- 非编辑模式下，当 `draft.name` 已生成，显示一颗轻量按钮 **「补写深度阅读」**，点击后只调 `enrich-knowledge-body` 把 body 灌进 `draft`，不落库（保留用户预览后再保存的工作流）。
- 这样用户能看见进度、能预览，再决定保存。

### 3. （可选小修）针对香兰社这条历史数据

不写代码迁移；保存方案 1 上线后，管理员在「官方知识」列表里点开香兰社 → 用「AI 修改」对话框 → 点「✨ 一键丰富」即可补 body。或者干脆在新方案下点一次"保存修改"，自动补写流程也会跑。

## 不动的部分

- `generate-official-knowledge` 系统提示保留"对话默认不回吐 body"的策略（这是为了对话轮次快）。
- `OfficialDetail.tsx` 的「深度阅读」卡片渲染逻辑不动。
- 数据库结构、RLS 不动。

## 受影响文件

- `src/components/admin/AiKnowledgeDialog.tsx`（save 流程 + 新建模式按钮）
