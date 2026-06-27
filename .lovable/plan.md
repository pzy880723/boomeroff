## 目标
现在惊喜一下顶部死写「洗脑探店 · 激动快节奏」，但 AI 按品类挑出来的博主可能是老克勒、文气主理人这种慢节奏人设，两者打架。改成：**vibe 完全跟随当次 AI 生成的博主**，UI 不再硬塞「激动快节奏」字样，脚本节奏也按 persona vibe 走。

## 改动

### 1. `supabase/functions/_shared/persona-generator.ts`
- `InfluencerPersona` 增加字段 `pace: 'slow' | 'medium' | 'fast'` 和 `tone_label: string`（例：「沉稳种草」「高能洗脑」「文气慢推」「吃货狂炫」），由 AI 根据品类自己判断；老克勒→slow/沉稳种草，潮玩→fast/高能洗脑，吃货→fast/狂炫安利。
- system prompt 里去掉「所有人都要激动」的暗示，加一句：**节奏要符合人设本身**，老派人物允许慢条斯理，年轻人物允许高能。
- `formatPersonaDirective` 把 pace 翻译成 Seedance 英文节奏锁（slow→calm measured delivery；fast→high-energy rapid delivery）。
- `formatPersonaBriefZh` 把 pace + tone_label 写进 brief，明确告诉脚本生成器「本片整体节奏=X，禁止套用其他节奏的口头禅」。
- Fallback persona 补上 pace='fast'、tone_label='高能种草'。

### 2. `supabase/functions/surprise-marketing-video/index.ts`
- 把 persona.pace / tone_label 透传到 `generate-marketing-video-script` 的 brief 里，让单镜台词字数按节奏浮动：slow 允许 8-12 字/镜，fast 维持 6-10 字/镜，但总字数仍 ≤ 65。
- 返回给前端的 `persona` 对象带上新字段。

### 3. `supabase/functions/render-marketing-video/index.ts`
- `buildOneShotPrompt` 在拼 persona_directive 时根据 pace 调整片头节奏描述（不再无脑写 "fast cuts / hype"），改成读 persona 自己的节奏。

### 4. `src/components/marketing/SurpriseVideoDialog.tsx`
- 顶部 chip 区移除硬编码的「🔥 洗脑探店 · 激动快节奏」。
- 改成动态渲染：
  - 「🎬 今日博主：{persona.label}」
  - 「🎙️ 风格：{persona.tone_label}」（颜色按 pace 区分：fast=红、medium=琥珀、slow=靛）
  - 节日 chip 保留
- 博主详情卡里把 vibe / 节奏一起展示，去掉与人设打架的「激动」字眼。

## 不动
- 门头第一镜锁定逻辑、9 张参考图、节日 brief、虚构人物约束不变。
- 脚本仍是第一人称博主口播。

## 技术细节
- pace 在 AI JSON 输出里要求枚举值，解析时 fallback 'medium'。
- 前端 chip 颜色用 design token（`text-destructive` / `text-amber-500` / `text-indigo-500`），不写死十六进制。

## 部署
改完后部署：`surprise-marketing-video`、`render-marketing-video`。
