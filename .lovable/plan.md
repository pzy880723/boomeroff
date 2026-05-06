# 官方知识详情页：新增"AI 聊一聊"

让店员在「官方知识」详情页底部，能像识物结果页一样跟 AI 自由提问，深入了解这条词条（产地、价位、保养、与同类对比、客户常见疑问等）。**只问答、不改库**。

## 用户体验

- 详情页正文与"小贴士"之后、底部"收藏 / 来测一测"按钮之上，新增一张可折叠卡片：「💬 想多了解一点？跟 AI 聊一聊」。
- 点开是聊天界面（与 `InlineRefineChat` 同款风格但更简洁）：
  - 默认显示 3 个建议提问 chip：「客人嫌贵怎么回」「怎么辨真假」「跟 XX 怎么区分」（XX = 第一条 comparison 名）。
  - 输入框 + 发送按钮，回车发送。
  - 流式回复，Markdown 渲染。
  - 不支持上传图片（保持轻量；要识物去识别 tab）。
- 切换不同词条 / 离开页面 → 自动清空对话。
- 普通店员和管理员都能用。

## 技术方案

### 1. 新建 edge function：`supabase/functions/chat-knowledge/index.ts`
- 入参：`{ knowledgeId: string, messages: {role,content}[] }`
- 服务端用 service role 读取 `official_knowledge` 这条记录的全部字段（name/category/era/origin/summary/one_liner/quick_facts/customer_pitches/selling_points/comparisons/tips/body/content），拼成精炼上下文 system prompt。**不让客户端传 system / 知识内容**，避免越权或污染。
- 调用 Lovable AI Gateway，`google/gemini-3-flash-preview`，**stream: true**，按现有 `refine-recognition` 同款 SSE 直通模式返回。
- system prompt 要点：
  - 「你是日本中古杂货店的资深买手助理，正在帮店员深入理解 XXX 这条官方知识。」
  - 「严格基于以下卡片资料回答；超出资料的部分要明确说『资料里没写，仅供参考』。」
  - 「禁止使用『主播』，称呼对方『您』或『店员』，全程简体中文。」
  - 「回答 100-300 字，多用要点；如果店员问『怎么讲给客人』就给一句可直接念的话术。」
- 鉴权：要求登录用户即可（authenticated）；不需要 admin。
- 错误处理：429 / 402 / 其他失败按现有规范返回。

### 2. 新建组件：`src/components/library/KnowledgeChatPanel.tsx`
- Props: `{ knowledgeId, knowledgeName, suggestions?: string[] }`
- 内部状态：`messages`、`input`、`streaming`、`open`（折叠）。
- 调用方式：参考 `InlineRefineChat` 的 `fetch(${VITE_SUPABASE_URL}/functions/v1/chat-knowledge, ...)` SSE 解析逻辑（同样的 line-by-line + [DONE] 处理）。
- UI 用项目现有 `Card` / `Button` / `Textarea`、Tailwind 语义 token，与 `InlineRefineChat` 视觉一致但用 `bg-accent/20` 而非 amber 色（不是"警告"语义）。
- 助手消息 `ReactMarkdown` 渲染，用户消息纯文本。
- 第一条 assistant 欢迎语硬编码：`您好，我是「${knowledgeName}」的小助手，想知道什么直接问我吧～`。

### 3. 接入 `src/pages/OfficialDetail.tsx`
- 在小贴士 Card 之后、空内容兜底之前（或紧贴空内容兜底之前）插入：
  ```tsx
  <KnowledgeChatPanel
    knowledgeId={item.id}
    knowledgeName={item.name}
    suggestions={[
      '客人嫌贵怎么回？',
      '怎么辨真假？',
      comparisons[0] ? `跟 ${comparisons[0].name} 有什么区别？` : '保养有什么禁忌？',
    ]}
  />
  ```
- 因为底部有 fixed 操作条，详情页已有 `pb-32`，确保聊天卡完整可见。

## 不在范围
- 不改 `AiKnowledgeDialog`（那是管理员的编辑流程）。
- 不持久化对话（页面刷新 / 切词条即清空）。
- 不接入图片上传 / 工具调用 / 联网搜索。
- 不在「个人知识」详情接入（本期只做官方）。

## 文件清单
- 新建：`supabase/functions/chat-knowledge/index.ts`
- 新建：`src/components/library/KnowledgeChatPanel.tsx`
- 修改：`src/pages/OfficialDetail.tsx`（导入 + 渲染一处）
