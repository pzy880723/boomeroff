# 让豆包支持联网搜索

## 背景与关键事实

- 豆包（火山方舟）有官方 **`web_search` 内置插件**，但它**只通过 Responses API** 提供：`POST https://ark.cn-beijing.volces.com/api/v3/responses`，**不走** `/chat/completions`。
- 触发由模型自己判断（多轮自动搜索），支持图文混合输入（VLM 兼容），完美匹配本项目"拿不准时联网核实"的需求。
- 计费按实际触发次数走，可用 `max_keyword` / `max_tool_calls` 控制成本。
- 默认 5 QPS，足够门店场景。
- 现项目已有 `DOUBAO_API_KEY` 密钥，无需新增 secret。

## 方案

### 1. 后端：豆包路径新增联网模式（`recognize-product` edge function）

**核心改动**：当 `provider === 'doubao'` 且 `enableWebSearch=true` 时，从 `chat/completions` 切到 `responses` 接口，注入 `web_search` 工具；否则保持原有 `chat/completions` 逻辑（速度快、不烧搜索次数）。

```text
现状：                          改造后：
provider=doubao                 provider=doubao + 联网开
└─ chat/completions             └─ /api/v3/responses
   └─ tools=[submit_recognition]   └─ tools=[web_search, submit_recognition]
                                  └─ max_keyword=2, max_tool_calls=2
                                  └─ 解析 output_item 中的 function_call
                                
provider=doubao + 联网关
└─ chat/completions （保持现状，最快）
```

具体修改：

- `resolveModelConfig`：新增 `apiStyle: 'chat' | 'responses'` 字段。豆包 + `enableWebSearch=true` → `apiStyle='responses'`，URL 改为 `https://ark.cn-beijing.volces.com/api/v3/responses`，并把 `enableWebSearch` 透传出来（去掉之前"豆包硬关闭"那行）。
- 新增 `buildDoubaoResponsesBody()`：把现有 messages 转成 Responses API 的 `input` 数组结构（`role` + `content` 数组，图片用 `input_image`，文本用 `input_text`），同时把 `submit_recognition` 工具改成 Responses 的 tool 格式，再追加 `{ type: 'web_search', max_keyword: 2 }`。
- 新增 `parseDoubaoResponsesResult()`：从 `output[]` 里找 `type === 'function_call'` 且 `name === 'submit_recognition'` 的项，解析 `arguments`；同时检测是否有 `web_search_call` 项以设置 `usedWebSearch=true`（用于日志/诊断）。
- 系统提示在豆包联网分支末尾追加一段简短的"拿不准时再调用 web_search"指令（参考官方模板，但只 3-4 行，不污染主提示）。
- 失败兜底：若 Responses 接口报错（4xx/5xx），自动降级到 chat/completions 路径再试一次，不影响门店出单。

### 2. 前端：解锁 /portal 的联网开关

`src/components/admin/AISettingsPanel.tsx`：

- 把"联网搜索"卡从"仅 Gemini 模型"区块挪出，**对 Lovable AI 和豆包都显示**；自定义接口仍隐藏（因为不通用）。
- 卡标题去掉 `(仅 Gemini)`，改成"联网搜索（Gemini / 豆包 支持）"。
- 文案补充：豆包接 Responses API + 火山方舟联网内容插件，Gemini 接 Google Search 接地。两者都按"模型自行判断"的方式触发。
- 如果上一条计划（"当前生效"汇总卡）已实现，则把"联网搜索"徽章在豆包 provider 下也亮起来。

### 3. Memory 更新

更新 `mem://features/web-search-grounding`：明确"Gemini 走 Google Search、豆包走火山方舟 web_search 插件 + Responses API"，并记录"豆包联网=切换 API endpoint"这一关键差异，避免下次有人误以为加个 tool 就行。

## 受影响文件

- `supabase/functions/recognize-product/index.ts` — 新增豆包 Responses 分支与解析
- `src/components/admin/AISettingsPanel.tsx` — 解锁开关并修文案
- `mem://features/web-search-grounding` — 更新说明

不动 DB schema、不动 secrets、不动其它前端组件。

## 用户验证

1. 进 `/portal` → AI 模型，切到"豆包"
2. 联网搜索卡现在可见且可开关；开启
3. 拍一个**冷门外文品牌**或带**型号编号**的小物件
4. 在 edge function 日志里能看到 `usedWebSearch: true` 的记录，识别结果中"年代/产地/卖点"出现搜索得来的具体事实（如官方品牌史、停产年份）
5. 拍一个**普通茶杯**（常见品类），日志显示 `usedWebSearch: false`，速度仍然 1-2 秒——说明模型自己会判断
6. 把开关关掉，再拍同一个外文品牌，对比识别质量下降 / 出现"我不确定"——证明开关真的生效
