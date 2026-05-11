## 目标
把 `/u/result` 上「一键生成图文文案」从干巴巴的卖点列表，改成站在用户视角、引导剁手 + 适合朋友圈/小红书发的「装逼种草文」，长度 150–220 字。

## 文案逻辑
**默认** AI 实时生成（Lovable AI Gateway），**兜底** 用本地模板拼接，保证断网/限额时也能立刻出。
风格三选一，用户在卡片上可随时切换并「换一段」重生：
1. 小红书姐妹种草体（emoji + 感叹号 + 短句）
2. 朋友圈装逼随手记（克制、有质感、少 emoji）
3. 中古藏家口吻（半专业，强调缘分/年代）

每段都要包含：偶遇/入手桥段 → 一两个让人心动的设计/工艺细节（来自 sellingPoints/material/craft/era/origin/brand）→ 品牌或年代点睛 → 「一不小心剁手了」式收尾 → 末尾一行 AI 免责小字（`— AI 生成仅供欣赏 · via BOOMER-OFF —`）。

## 改动范围

### 1. 新增边缘函数 `generate-share-copy`
- 公共函数（与 `submit-public-post` / `recognize-product-public` 一致：`verify_jwt = false`，按 IP 简单限频，沿用 `guest_daily_usage`，加一列或新键 `copy_count`）。
- 入参：`{ name, category, era, origin, material, craft, sellingPoints, story, brand?, style: 'xhs' | 'pyq' | 'collector' }`
- 用 Vercel AI SDK + Lovable AI Gateway，model `google/gemini-3-flash-preview`，`Output.object` 结构化输出 `{ caption: string }`，限定 150–220 字、含 1–3 个 emoji（仅 xhs 风格）、不得使用「主播」字样、不得编造价格。
- system prompt 给三种风格的明确语料示例。
- 出错时返回 `{ caption: null, error }`，前端落到模板。

### 2. 新增 `src/lib/shareCopy.ts`
导出 `buildLocalShareCopy(result, style)`：3 种风格各 3–5 套模板片段（开头/中段/结尾），随机拼接，自动塞入有数据的字段（无 brand 就跳过）；保证产出 150–220 字。

### 3. 改造 `src/pages/public/PublicResult.tsx` 的「一键生成图文文案」卡
- 顶部加 3 个风格切换胶囊：`小红书种草` / `朋友圈随手` / `藏家口吻`，默认 `小红书种草`。
- 内容区由原来的 `pre + buildShareText` 替换为 `caption` 段落（保留 `whitespace-pre-wrap`、最大高度可滚动）。
- 三个按钮：
  - `复制文案`（已有，复制当前 caption）
  - `换一段`（重新调用 AI；正在生成时显示 loader；失败 toast 后自动落到本地模板）
  - 风格切换 → 自动重新生成
- 首次进入：先用本地模板瞬间渲染一段，同时后台调一次 AI 替换（无感升级）。
- 移除当前文案里干巴巴的「分类｜xxx 关键看点 1/2/3/4」结构，改为新的种草体。

### 4. 不动
- AI 识别管线、`useGuestRecognition`、`GuestProductCard`、中古圈详情卡都不改。
- 数据库 schema 不需要变（限频可复用 `guest_daily_usage.share_count` 概念，新增字段 `copy_count` 可选；如不加就和 share 共用日额度，简化先不加）。

## 执行顺序
1. 写 `src/lib/shareCopy.ts`（模板）
2. 写 `supabase/functions/generate-share-copy/index.ts`（AI + 兜底）
3. 改 `PublicResult.tsx`（风格切换 + 实时替换）

## 风险与边界
- AI 生成可能含编造细节：prompt 中明确「只能用我提供的字段，不许编品牌/价格/产地」。
- 「主播」禁用词：在 system prompt + 服务端正则二次清洗。
- 文案要 100% 中文，不出现英文段落（品牌/型号原文允许）。