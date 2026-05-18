# 中古小精灵 · 升级方向清单

我把现在的小精灵从「数据 / 模型 / 交互 / 记忆 / 主动性 / 工具能力 / 安全」7 个维度过了一遍，列出可落地的优化点。你可以按需勾选，我再细化成具体改动。

---

## 1. 记忆与会话持久化（高价值 / 中成本）⭐
**现状**：`useSpiritChat` 只在前端 `useState` 里存消息，刷新就没了；后端每次都从 0 拼上下文。
**问题**：连续问"刚才那家店呢？""她明天呢？"会失忆；也没法做"我和小精灵聊过什么"回顾。
**改动**：
- 新表 `spirit_conversations` + `spirit_messages`（RLS：仅本人）
- 抽屉打开默认续上最近一条 thread，可"新建对话 / 历史"
- 后端只把最近 N 轮（如 20）入 prompt，老的滚动摘要

## 2. 工具调用（Tool Calling）化（高价值 / 中-高成本）⭐⭐
**现状**：所有上下文（14 天排班、经验、待办、知识库）**每次都塞 prompt**，token 浪费、信息噪音大、跨日期/跨人查询还是会编。
**改动**：把 spirit-chat 改写为 AI SDK `streamText + tools` 模式，提供工具：
- `query_schedule({ person?, shop?, date_from, date_to })`
- `query_my_stats()` / `query_pending_tasks()`
- `search_knowledge(query, top_k)`（接 official_knowledge + shop_kb）
- `search_history(query)`（自己识别过的商品）
- `whats_new()`（社区新动态）

效果：模型按需查、回答更准、prompt 更短更便宜，也能根治"梦梦今天在 728"这类幻觉。

## 3. 图片识别真正走 RAG（高价值 / 低成本）
**现状**：发图给小精灵只是把 image_url 丢给 gemini，**没有命中你自己的 official_knowledge / 私人识别历史**，等于浪费了项目最值钱的资产。
**改动**：上传后先调 `recognize-product`（或抽一个内部函数）拿到候选名 → 用名字去命中知识库 → 把"我们自己知识库里写的"作为 system 内插，再让小精灵用人话讲出来。

## 4. 主动播报 / 推送（中价值 / 中成本）
让小精灵从"问才答"变"会主动招呼"：
- 班前 30 分钟弹一句："今天 A 班和阿强一起，记得带胸牌～"
- 连续打卡断签前提醒
- 待审核纠错堆积 > 5 条提醒管理员
- 实现方式：`pg_cron` + edge function 写入 `spirit_nudges` 表，前端浮窗小红点

## 5. 模型与流式体验（低-中价值 / 低成本）
- 当前固定 `google/gemini-3-flash-preview`，把它接到 `app_settings.spirit_model`，让管理员在 /portal 切换（和识别模型一致的体验）
- 加 `temperature`、`max_tokens` 可调
- 前端流式：现在每个 chunk 都 setState，长回答时会卡 → 用 `requestAnimationFrame` 批量 flush
- 加"停止生成"按钮（hook 里 `stop` 已经有，UI 没暴露）

## 6. 多模态输出（中价值 / 低成本）
- 语音播报：复用项目里 `useSpeech`，给小精灵回答加"🔊 听一下"按钮
- 引用卡片：当回答涉及某条知识/某次识别/某位同事，渲染成可点击卡片跳转，而不是纯文本

## 7. 安全与成本护栏（必做 / 低成本）
- 速率限制：每用户每分钟 ≤ 10 条、每天 ≤ 200 条（写到 `app_settings`）
- 单条 prompt 字数上限、图片 ≤ 4 张已经有，加服务端二次校验
- 记录每次调用的 token 数到 `spirit_usage`，/portal 出一个用量图

---

## 技术细节（可跳过）

- 工具调用走 AI SDK `streamText({ tools, stopWhen: stepCountIs(50) })`，与 `connecting-to-ai-models-classic-stack` 推荐一致；目前 spirit-chat 是直连 gateway 原始 SSE，要换 `npm:ai` 的 UI message 流并升级前端 hook（或保留旧 SSE 但自己实现工具循环）。
- 记忆持久化的 RLS：`user_id = auth.uid()`，沿用现有 private-history 规则。
- 滚动摘要：每 20 条对话触发一次 `summarize-thread` edge function，把摘要写回 conversation.summary 字段，下次只发摘要 + 最近 10 条。
- 主动推送如果要做端内推送，需要 Capacitor push 配置；先用应用内红点。

---

## 我的推荐顺序

1. **方向 2（工具调用）+ 方向 1（记忆）** —— 一次性升级到位，治本
2. 方向 3（RAG 图识别）—— 立竿见影的"懂行"感
3. 方向 7（护栏）—— 在大家开始重度使用前先装好
4. 方向 4 / 5 / 6 —— 锦上添花

请告诉我先做哪几个，我就开工。