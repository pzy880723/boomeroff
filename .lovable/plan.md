## 现状排查

- 「小红书文案」按钮在 **视频素材详情弹窗**（`src/components/marketing/AssetDetailDialog.tsx`）里，点击后调用 Edge Function `generate-marketing-video-copy`。
- 该函数用的模型 `google/gemini-3-flash-preview` 本身没停：AI Gateway 最近仍有大量成功调用，7 天内没有 error 记录。
- Edge Function 日志也没有该函数的最近日志（很可能上一次成功之后，前端调用直接失败或者报错被 toast 吃掉了）。
- 系统 prompt 硬性要求输出 `{title, body, hashtags, first_comment}` 里的 **hashtags 是数组**、**且首评单独字段**——`gemini-3-flash-preview` 现在偶发把 hashtags 塞进 body、或返回带 ```json 围栏但结构漂移，导致 `!cand.title && !cand.body` 或 JSON.parse 失败，前端就吐 "生成失败,请稍后重试"。

结论：不是模型下线，是**模型+这段 prompt 的稳定性问题**。同时用户希望这条文案是**全视频平台通用**，不是只喊小红书。

## 目标

1. 把这条"视频专用一键文案"从名字到 prompt 都做成「视频广告文案」——**抖音 / 小红书 / 视频号 / 快手 / B站 通用**。
2. 顺手把生成失败率降下来：换成 `response_format: json_object`，并做兜底解析。
3. 不动任何跟业务逻辑无关的东西（"AI 文案"页 `/me/marketing/copy` 保持不变，那是另一条链路，还在正常工作）。

## 改动清单

### 1. Edge Function：`supabase/functions/generate-marketing-video-copy/index.ts`

- **保留函数名**（前端和历史 job 都在调它），只改内部行为。
- 系统 prompt：
  - 定位改成"**视频广告文案**（抖音 / 小红书 / 视频号 / 快手 / B站 通用），要短平快、抓眼球、有 CTA"。
  - 措辞去掉"发帖""姐妹们唠嗑感"等强小红书感的硬性要求，改成"口语化、有情绪、有 hook、有 CTA"，并明确"emoji 适度，不做小红书那种堆砌"。
  - 字段不变（`title / body / hashtags / first_comment`），下游不用改。
- 请求体加 `response_format: { type: "json_object" }`，模型仍用 `google/gemini-3-flash-preview`（表现稳定、成本低）；解析继续保留正则兜底。
- toast/日志前缀从 `[video-copy]` 改成 `[video-ad-copy]` 便于以后追。

### 2. 前端：`src/components/marketing/AssetDetailDialog.tsx`

- 所有"小红书文案"字样改成"视频广告文案"：
  - 视频区块的 📕 Emoji + 标题（第 705 行附近）
  - loading 文案 / 空态文案（第 745 行附近）
  - 手动生成按钮文案（第 749 行附近）
  - toast 文案（第 410、736 行"小红书文案已生成 / 已复制"）
  - 顶部注释（第 250 行「视频专用:一键生成的小红书文案」→「视频专用:一键生成的视频广告文案」）
- Emoji 从 📕（小红书）换成 🎬（通用视频）。
- 逻辑、字段、接口签名一律不动。

### 3. 部署

- 部署 `generate-marketing-video-copy`。
- 前端不需要额外部署动作（用户日常改动的常规发布流程即可）。

## 不做的事

- **不改**「AI 文案」页（`/me/marketing/copy` → `generate-marketing-copy`），它还在正常工作、UI 也已经是"AI 文案"这个通用名。
- **不改**其它函数、DB schema、路由。
- **不换模型**——网关日志证明 gemini-3-flash-preview 稳定可用；换模型会引入新的 prompt 兼容问题。

## 验证

1. 打开一条已生成的视频素材详情 → 应自动触发一次"视频广告文案"生成，标题/正文/话题/首评四段齐全。
2. 点"重新生成视频广告文案"按钮 → toast 显示"视频广告文案已生成"。
3. 复制按钮 → toast "视频广告文案已复制,快去发布吧 ✨"。
4. Edge Function 日志出现 `[video-ad-copy]` 前缀调用记录且无 5xx。
