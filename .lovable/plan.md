# 小精灵响应速度优化

## 目标
首字时间从当前 8–15s 降到 2–4s，并让等待期间 UI 有真实反馈。

## 改动范围
仅改 `supabase/functions/spirit-chat/index.ts`，前端 `useSpiritChat.ts` 顺手加一个 `__status` 帧处理，不动数据库、不动 UI 组件。

---

## 1. 核心修复：合并"工具循环最后一步"和"最终回答"（最大收益）

**现状**：第 364-422 行先用非流式跑完工具循环，再单独发一次流式请求重新生成答案。第 2 次非流式那一轮，当模型决定不再调工具时，其实已经把完整答案生成在 `msg.content` 里了，但被丢弃。

**改法**：工具循环改成"流式 + 解析 tool_calls"。
- 每一步都用 `stream: true` 调网关
- 边读 SSE 边累积：如果 delta 里出现 `tool_calls`（OpenAI 兼容格式里 tool_calls 也走 delta），就缓存起来不转发给客户端；如果是普通 `content` delta，**直接转发给前端**
- 一个 step 流式读完后：
  - 有 tool_calls → 执行工具 → 进入下一步流式
  - 没有 tool_calls → 流自然结束，已经全推给前端了，直接收尾

这样典型路径变成：
- 第 1 次流式（模型很快决定调 search_shop_kb，先吐 tool_calls）≈ 1–2s
- 执行工具 ≈ 0.2s  
- 第 2 次流式（直接边生成边推给用户）≈ 首字 0.8–1.5s

**首字时间 ≈ 2–3s**，比现在快 4–6 倍。无工具的纯创作场景更快，1–2s 出字。

## 2. 工具循环期间下发状态帧

每次执行工具前/后发一行：
```
data: {"__status":{"phase":"tool","tool":"search_shop_kb"}}
```
前端 `useSpiritChat` 的 SSE 解析里捕获 `__status`，更新一个 `toolStatus` 状态。`SpiritChatPanel` 拿这个状态把"翻翻我的小本本"这种占位文案换成"正在查门店知识库…"之类的真实提示。

## 3. 预查询并行化 + 缓存

- 把第 145-200 行的 6 个查询合成两个 `Promise.all` 波次：
  - 波次 A（请求一进来就发）：rate_limits、spirit_model、profiles、staff_profiles、shops、conversation 校验
  - 波次 B（仅新会话才跑）：插入 spirit_conversations
- `shops` 列表在 edge function 内做一个简单的内存 LRU（按容器存活期缓存 60s），同一容器复用，省一次全表扫。

## 4. 异步落库

把 `spirit_messages` insert + `spirit_usage` insert 从 `stream.pull` 的 done 分支里挪出来，用 `EdgeRuntime.waitUntil(...)` 提交后立刻 `controller.close()`，让前端早 100–300ms 看到 `[DONE]`。

## 5.（可选）首步快路径

如果最近 4 条消息的纯文本里没有"排班/班/休/等级/经验/打卡/查/谁/什么时候/明天/今天/价/保养"等触发词，第一步用 `tool_choice: 'none'` 直接跳过工具判断走纯流式。命中率高的闲聊场景再快一档。是否上看你偏好，会牺牲一点工具召回率。

---

## 技术细节（实现要点）

**流式解析 tool_calls 的格式**（OpenAI 兼容、Lovable Gateway 同样支持）：

```text
data: {"choices":[{"delta":{"tool_calls":[
  {"index":0,"id":"call_xxx","function":{"name":"search_shop_kb","arguments":""}}
]}}]}
data: {"choices":[{"delta":{"tool_calls":[
  {"index":0,"function":{"arguments":"{\"que"}}
]}}]}
data: {"choices":[{"delta":{"tool_calls":[
  {"index":0,"function":{"arguments":"ry\":\"嫌贵\"}"}}
]}}]}
data: {"choices":[{"finish_reason":"tool_calls"}]}
```

按 `index` 维护一个 `Map<number, {id, name, argsBuffer}>`，`finish_reason === 'tool_calls'` 时拼装出完整 tool_call 数组去执行。普通 `delta.content` 字符串直接 `controller.enqueue(value)` 透传。

**前端改动（极小）**：`useSpiritChat.ts` 的 SSE 解析分支里，识别 `obj.__status` 帧，写到一个新的 `toolStatus` 状态返回出来；`SpiritChatPanel` 把"思考中…"那行换成 `toolStatus ? 友好文案 : 默认动画`。如果你嫌动，第 2 项可以先不做，只做 1、3、4 就有最大收益。

---

## 预期效果

| 场景 | 现在首字 | 优化后首字 |
|---|---|---|
| 闲聊（不调工具） | 6–10s | 1–2s |
| 一次工具调用 | 8–15s | 2–4s |
| 两次工具调用 | 12–20s | 4–7s |

## 风险
- 流式解析 tool_calls 比非流式啰嗦一些，需要小心 `index`/`id` 拼装。我会保留原来的非流式 fallback：如果流里出现解析异常就回退到当前实现。
- `EdgeRuntime.waitUntil` 在 Supabase Edge Runtime 上已支持，落库失败不会影响用户但要保留 console.error 以便排查。

## 不在本次范围
- 不改模型选择（`google/gemini-3-flash-preview` 已经是快档）。
- 不改限频规则。
- 不改前端动画/UI 风格，只在保留位置塞一个真实状态文字。

要我直接动手，还是先想砍掉哪几项？比如最小可行就是只做 **1 + 4**，改动量最小、收益最大。
