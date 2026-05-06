## 问题诊断

**为什么封面一直生成不了：**
当前 `generate-official-knowledge` 让 AI 返回的 `cover_prompt` 是"产品级"描述，里面会带具体品牌/IP 名（如 "Koransha porcelain coffee cup"、"Sonny Angel figurine"）。Gemini image 模型对带品牌、人物、动漫 IP 的提示词会**直接拒绝出图**（返回 200 但 `choices[0].message` 里没有 `images`），所以走到 "AI 未返回图像" 报错。重试到 `gemini-3.1-flash-image-preview` 触发同一个版权策略，照样失败。

日志侧也印证了：cover 函数没有真正运行错误（只有 boot/shutdown），说明请求成功但图像被模型策略拦截。

## 修复方案

### 1. 让 AI 生成"通俗去品牌化"的 cover_prompt — `supabase/functions/generate-official-knowledge/index.ts`

- 改写 `cover_prompt` 字段的 description 和 SYSTEM 里的撰写要求：
  - **禁止**出现品牌名 / IP 名 / 角色名 / 设计师名 / 系列名（包括拼音、罗马字、英文写法）。
  - **禁止**出现「Koransha / Sonny Angel / Walkman / Meissen / Wedgwood」等专有词；改用通俗外观描写。
  - 必须用平实英文描述：物体类别 + 材质 + 颜色 + 形状 + 年代感 + 拍摄风格。  
    示例（写进 system，给模型抄）：
    - ❌ `Koransha porcelain coffee cup with red and gold pattern`  
    - ✅ `A small white porcelain coffee cup with hand-painted red flowers and gold rim, on plain white background, soft natural light, photorealistic`
    - ❌ `Sonny Angel baby figurine with strawberry hat`  
    - ✅ `A small vinyl baby figurine wearing a fruit-shaped hat, glossy finish, on plain white background, studio light`
- 在 tool schema 里加一句 `Must not contain any brand, IP, character, designer or product line name.`

### 2. cover 函数加一道"去品牌化"兜底 — `supabase/functions/generate-knowledge-cover/index.ts`

即使前端传来的旧 prompt 还带品牌词，也要兜底：
- 写一个轻量正则黑名单（常见易被拦截的词：`Koransha|Sonny Angel|Walkman|Meissen|Wedgwood|Royal Copenhagen|Hermes|Chanel|Pokemon|Disney|Sanrio|Hello Kitty|Studio Ghibli|...`），命中就替换为通用描述（"a Japanese-style porcelain piece" / "a vintage cassette player" / "a designer vinyl figurine" 等），并在日志里打 warn。
- 模型调用顺序改为：先 `gemini-3.1-flash-image-preview`（更新、出图率更高），失败再退 `gemini-2.5-flash-image`。
- 第二次重试时，把 prompt 进一步简化为「纯品类 + 白底 + 写实」的最短形式（去掉所有形容词、年代、人名），最大化通过率。
- 把模型返回的 `message` 完整摘要打印到 log，便于以后定位（目前只打前 800 字够用，保持不变但加上一次重试的内容）。
- 错误信息透传更具体的中文提示：「图像被模型策略拦截，已尝试自动通用化描述，请稍后重试或在右上角手动重写描述」。

### 3. 前端不变

`AiKnowledgeDialog` 仍然把 AI 返回的 `cover_prompt` 直接交给 cover 函数，无需改动。新提示词 + 后端兜底足以覆盖。

## 不改动

- 知识词条正文 (`body`/`one_liner` 等) 仍允许使用品牌名 — 这是店员学习卡的核心价值，不能去掉。**只有 `cover_prompt` 这一字段做去品牌化**。
- 不引入异步队列 / job 表：当前失败原因不是超时，是被策略拦截，加队列无意义，反而加复杂度。

## 技术细节

- 黑名单替换在 `generate-knowledge-cover` 内 `fullPrompt` 拼接前做，函数 `sanitizePrompt(s: string): string`。
- 简化版重试 prompt：`A ${categoryHint} on plain white background, soft natural light, centered, photorealistic, no text` — `categoryHint` 由黑名单替换时顺带产出，没有则用 `product`。