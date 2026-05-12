
## 目标

把游客版首次引导从「拍照 / 中古圈 / 品牌」三步，改为聚焦"用法主线"的四步：
拍照引导 → 多角度拍摄 → 一键生成文案 → 匿名分享中古圈。

前两步在扫一扫页有真实 UI 可高亮；后两步发生在结果页，引导阶段无法跨页高亮，所以用「无 target 的全屏插画卡」展示，复用已有的居中兜底布局。

## 4 步内容

```text
1. 拍照引导   — 高亮「启动摄像头 / 快门」按钮
   标题：对准它，按下快门
   描述：让物件占满画面 2/3，AI 1-3 秒读懂年代、产地与故事。

2. 多角度拍摄 — 高亮顶部「多角度合并」分段按钮
   标题：复杂物件，多拍几张更准
   描述：切到「多角度合并」最多 5 张，正面、底款、铭牌一起送 AI 综合判断。

3. 一键生成文案 — 全屏插画卡（无高亮目标）
   标题：识别完，自动写好种草文
   描述：小红书 / 朋友圈 / 微信三种风格随便切，复制即用。

4. 匿名分享中古圈 — 全屏插画卡（无高亮目标）
   标题：让更多人看见你的发现
   描述：一键以「游客」身份匿名发布，不需要登录、不留账号。
```

## 技术改动

**新增 id**
- `src/components/recognition/CameraStage.tsx`：给「多角度合并」按钮加 `id="onboard-multi-mode"`（当前在分段切换栏中，第二个 button）。
- 已有：`onboard-start-camera`（快门按钮）。

**`src/components/public/GuestOnboarding.tsx`**
- `OnboardStep` 增加可选 `icon?: LucideIcon` 字段（用于无 target 的插画卡）。
- 当 `targetId` 找不到对应元素时，已有居中兜底布局；在该布局里渲染 icon + 标题 + 描述，作为「无目标插画卡」。
- 进度点和"跳过 / 下一步 / 开始体验"按钮保持不变。

**`src/pages/public/PublicScan.tsx`**
- 重写 `ONBOARD_STEPS` 为上述 4 步；`logo / community-tab` 步骤删除。
- 第 3、4 步仅传 `icon`，不传 `targetId`（或传一个不存在的占位 id），自动落到居中插画卡分支。

## 不动

- 记忆方式：仍为「每次进入都展示」。
- 登录版、识别逻辑、edge functions、PublicResult 页本体。
- PublicLayout 中已有的 `onboard-logo` / `onboard-community-tab` id 保留无副作用，可后续清理（本次不强求）。
