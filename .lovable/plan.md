
# 识别后体验优化方案

我把整条链路看了一遍，定位到两个独立问题：

```text
拍照 → recognize-product (≈7s)            ← 主识别，已有三段进度条
      └─ 出商品卡 → enrich-recognition (5-15s) ← ① 等知识卡时只有一行枯燥提示
                  └─ 用户问 AI →
                     refine-recognition (≈30-40s) ← ② "AI 问 AI" 极慢
```

---

## ① 知识卡补全等待期：从"干等"变"边看边等"

**现状**：`ProductDetailCard` 出来后，`KnowledgeCardSections` 在 `enrich-recognition` 回来前只显示一张虚框：
> ✨ 正在为本次识别生成知识卡…（约 5-15 秒）

5-15 秒对店员来说很长，又没有可看的东西，体感很糟。

**改动**（仅前端 `KnowledgeCardSections.tsx` + `ProductDetailCard.tsx`）：

1. **骨架占位**：用 4 张和最终内容同结构的 skeleton 卡占住"一句话/速记卡/客户话术/易混对比"四个位置，shimmer 动效，宽度参差，让用户清楚知道"马上会出现这些内容"。
2. **顶部 1 行实时状态条**："小精灵正在翻它的中古笔记本 · 已 3.2s"——读秒用现成 `elapsedMs` 同款 `rAF`，让用户知道系统在动。
3. **轮播趣味提示卡**：在骨架上方挂一张"AI 小知识"卡片，每 2.5s 切换，内容用已识别出的字段动态生成：
   - "{result.era} 那年，{result.origin} 还在用 ___ 工艺"
   - "顾客最常问 {category}：____ "
   - "{ip} 的同年代周边为什么越来越稀缺"
   - 这些文案前端本地写死 4-6 条模板，不再额外调 AI，纯填字段。
4. **enrich 成功 → fade-in 替换**：骨架直接淡出，内容淡入；中途若失败，骨架 toast 一次"知识卡稍后补"，不阻塞页面。

> 不增加任何后端调用，纯粹把"沉默 10 秒"变成"有节奏的 10 秒"。

---

## ② "AI 问 AI"（卡片底部纠错对话）反应极慢

**根因**：`supabase/functions/refine-recognition/index.ts`
- 默认模型 `google/gemini-2.5-pro`（line 16 `REFINE_DEFAULT`）——重模型，多模态首字延迟 10-25s。
- system prompt 强制**每轮都输出完整 JSON 代码块**（line 41-51），即使用户只是问"那为什么是 2002 年的？"——pro 模型还得跑完整结构化输出，30-40s 起步。
- 每轮都把原图 + 所有补拍图重新塞回去（line 122-127），输入 token 巨大。
- 前端 `InlineRefineChat.send` 起 spinner 时没有"首字到达"提示，用户体感更慢。

**改动**：

A. **edge function `refine-recognition`**
- 默认模型换为 `google/gemini-3-flash-preview`（与 `chat-knowledge` 一致，多模态强且首字 1-2s）。`ALLOWED_MODELS` 加入新值；管理员在 `/portal` 选择 pro 仍尊重。
- **JSON 仅在需要时输出**：把"每轮必须给完整 JSON"改成"只有当你确定要更新识别结果时，才在最后追加 \`\`\`json ... \`\`\`；纯追问或闲聊不需要 JSON"。前端 `extractJSON` 已经是"找不到就不更新"，天然兼容。
- **图片只在第一轮发**：检测 `restMessages.length === 0` 时才拼图；后续轮次不再重发原图与补拍图，靠模型上下文记忆 + 文本概要。token 量直接砍到 1/10。
- 加 `console.log` 输出耗时（首字 / 总时 / 模型 / 是否多模态），方便后续观察。

B. **前端 `InlineRefineChat.tsx`**
- spinner 文案分两段：未收到任何 delta → "AI 正在看图…"；收到第一段 delta → 自动隐藏 spinner，气泡里出现打字光标。
- 顶部小 chip 显示当前用的模型（`gemini-3-flash` / `gemini-2.5-pro`），让用户对速度有预期。
- 已有的"流式渲染 + stripJSONBlocks"逻辑不动，JSON 可有可无都能跑。

---

## 改动文件清单（不改业务表结构、不动后端鉴权）

```text
src/components/knowledge/KnowledgeCardSections.tsx   骨架 + 趣味提示卡 + 计时
src/components/recognition/ProductDetailCard.tsx     把 elapsedMs 透传给上面
src/components/dashboard/LiveStreamPanel.tsx         把 enrich 起始时间传下去
src/components/recognition/InlineRefineChat.tsx      首字反馈 + 模型 chip
supabase/functions/refine-recognition/index.ts       默认模型改 flash + JSON 选填 + 图片仅第一轮
```

预计纠错对话：**30-40s → 2-4s 首字**；知识卡等待期：**沉默 10s → 有内容、有读秒、有趣味提示**。

按这个方向我就直接动手，可以吗？
