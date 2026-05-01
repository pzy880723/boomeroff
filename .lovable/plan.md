## 方案 1：内置豆包 + 修 JSON 解析 Bug

### 背景
1. 当前后台 AI 模型只有「Lovable AI」「自定义 OpenAI 接口」两个选项，要用豆包得手填 Base URL/Key/Model，麻烦
2. 项目里 `DOUBAO_API_KEY` secret 已配置好，可以直接用
3. 边缘函数日志显示：模型其实 3.6s 就返回了，但因为返回 JSON 末尾多了一个逗号（`"highlight": "...",}`），`JSON.parse` 直接报错→识别失败→用户重试→体感"几十秒"

---

### 一、内置豆包为第三档来源

**`AISettingsPanel.tsx` 后台面板新增"豆包（火山方舟）"单选**

```text
识别模型来源：
  ○ Lovable AI（Gemini / GPT-5）
  ○ 豆包 · 火山方舟（中文古玩首选 ⭐ 新）
  ○ 自定义 OpenAI 兼容接口
```

选中"豆包"后：
- 显示一个豆包专用的模型下拉，预置 3 个推荐型号：
  - `doubao-seed-1-6-250615` —— 最新视觉模型，2-4s（推荐）
  - `doubao-1-5-vision-pro-32k-250115` —— 上一代稳定版
  - `doubao-1-5-vision-lite-32k-250115` —— 极速档
- 不需要填 Base URL / API Key（用项目内置的 `DOUBAO_API_KEY`）

**`app_settings.ai_model.value` 数据结构扩展**
```ts
{
  provider: 'lovable' | 'doubao' | 'custom',  // 新增 'doubao'
  model: string,             // lovable/doubao 都用这个字段存型号
  precision: 'economy'|'standard'|'high',
  custom: { baseUrl, apiKey, model },
}
```

**`recognize-product/index.ts` 的 `resolveModelConfig` 增加 doubao 分支**
```ts
if (provider === 'doubao') {
  return {
    url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    apiKey: Deno.env.get('DOUBAO_API_KEY') || '',
    model: lovableModel || 'doubao-seed-1-6-250615',
    jsonMode: true,  // 火山方舟支持 response_format
  };
}
```

`refine-recognition` 和 `test-ai-model` 同步加 doubao 分支，逻辑一致。

---

### 二、修复 JSON 解析 Bug（关键）

**问题**：模型偶尔在 JSON 对象最后一个属性后多输出一个逗号（`"x": "y",}`），导致 `JSON.parse` 抛错，整次识别失败。

**修复方案**（双保险）：

1. **优先用 tool calling 结构化输出**（彻底杜绝 JSON 错误）
   - 改造 `recognize-product` 的 prompt，把"输出 JSON"改成"调用 `submit_recognition` 工具"
   - 在请求体加 `tools` + `tool_choice: { type: 'function', function: { name: 'submit_recognition' } }`
   - 模型必须按 schema 填参数，结构 100% 合法
   - Lovable AI / 豆包 / 自定义接口都支持 tool calling

2. **解析端兜底**：写一个宽容解析器 `safeParseJSON()`
   - 自动去除 `,}` `,]` 尾随逗号
   - 自动去除 markdown 代码块包裹（` ```json `）
   - 解析失败时再用正则提取所有键值对兜底
   - 用于处理仍然走 JSON mode 的旧路径或自定义模型

3. **错误透传**：解析彻底失败时，把 AI 原始内容打回前端 toast，方便排查（而不是只显示"识别失败"）

---

### 三、文件变更清单

| 文件 | 改动 |
|---|---|
| `src/components/admin/AISettingsPanel.tsx` | 新增"豆包"provider 选项 + 豆包专用模型下拉 |
| `supabase/functions/recognize-product/index.ts` | `resolveModelConfig` 加 doubao 分支；改用 tool calling；加 `safeParseJSON` 兜底 |
| `supabase/functions/refine-recognition/index.ts` | 同步加 doubao 分支 + safeParseJSON |
| `supabase/functions/test-ai-model/index.ts` | 加 doubao 分支，"测试连接"按钮可直接验通豆包 |
| `mem://features/ai-model-settings` | 更新：provider 现支持 lovable/doubao/custom |

---

### 四、技术细节

**火山方舟 API 端点**
- URL: `https://ark.cn-beijing.volces.com/api/v3/chat/completions`
- 协议：完全兼容 OpenAI Chat Completions
- 鉴权：`Authorization: Bearer ${DOUBAO_API_KEY}`
- 支持 `response_format: { type: 'json_object' }` 和 tool calling
- 支持多图 vision 输入（`image_url` 数组）

**Tool calling schema 示例**
```ts
tools: [{
  type: 'function',
  function: {
    name: 'submit_recognition',
    description: '提交中古商品鉴定结果',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        category: { type: 'string', enum: ['jp_porcelain', ...] },
        era: { type: 'string' },
        // ... 所有字段
        sellingPoints: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tag: { type: 'string', enum: ['身世','工艺','稀缺','场景'] },
              text: { type: 'string' }
            },
            required: ['tag', 'text']
          }
        },
        confidence: { type: 'number' }
      },
      required: ['name', 'category', 'confidence']
    }
  }
}],
tool_choice: { type: 'function', function: { name: 'submit_recognition' } }
```

后端读取 `data.choices[0].message.tool_calls[0].function.arguments`，直接 `JSON.parse`，再无格式问题。

---

### 五、对用户的可见效果

1. 后台「AI 模型」多了一个"豆包"选项，选中后只需选模型型号，**0 配置**
2. 识别失败率大幅下降（tool calling 保证 JSON 100% 合法）
3. 用豆包后，中文场景（汉字落款、动漫 IP、日系品牌）识别准确度提升明显，速度 2-4s

---

### 不在本次范围
- SSE 流式输出（如需要后续单独做）
- 图像 hash 缓存（之前已有，不动）
- 默认模型切换（保持 Lovable AI 默认，用户自己去后台切豆包）

确认后开工。