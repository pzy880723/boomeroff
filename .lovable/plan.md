## 诊断:为什么视频跟脚本完全没关系

`supabase/functions/render-marketing-video/index.ts` 里的 `buildPrompt`(15–34 行)读的是 `script.hook.visual` / `scene.visual` / `script.hook.line` —— 这些字段**根本不存在**。

实际脚本(由 `generate-marketing-video-script` 生成)用的是:
- `hook.video_prompt`(英文画面) + `hook.text`(中文字幕)
- `scenes[i].video_prompt` + `scenes[i].text`
- `outro.video_prompt` + `outro.text`

所以发给 Seedance 的 prompt 实际上只有「主题:xxx。风格:xxx。」其余全空,模型只能完全自由发挥 → 跟脚本无关。

## 改造方案

### 1. 修 prompt 拼装(`render-marketing-video/index.ts`)
- 把 `visual` → `video_prompt`、`line` → `text` 字段名修正。
- 新 prompt 结构(按 Seedance 偏好的英文为主、中文字幕只作参考):
  ```
  Style: <style_en>. Aspect ratio: 9:16. Total duration: 15s.
  Opening (2s, push-in): <hook.video_prompt>
  Scene 1 (3s, pan): <scenes[0].video_prompt>
  Scene 2 (3s, hold): <scenes[1].video_prompt>
  ...
  Ending (2s, hold): <outro.video_prompt>
  Overall narration cues (Chinese subtitles, do not render text in video unless needed): "钩子 / 镜头1 / 镜头2 / 收尾"
  Tone: <style_en>, cinematic, brand BOOMER·OFF vintage shop.
  ```
- 字符上限保留 ~480。把 `style` 同步翻译成英文形容词丢进 prompt(`lively/energetic/calm/elegant/playful/cinematic-steady`)。
- 同时在 prompt 顶部明确「严格按以下分镜顺序与时长执行,不要添加/删减镜头」。

### 2. 新增视频风格选项(`MarketingVideo.tsx` + `_shared/brand-context.ts` presets)
新增前端 Chip 组:
| key | 中文 | 英文映射(送给 Seedance) |
| --- | --- | --- |
| lively | 活泼 | lively, snappy cuts, bright color, upbeat |
| energetic | 激动 | energetic, fast push-ins, high contrast, dynamic motion |
| steady | 稳重 | calm steady cam, soft warm light, slow pace |
| elegant | 优雅 | elegant, minimal, slow cinematic dolly, muted palette |
| nostalgic | 怀旧 | nostalgic, film grain, warm tungsten, gentle drift |
| playful | 俏皮 | playful, whimsical micro-motion, pastel palette |

- 在「02 视频类型」下面加「05 视频风格」chip 组,默认 `steady`。
- `style` 一路透传:写到 `script.style`,提交渲染时 `body.style = script.style`(已经在传,但下面要让脚本生成器也吃)。
- `generate-marketing-video-script` 的 system prompt 加一段「整体风格基调:<style_label> — <english cues>」,让生成出来的 `video_prompt` 本身就贴合风格。

### 3. 新增「自然语言对话沟通 → 一键生成结构化脚本」(前置环节)

按 `chat-agent-ui-contract`:**一对话 + 无持久化**(每次开新视频任务就是一次新沟通,不需要历史)。我会以单次会话方式直接构建,不再追问。

#### 流程改造(`MarketingVideo.tsx`)

把页面 Step 改为 4 步:
```
01 立意聊 → 02 参考图(可选) → 03 确认分镜 → 04 渲染
```

「立意聊」区:
- 上半部分:风格 / 类型 / 时长 / 画幅 Chip(保留现有)。
- 下半部分:用 AI Elements `Conversation` + `Message` + `PromptInput` 做一个**轻量沟通框**(高度受限,放页面里,不弹窗):
  - 第一条 assistant 自动消息:「想拍什么?随便聊聊店面氛围、想突出的商品、想要的感觉。我会一步步帮你把分镜定下来。」
  - 用户和 AI 多轮对话,纯文本流式。
  - 顶部右边一个按钮「生成分镜脚本」,任何时候都可点;点击会把整个对话历史和 chips 一起送给脚本生成器。

#### 新 edge function `marketing-video-brief-chat`
- 流式聊天 endpoint,使用 AI SDK 的 `streamText` + `toUIMessageStreamResponse`(Lovable AI Gateway,模型 `google/gemini-3-flash-preview`)。
- system prompt:「你是 BOOMER·OFF 中古店视频策划助理。任务是和店员对话,弄清楚:1) 主要拍什么(商品/区域/事件) 2) 想给观众什么感觉 3) 有没有特别想入镜的画面 4) 是否有禁忌(不想露的东西)。每次回复要简短(<60 字),主动追问 1 个问题。当信息够时,主动提示『可以生成分镜了』。不要输出脚本本身,脚本由后续步骤生成。」
- 输入 `messages: UIMessage[]` + chips 上下文(类型/时长/画幅/风格)。

#### `generate-marketing-video-script` 升级
- 接受新字段 `brief_transcript: string`(把对话拼成一段文本) 与 `style`。
- system prompt 多一段:「以下是店员和策划助理刚刚的沟通记录,请基于它生成分镜。整体风格基调:<style 英文 cues>。」
- 现有 `topic/highlight` 字段保留作为兜底,允许为空(因为信息现在主要来自对话)。

#### 前端组件拆分
- 新组件 `src/components/marketing/VideoBriefChat.tsx`:封装 AI Elements `Conversation/Message/PromptInput`(若未安装则 `bun x ai-elements@latest add conversation message prompt-input shimmer` —— 实现阶段执行)。本地 `useState<UIMessage[]>` 保存,**不入库**。
- `MarketingVideo.tsx` 改写:
  - 顶部 chips(类型/时长/画幅/**风格**)。
  - 中部 `<VideoBriefChat />` + 右上「生成分镜」按钮。
  - 已有的「参考图(可选)」「分镜确认」「渲染入队 + 跳素材库」逻辑保持。

### 4. 渲染调用同步带上 style
- `confirmRender` 已经在 body 里没传 style,需要新增 `body.style = script.style`。
- 渲染端 `buildPrompt(script, body.style || script.style)`。

### 5. 不做的事
- 不持久化对话(用户没要求,符合 chat-agent-ui-contract 的"无持久化"路径)。
- 不改 polling、不动 Seedance 任务字段、不改 `marketing_assets` schema。
- 不重做"派生文案"功能,保持上一轮提案不变(若已实现继续保留)。

## 验收
1. 在 `/me/marketing/video` 能先和 AI 聊几句再点「生成分镜」。
2. 分镜里的英文 `video_prompt` 明显呼应聊天里的细节。
3. 渲染出来的视频画面、节奏、色彩跟所选风格一致(活泼/稳重等区分明显)。
4. Edge function 日志里 `[render] ark request` 的 `promptLen` 应 > 200,不再只剩主题。
