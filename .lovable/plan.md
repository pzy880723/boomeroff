
# 把"BOOMER 帮我拍"默认调成洗脑口播探店视频

## 目标
点「BOOMER 帮我拍」一键生成的默认视频 = 15 秒竖版、有真人/角色出镜、激动语气的口播探店片，转化率优先。角色既能从素材库随机抽，也能现挑/现生成,但默认权重最高的就是这一种。

## 调整点（仅本功能，不动其他入口）

### 1. 默认参数 (`src/lib/surpriseJob.ts` + `src/pages/MyMarketing.tsx` 触发处)
- `video_type` 默认权重：`store_tour`（探店） 占 70%，其余类型合计 30%（保留少量惊喜感）
- `duration` 锁 15s、`aspect` 锁 9:16、`style` 权重：`energetic` 50% / `lively` 30% / `playful` 20%（去掉 steady/elegant/nostalgic 在默认池里的权重）
- 强制 `with_character = true`：若用户没选角色，从 `marketing_characters` 里随机抽一个 `auto_anchor=true` 的；抽不到则调用现有角色生成 fallback
- 渲染模型沿用 `videoModelPrefs` 上次选择，没有则默认 Seedance 2.0 Fast / 720p（出片快、便宜，符合"一键"预期）

### 2. 脚本生成 Prompt (`supabase/functions/generate-marketing-video-script/index.ts`)
新增一个 `intent: "viral_store_tour"` 入参（仅 surprise 入口传）。命中时在 system prompt 追加洗脑探店专用规则：
- hook 必须 ≤2s、第一句话是冲击型钩子（"姐妹冲！""我真的会谢""别再去 XX 了"这种口语）
- 全片口播节奏：每镜 1.5–2.5s、6–8 镜，台词总字数 80–110（10s 有效口播 + hook/outro）
- 每镜必须有真人动作描述（指、拿、试、转身、对镜头说），主角始终是同一人(沿用 character 锁定)
- subtitle 用大白话短句、带情绪符号（"！""绝了""巨好出片"），≤24 字
- 收尾固定 CTA 句式："现在冲 / 地址在评论区 / 错过等一年" 任选

### 3. 角色挑选逻辑
在 surprise 触发处（`MyMarketing.tsx` 中点击「BOOMER 帮我拍」的 handler）：
```text
if (用户已选 character) → 用它
else if (素材库存在 auto_anchor 角色) → 随机抽 1 个
else → 走现有 character 生成 fallback (CharacterCreateDialog 的后端逻辑)
```
不弹窗、不打断"一键"体验。

### 4. UI 微调 (`SurpriseVideoDialog.tsx`)
- 进度条文案改成"正在拍一条洗脑探店片…"
- 完成后顶部加一行小字标签："默认风格：15s 探店口播 · 主角：{角色名}"，旁边一个"换个风格再来一条"按钮（重新触发时随机走非 store_tour 池，给用户惊喜出口）

### 5. 不动的部分
- "AI 自定义视频"入口、风格/类型选择器、视频素材库、发布工作台、所有后端 sweep/重试逻辑保持原状
- `video_type` 枚举、`marketing_presets` 表结构不改，只是改默认权重

## 技术细节
- 权重随机用简单的加权数组在前端做，不进 DB
- `intent` 字段在 `generate-marketing-video-script` 里用 `if (body.intent === 'viral_store_tour')` 走分支 prompt，不影响其他入口调用
- 角色随机：`supabase.from('marketing_characters').select().eq('shop_id', shopId).eq('auto_anchor', true)` → 客户端 `Math.random()` 抽一个
- 不新增表、不新增 edge function

## 验收
1. 连点 5 次「BOOMER 帮我拍」，至少 3–4 次产出的是 store_tour + energetic/lively + 带角色的 15s 竖版
2. 生成的脚本 hook ≤2s 且首句是口语化钩子
3. 弹窗里能看到"主角：xxx"标签
4. 「AI 自定义视频」入口的默认值未受影响
