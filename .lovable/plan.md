## 慢在哪里（已查证）

后端日志清楚显示一次完整识别的真实分布：

```
16:35:16.204  请求到达
16:35:17.837  loadKnowledge + resolveModelConfig 完成（+1.6s）
              ↓ 接着跑了 tryQuickClassify（lite 模型再调一次 AI 看图）
              ↓ 没命中名字缓存，继续走主识别
16:35:24.577  主 AI 返回（AI time 4125ms）
              总计后端 ≈ 8.4 秒
```

加上前端这几件事是**串行**等的：
1. 前端先算 pHash（大图 ~400-800ms）
2. base64 图片随请求体发到 edge（移动网络 1-3s）
3. `Promise.all([uploadImage, recognizeProduct])` —— **图片上传到 storage 跟识别并行，但 await 二者全部完成才显示结果**。如果手机网络慢，上传一张 1280px JPEG 经常要 5-15 秒，整个流程就被它拖住
4. 命中后还要 `INSERT products` 一次（再 200-500ms）
5. 多角度模式：自动升 Pro + 联网搜索，单是 Pro+grounding 就 8-15s

合起来「几十秒」就是这么累出来的，**不是 Gemini 本身慢**。

---

## 修复方案（按收益排序）

### 1. 砍掉 tryQuickClassify 的无谓 AI 调用 ⭐ 收益最大

现在每次没命中 hash 就先用 lite 模型看一眼图、得到名字、再去 `products / official_knowledge` 模糊匹配。
店里大多数商品根本没有重复，这一步白白多花 1.5-3 秒。

改成：**只在 official_knowledge / products 表里有数据**，且**先用 embedding 或更轻量的方式**判断；最简单的优化——**默认关掉 quickClassify**，仅在用户明确开启「优先复用历史」时才走。

实际改动：在 `app_settings.ai_model.value` 里加一个 `enableQuickMatch: false`（默认 false），`recognize-product` 读到 false 就跳过整段 quickClassify。

### 2. 上传跟识别真正解耦 ⭐⭐ 用户体感最强

现在 `handleRecognition` 用 `Promise.all([uploadImage, recognizeProduct])` 等两个都好才往下走。
改成：

- 识别一返回结果就**立刻渲染卡片**（用 base64 临时显示）
- 图片上传扔到后台 `Promise`，完成后再 update products.image_url
- INSERT products 也挪到后台执行，UI 不再阻塞

效果：用户看到结果的时间 = AI 时间，而不是 max(AI, 上传, INSERT)。

### 3. 加详细分段计时日志，把「几十秒」量化

在 `recognize-product/index.ts` 加：

```
[Timing] auth: Xms
[Timing] knowledgeLoad: Xms
[Timing] quickClassify: Xms (skipped/hit/miss)
[Timing] mainAI: Xms (model=..., webSearch=...)
[Timing] total: Xms
```

前端 `useProductRecognition` 同样加：

```
[FE] hash compute: Xms
[FE] invoke roundtrip: Xms
[FE] upload: Xms
```

下次再慢就能立刻看到瓶颈在哪段。

### 4. 把主 AI 超时从 25s 收紧到 18s，并默认关 web search

后端有 `callAIWithTimeout(..., 25000)`。Gemini 联网搜索一旦绕远，单次能跑 10-20s。
- 默认 `enableWebSearch = false`（用户在 /portal 里随时能开）
- 超时改 18s，超时后告诉用户「网络拥塞，请重试」而不是干等

注意之前我们记忆里写的是默认开启联网，需要用户确认是否同意调成默认关闭。

### 5. 多角度模式不强制升 Pro

现状：只要 `imageList.length > 1` 就自动改 `google/gemini-2.5-pro`。Pro 看图比 flash 慢 3-5 倍。
改成：**多角度仍用 flash**，仅在用户主动选「高精度」时才走 pro。

### 6. 前端图片再小一档

单图当前 `1280px / 0.85`，对识别几乎过剩。改成 `1024px / 0.8`，base64 体积砍 40%，上传 + 网络往返同步降低。底款细节足够。

---

## 改动文件清单

- `supabase/functions/recognize-product/index.ts` —— 砍 quickClassify、加分段计时、收紧超时、多角度不再强制 Pro
- `src/hooks/useProductRecognition.tsx` —— 加前端分段日志
- `src/components/dashboard/LiveStreamPanel.tsx` —— 上传/INSERT 与识别结果渲染解耦
- `src/components/admin/AISettingsPanel.tsx` —— 暴露 `enableQuickMatch` 开关 + 默认关 web search 文案
- 数据库：`app_settings` 的 ai_model.value 加字段 `enableQuickMatch`（默认 false）

---

## 需要你确认 2 件事

1. **联网搜索默认要不要关掉？**（不关 = 维持记忆里的"默认开"，但慢；关 = 默认快，需要时再到 /portal 打开）
2. **多角度是否同意默认走 flash？**（同意 = 快很多；不同意 = 维持现在的 Pro，慢但更准）

如果你说"都按你最快的方案来"，我会：联网默认关、多角度默认 flash、quickClassify 默认关。
