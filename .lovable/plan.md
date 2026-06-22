## 现状诊断

**`MarketingVideo.tsx` 当前流程**:`选店 → 上传参考图 → 立意沟通(BriefChat) → 直接一把生成 6 段分镜 JSON`。问题:

1. **AI 不理解图**:`generate-marketing-video-script` 把全部 image_urls 当成"素材池"扔给 Gemini,只让它"挑最贴合的 index"。模型从没被要求**先描述每张图**,所以最后 `image_index` 基本是猜的,分镜文案也跟图无关。
2. **20 张图加载/上传失败**:`UploadGrid.onPick` 用 `Promise.all(picked.map(...))` 把 20 个文件**同时**压缩+上传,大图(>5MB)在手机上 OOM/超时,出现"加载不出来"。`processOne` 抛错时也没有自动重试。
3. **没有"先脚本、再分镜"的两步**:点"生成分镜"直接出 hook/scenes/outro 表单,无法在对话里改文案。

## 修复方案(分三块,改动控制在视频流程内)

### A. 上传并发限流 + 大图前置缩放
`src/pages/marketing/UploadGrid.tsx`:
- 把 `Promise.all` 换成手写并发池,**最多 3 张并行**,其余排队。
- 在 `processOne` 之前对超过 8 MB 的图,先用 canvas 缩到 2048px 再交给现有 `compressForUpload`,避免低端机 OOM。
- 失败自动重试 1 次(指数 backoff 1s)。
- 顶部进度条文案改为"上传中 X/N · 队列 Y"。

### B. 图片理解:逐图生成描述
新增 `supabase/functions/describe-marketing-images/index.ts`:
- 入参 `{ image_urls: string[] }`,JWT 鉴权。
- 用 `google/gemini-3-flash-preview` 多模态,**一次请求传全部图(最多 20 张)**,返回 `descriptions: Array<{ index, summary(≤40字), tags[], best_for(适合作为开场/中段/收尾) }>`。
- 结果缓存到 `marketing_assets.meta.ai_caption`(按 sha256/URL 去重),下次同图直接读缓存,避免重复花钱。

`MarketingVideo.tsx`:
- `urls` 变化时,debounce 800ms 后台调用 `describe-marketing-images`,把 `imageDescriptions` 存到组件 state。
- 在每张缩略图右下角加一个小气泡,hover/点击显示 AI 描述,让店员肉眼确认 AI 看懂了。

### C. 两步走:先脚本(对话框内)、再分镜

**第一步「生成脚本草稿」(对话框内长文本)**:
- 在 `VideoBriefChat` 的输入框上方新增一个 **「让 AI 写一版完整脚本」** 按钮。
- 点击后调用现有 `marketing-video-brief-chat`,但带上新参数 `mode: 'draft_script'` 和 `image_descriptions`。后端切到一个新的 system prompt:**输出一段 150-300 字的口语化叙事脚本**,自然语言描述开场/中段/收尾要表达什么,并在每一段末尾用 `[图 #N]` 标注它对应哪张参考图(基于 AI 看过的描述)。
- 这段长文本作为 `assistant` 消息追加到 BriefChat 对话流里。店员可以接着用对话告诉它"开场要更安静"/"图 3 换成图 5",AI 修改后再贴一版新脚本。

**第二步「确认脚本,生成分镜」(已有按钮)**:
- 点 `生成分镜` 时,从 BriefChat 里抓**最近一条 assistant 长脚本**作为 `approved_script` 传给 `generate-marketing-video-script`。
- 后端改写 prompt:不再让模型自由发挥,而是**逐段把 approved_script 拆成 4-6 个镜头**,并且**每镜的 `image_index` 必须取自 approved_script 里的 `[图 #N]` 标记**;同时把 `image_descriptions` 注入 prompt 让 scene/action 文案具体对应那张图的内容(例如"参考图里那只复古青铜小熊,镜头从左下推近")。
- 没有 approved_script 时,回退到旧逻辑(向后兼容)。

### 不动的部分
- `render-marketing-video`、`poll-marketing-video`、素材库、StepBar 文案外的步骤逻辑、其他营销页面(Photo/Copy)。
- 数据库表结构不动(描述结果复用 `marketing_assets.meta` JSONB)。

## 验证清单
1. 一次选 20 张大图(>5MB),控制台无 OOM,所有图最终出绿勾,失败的自动重试一次。
2. 上传完成后 1-2 秒,每张缩略图右下角出现 AI 小描述气泡。
3. BriefChat 对话两轮 → 点「让 AI 写一版完整脚本」→ 对话框内出现一段 200 字脚本,带 `[图 #1]…[图 #5]` 标注。
4. 在对话里说"图 3 换成图 7" → AI 回一版改过的脚本。
5. 点「生成分镜」→ 每镜的参考图与脚本里 `[图 #N]` 一致,scene/action 文案明显描述了那张图的具体内容。
6. `supabase--edge_function_logs` 三个新/改函数无 5xx。
