## 目标
让「惊喜探店」生成的视频里，门头/开场镜头必须符合真实门店形态：
- 位于**商场 B1 层室内**，周围是商场走廊/中庭，绝不能出现马路、街边、街铺、人行道、车流、店门、推门动作。
- 我们是**8 米宽的开放式店面，没有门**，所以禁止"推门进店""拉门""门帘"等动作；进店方式应为"从商场走廊直接走进开放式店面"。
- 这条约束需要在脚本生成 + 渲染 Prompt 两个层级都强制注入，确保 AI 不会自由发挥。

## 改动范围（只动 Prompt 文案，不动业务逻辑）

### 1. 新建共享门店物理形态约束
新增 `supabase/functions/_shared/storefront-constraints.ts`：
- 导出 `STOREFRONT_CONSTRAINT_ZH` 和 `STOREFRONT_CONSTRAINT_EN` 两段常量。
- 中文版（喂给脚本 AI）：明确"商场 B1 层 / 开放式 8m 店面 / 无门 / 顾客从商场内走廊走进来 / 背景是商场中庭或对面商铺 / 禁止出现马路、街边、人行道、车水马龙、推门、拉门、玻璃门把手、门帘、招牌灯箱悬挂在街面"。
- 英文版（喂给 Seedance）：`MALL INTERIOR B1 FLOOR, open-front 8m-wide shop with NO door, NO doorway frame, NO door handle; talent walks in directly from mall corridor; background must show mall corridor / atrium / opposite mall shops; NEGATIVE: street, sidewalk, road, traffic, car, outdoor sky, pushing door, pulling door, door curtain.`
- 同时导出一段「门头镜头专属」补充：开场镜头必须是「商场走廊视角看向开放式店面 + 头顶 LOGO 招牌 + 博主从走廊侧走入」。

### 2. `generate-marketing-video-script/index.ts`
- 在 `sys` Prompt 里追加 `STOREFRONT_CONSTRAINT_ZH` 块（在 `characterBlock` 之后）。
- 在 `viralBlock` 里把现有「0-2s 必须为门口特写且主角推门进店」改为「0-2s 必须为商场走廊视角看向开放式店面，主角从走廊侧走入店内，**禁止出现门 / 推门 / 拉门**」。
- 在 `clean()` 文本清洗里追加：把 dialogue / scene / action 中出现的「推门 / 拉门 / 街边 / 路边 / 马路 / 街口 / 门把手」等词软替换为合理表述（如「走进店里」「商场里」），保底防止 AI 漏网。

### 3. `render-marketing-video/index.ts`
- 在 `buildOneShotPrompt` 和 `buildPrompt` 的英文 Prompt 头部强制注入 `STOREFRONT_CONSTRAINT_EN`。
- 当识别到当前镜是门头镜（已有 hero/门头逻辑）时，再叠加「门头镜专属」英文补丁，并把 negative 词加进现有的 no-text 负向约束行里。

### 4. `surprise-marketing-video/index.ts`
- 在拼装 brief 时把 `STOREFRONT_CONSTRAINT_ZH` 透传给脚本 fn（已经会调 `generate-marketing-video-script`，所以只要在 brief 文案里再点一次即可，双保险）。
- 门头素材缺失时的琥珀色提示文案微调：「未找到门头照，建议补拍**商场走廊视角**的开放式店面照片」。

### 5. 前端轻量提示
`src/components/marketing/SurpriseVideoDialog.tsx`：在「门头」徽标的 tooltip / 副标题改为「商场 B1 · 开放式店面（无门）」，让店员一眼知道系统已锁定该形态。

## 不动的部分
- 不改人设生成、节奏锁、台词字数、参考图槽位等其他逻辑。
- 不动数据库、RLS、表结构。
- 纯 Prompt 文案 + 一处前端文案 tweak。

## 验证
- 触发一次「惊喜一下」，在 edge function 日志里确认 Prompt 包含 MALL INTERIOR / NO door 文案。
- 生成视频，肉眼检查开场镜头是否在商场走廊里、是否还出现推门动作或街景。如仍出现，进一步把负面词加到 Seedance Prompt 末尾的 NEGATIVE 段。
