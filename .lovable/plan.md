
# 视频策划对话改成「点选项」

## 痛点
现在 `VideoBriefChat` 每次 AI 追问一个问题,店员都要打字回答。问题一多就累。

## 改造方案
让 AI 在追问时**同时返回 2-4 个可点选项**,店员点一下就当作回答发出去;不想用选项还可以继续打字或多选。

### 1) Edge Function `marketing-video-brief-chat`
- 改成让 AI 输出 JSON:`{ "reply": "一句问话", "options": ["选项A","选项B","选项C","其他(我自己说)"], "done": false }`。
- `done: true` 时表示信息够了,不再给选项,提示去点「让 AI 写一版完整脚本」。
- 选项铁律写进 system prompt:
  - 每轮 2-4 个,每个 ≤ 12 字,口语化、互斥、覆盖常见答案。
  - 最后一项总是「其他(我自己说)」给打字留口子。
  - 已经答过的维度不再追问。
- `draft_script` 模式不变,仍返回纯文本脚本。
- 用 Lovable AI Gateway 的 `response_format: { type: "json_object" }` 拿稳 JSON;解析失败时降级成纯文本(没选项)。

### 2) 前端 `VideoBriefChat.tsx`
- `BriefMsg` 增加可选 `options?: string[]`(只挂在最近一条 assistant chat 消息上)。
- 在最近一条带 `options` 的 assistant 气泡下方渲染一排 chip 按钮:
  - 点一下 → 把该选项文本当作 user 消息 `send(optionText)`,清掉旧 options,继续下一轮。
  - 点「其他(我自己说)」→ 不发消息,聚焦输入框让店员打字。
- 输入框依然保留(打字仍可用),但默认状态下店员可以全程只点。
- `reset` / `draft_script` 走原逻辑;`draft_script` 消息不带 options。

### 3) 不动的部分
- 数据库、表结构、RLS、其它页面、`marketing-video-brief-chat` 的 shop_id / image_descriptions 注入逻辑都不动。
- 脚本生成、分镜、图片选择全部不变。

## 涉及文件
- `supabase/functions/marketing-video-brief-chat/index.ts`
- `src/components/marketing/VideoBriefChat.tsx`

## 预期效果
店员从「读问题 → 打字 → 发送」变成「读问题 → 点一下」,全程基本不用键盘也能把拍摄要点聊清楚。
