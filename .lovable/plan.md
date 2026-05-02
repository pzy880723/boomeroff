## 现象与根因（先讲清楚，让你不再怀疑后台是摆设）

### 后台选择**没失效**，数据库里就是 `provider=doubao + enableWebSearch=true`
（直接查了 `app_settings.ai_model` 确认）

### 但你感觉不到豆包，是因为**两层"捷径"在豆包前面就把识别接走了**：

```text
拍照
 ├─ ① 图片哈希命中（同一张照片以前识别过） ──→ 直接返回缓存，不调 AI
 ├─ ② quick_classify（用 Lovable Gemini-flash-lite 做 1 秒轻分类）
 │      └─ 名字+类目命中历史/官方库 ──→ 返回缓存，不调豆包
 └─ ③ 都没命中 ──→ 这时才真正走"豆包 + Responses API + web_search"
```

最近那次识别（edge log 显示 200、1939ms）就是**走了 ② 命中缓存**，从头到尾没调豆包，也就更没联网搜索。所以你的"豆包+联网"配置根本没机会生效。

### 至于"卡住"那次：
edge function 日志里**完全没有那次请求的痕迹**，说明请求根本没到达函数（preview 网络抖动/连接中断）。不是函数崩。重新拍一张就好。但下面的修复会让"卡住"几乎不可能再发生。

---

## 方案：让后台选择**真的看得见、按得动**

### 1. 在结果里返回真实使用的"路径标签"（后端）

`supabase/functions/recognize-product/index.ts` 给每条返回都加一个 `__pipeline` 字段：

```ts
__pipeline: {
  source: 'hash_cache' | 'name_cache' | 'doubao_responses' | 'doubao_chat' | 'lovable_gemini' | 'custom',
  model: 'doubao-seed-1-6-250615' | 'google/gemini-2.5-flash' | ...,
  webSearchEnabled: boolean,    // 配置是否打开
  webSearchUsed: boolean,       // 本次实际是否触发了搜索
  cacheSource?: 'official' | 'history' | 'hash',
  aiTimeMs?: number,
}
```

这样前端随时能看到"这一次到底用了谁"。

### 2. 在识别结果卡片上显示一个"路径徽章"（前端）

`src/components/recognition/ProductDetailCard.tsx` 顶部加一行小徽章：

- 缓存命中 → 灰色：「📦 命中缓存 · 未调用 AI」
- 豆包联网生效 → 绿色：「🌐 豆包 · 已联网核实」
- 豆包未联网 → 蓝色：「⚡ 豆包 · 仅模型」
- Gemini → 紫色：「✨ Gemini 2.5 Flash」

让你**一眼就能验证**后台切换有没有真的生效。

### 3. 在 /portal 加一个"绕过缓存测试"按钮（前端）

`src/components/admin/AISettingsPanel.tsx` 底部新增：

- **「立即用当前配置测试一次」按钮** —— 上传一张测试图，请求带 `forceRefresh=true` 跳过两层缓存，直接走豆包+联网，弹出 toast 显示路径徽章+耗时+是否联网。
- 这样不用拍真商品，就能验证"豆包+联网"是否真的可用。

### 4. 修复"被缓存抢跑"的体验（后端）

`recognize-product/index.ts` 的 `tryQuickClassify` 现在永远用 Lovable Gemini，即使后台选了豆包。改成：

- 后台选豆包 → quick_classify 也走豆包（用最便宜的 `doubao-1-5-vision-lite`），这样后台配置在缓存判定阶段也是一致的。
- 后台选 custom → 没有 quick 模式，跳过 quick 直接走主识别（custom 接口可能不支持 quick）。
- 这条不影响速度（lite 模型同样 1 秒级），但能让"我后台选了豆包"真的从头到尾贯彻。

### 5. 顺手修两件已发现的小事

- **修 React 崩溃**：`src/pages/OfficialLibrary.tsx:372`、`src/pages/MyLibrary.tsx:419`、`src/components/admin/CorrectionReviewPanel.tsx:151` 三处直接把 `selling_points` 当 `string[]` 渲染，遇到新格式 `[{tag,text}]` 必崩。统一改用现有的 `normalizeSellingPoints()`。
- **加入口日志**：edge function try{} 入口加 `console.log('[Recognition] start provider=...', ...)`，下次卡住能立刻定位是请求挂还是函数挂。

---

## 受影响文件

- `supabase/functions/recognize-product/index.ts` — 加 `__pipeline` 元数据；quick_classify 跟随后台 provider；入口日志
- `src/types/index.ts` — `RecognitionResult` 加 `__pipeline?` 字段
- `src/components/recognition/ProductDetailCard.tsx` — 渲染路径徽章
- `src/components/admin/AISettingsPanel.tsx` — 加"立即测试"按钮（拉一张内置测试图，强制 forceRefresh）
- `src/pages/OfficialLibrary.tsx`、`src/pages/MyLibrary.tsx`、`src/components/admin/CorrectionReviewPanel.tsx` — 修崩溃

不动 DB schema，不动 secrets。

---

## 用户验证

1. 进 `/portal` → 当前已是"豆包+联网开"，点"立即用当前配置测试一次" → toast 显示「豆包 Responses · 联网已触发 · 4.2 秒」
2. 拍一件**全新没拍过**的冷门外文品牌 → 结果卡顶部出现绿色「🌐 豆包 · 已联网核实」
3. 拍同一张图第二次 → 结果卡顶部变灰色「📦 命中缓存」（这是好事，省钱省时间，但你能一眼看见）
4. 切回 Lovable AI 保存 → 再拍一件全新商品 → 徽章变紫色「✨ Gemini 2.5 Flash」
5. 打开"中古圈"或个人/官方知识库详情，原来必崩的页面正常显示带标签的卖点
