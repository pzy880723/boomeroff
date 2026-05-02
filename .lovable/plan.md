## 目标
让识别 AI 在「自己拿不准」时自动联网搜，把搜到的真实信息融合进 name / era / origin / selling_points，不再瞎猜。用户感知不到搜索过程，只看到更准的结果。

## 方案：Gemini 内置 Google Search 接地（grounding）

Lovable AI Gateway 透传 Google 原生的 `google_search` 工具。在调用 `recognize-product` 时多挂一个工具，让模型自己决定要不要调用，无需新接 API key、无需新连接器。

```text
图像 → AI 识别 → 模型判断置信度
                ├─ 高置信度 → 直接出结果（秒出，和现在一样快）
                └─ 拿不准/有外文品牌/型号编号
                        → 自动调用 google_search
                        → 把搜索片段当上下文重新生成
                        → 出结果（多 1-3 秒）
```

## 改动范围

### 1. `supabase/functions/recognize-product/index.ts`
- 在工具列表里追加 `{ type: 'google_search' }`（只对 `google/gemini-*` 模型挂；豆包 / 自定义 endpoint 跳过，避免 400）
- 系统提示词加一段「触发联网」规则：
  - 看到外文品牌、型号编号、底款铭文、动漫 IP 不确定时 → 调 `google_search` 验证后再填字段
  - 中文常见品类、底款清晰时 → 不要联网，直接答
  - 联网得到的事实必须落进字段里，不准复述「根据搜索结果」
- 模型返回里如果带 `groundingMetadata`，记到日志便于排查；不向前端暴露来源链接（按你选的「只融合」）
- 缓存逻辑保留：哈希命中 / 名称模糊命中仍优先走缓存，联网只发生在最终全量识别那一步

### 2. `supabase/functions/_shared`（如无则就地写在文件内）
- 加一个小判断：`isGeminiModel(model)` → 决定是否注入 `google_search` 工具
- 自定义 endpoint / 豆包不开联网（它们不支持这个 tool spec）

### 3. 后台「AI 模型」设置（`/portal`）
- 增加一个开关：「允许 AI 联网搜索（仅 Gemini 模型）」，默认开
- 写入 `app_settings.ai_model.enableWebSearch`
- 边缘函数读这个开关，关掉就不挂工具

### 4. 前端无改动
按你选的「只融合进结果」，UI 不显示参考来源，不加按钮，不加 loading 文案变化。

## 不做的事
- 不接 Perplexity / Firecrawl（避免再让你配密钥）
- 不在结果里露出来源链接
- 不让用户手动触发
- 不改缓存策略（缓存命中就不联网，省时间）

## 风险与权衡
- 联网那一次会比纯识别多 1-3 秒，但只在 AI 自己觉得不确定时才会发生，命中缓存或高置信度仍是秒出
- Google Search 接地按 grounded request 计费，会消耗 Lovable AI 额度多一些；可在后台开关一键关闭
- 自定义 OpenAI endpoint / 豆包模型不支持，自动降级为不联网

## 落地后验证
- 拍一个明显的外文限定品（例如带 SONY 型号的 Walkman、带 IP logo 的手办）→ 看 name/era 是否比之前更具体
- 拍一个常见有田烧 → 应该秒出，不联网（看后端日志没有 grounding 记录）
- 后台关闭开关 → 重拍同一张外文品 → 退化为旧行为
