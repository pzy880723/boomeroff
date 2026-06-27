# 同时保留「插画风」和「真人写实」两种分镜风格

参考火山 Seedance 2.0 提示词指南（`docs.volcengine.com/82379/2222480`）。

## 一、产品决策

- 保留现有插画风 prompt（用户喜欢，且能稳过火山审核）。
- **新增「真人写实」选项**，作为另一条独立 prompt 路线。
- 用户在前端**显式选择**画风（不再用关键词自动判定），默认保持现状 = 插画风，避免破坏现有体验。

## 二、改动

### 1. 共享类型

新增 `supabase/functions/_shared/realism.ts`：
```ts
export type Realism = 'stylized' | 'photoreal';
export const DEFAULT_REALISM: Realism = 'stylized';
```

前端镜像一份 `src/lib/realism.ts`，并提供文案：
- `stylized` → 「插画风（默认，过审稳）」
- `photoreal` → 「真人写实（细节最真）」

### 2. `supabase/functions/storyboard-marketing-video/index.ts`

`buildFramePrompt` 拆成两个分支：

- `stylized`：完全保留现有 prompt，一字不改。
- `photoreal`（新）：
  - 顶部：`真人级写实电影摄影静帧 (photorealistic cinematic still, 35/50mm, f/2.0)，自然肤质 / 真实毛孔 / 自然瞳孔反光 / 真实景深，让人无法分辨是 AI`
  - 主体段：去掉"插画感面部"措辞；强调"五官、发型、肤色、体型与人脸参考图完全一致，不得换脸"，按火山推荐**大头照在前、全身照在后**排列 ref。
  - 场景段：保留"实景照绑定"逻辑，加"颜色/陈列/光线严格还原实拍"。
  - 画质 + 约束（用火山官方模板）：
    - "高清，细节丰富，电影质感，色彩自然，光影柔和"
    - "真人写实，非动漫，非卡通，非插画，非 3D 渲染"
    - "不要生成任何文字、字幕、水印、Logo；禁止双胞胎/分身；禁止面部畸变、多余手指、塑料皮肤、过度磨皮"

入参增加 `realism`,不传则用 `DEFAULT_REALISM = 'stylized'`。

### 3. `supabase/functions/render-marketing-video/index.ts`

同样按 `realism` 切两条 prompt 尾段：

- `stylized`：保留现有写法。
- `photoreal`：按官方进阶公式 `精准主体 + 动作 + 场景 + 光影 + 运镜 + 风格 + 画质 + 约束`：
  - 主体定义置顶：`将参考图1（大头照）的女主定义为主体1`，全程用「主体1」指代；
  - 镜头按「镜头 1/2/3」时序，单镜单运镜；
  - 尾段画质+约束词同上 storyboard photoreal 模板，并加 `视频全程禁止出现外形、着装、配饰完全一致的人物，禁止生成同款分身、双胞胎效果`。
- 已有的「real-person 拒审 → 自动降级 stylized 重试」逻辑保留；photoreal 路线触发拒审时自动落回 stylized，整条视频不会失败。

### 4. 前端 UI

加一个**轻量的画风选择器**，不破坏现有版面：

- `src/pages/marketing/MarketingVideo.tsx`：在"生成分镜静帧"按钮旁边加一个 `RealismToggle`（Segmented：插画风 / 真人写实），默认插画风；调用 `storyboard-marketing-video` 和后续 `render-marketing-video` 时透传 `realism`。
- `src/lib/surpriseJob.ts` + `src/pages/marketing/MyMarketing.tsx`（惊喜一下入口）：同一个 toggle 也放在惊喜弹窗里，记忆到 `localStorage`（`boomer.realism`），下次默认沿用。
- 新组件 `src/components/marketing/RealismToggle.tsx`：12px chip 双选，符合现有视觉。

### 5. 持久化

新建 `src/lib/realismPref.ts`：`getRealism() / setRealism()`，`localStorage` key `boomer.realism`，缺省返回 `'stylized'`。

## 三、不动

- 现有插画风 prompt 一字不改。
- 不改数据库、不动素材库相关代码。
- 不加管理后台开关。

## 四、影响文件

- 新增 `supabase/functions/_shared/realism.ts`
- 新增 `src/lib/realism.ts`、`src/lib/realismPref.ts`
- 新增 `src/components/marketing/RealismToggle.tsx`
- 改 `supabase/functions/storyboard-marketing-video/index.ts`
- 改 `supabase/functions/render-marketing-video/index.ts`
- 改 `src/pages/marketing/MarketingVideo.tsx`
- 改 `src/pages/marketing/MyMarketing.tsx`
- 改 `src/lib/surpriseJob.ts`（透传 realism）
