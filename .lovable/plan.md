## 目标
把上一轮欠下的 3 件事补齐：批量预检角色、记住每个角色的"通过套路"、在视频详情里能看到每段走的是哪条降级链。

## 1. 角色页"一键预检全部角色"
- 在 `MarketingLibrary.tsx` 的角色 Tab 顶部新增按钮 **「一键预检全部未认证角色」**。
- 点击后弹确认（"将依次为 N 个未认证角色生成 Character Sheet 软通过封面，约耗时 N × 2s"），开始顺序执行：
  - 跳过已有 `verified_asset_uri` 的角色；
  - 对每个角色调用新的 edge function `character-preflight`，内部复用 `softPassFaceImage(cover_url)` 生成软通过封面 → 上传 → 把签名 URL 写回 `marketing_characters.verified_asset_uri`（标记 `verified_at = now()`、`meta.verify_kind = 'character_sheet'`），区别于"真人活体认证"。
  - UI 用 `UploadProgressTiles`-风格的进度条展示 `已完成 X / 共 Y`，失败的角色聚合成可重试列表。
- 完成后刷新角色列表，每张卡上"未认证"徽章变成"已软通过"（绿色，区别于真人认证的「已认证」）。

## 2. `face_pass_level` 持久化
- 新增数据库列 `marketing_characters.face_pass_level text default 'auto'`，取值 `auto | character_sheet | illustration | faceless`。
- 渲染链路改造：
  - `MarketingVideo.tsx` 和 `SurpriseVideoDialog.tsx` 在拼 render body 前，如果角色记录里 `face_pass_level !== 'auto'` 且本次 overrides 未指定，则把它带进 `face_pipeline` 字段。
  - 用户在错误卡里点「一键软通过」/「插画化」/「无人化」后，除了 `reRender`，还把这个选择 `UPDATE` 到当前角色的 `face_pass_level`，下次自动套用，不再被拦。
- `CharacterDialog.tsx` 增加只读展示 + 「重置为自动」按钮，方便用户回到默认。

## 3. VideoJobDetailPanel：每段"软通过"标签
- 新增数据库列 `marketing_video_jobs.fallback_notes jsonb default '[]'::jsonb`（每段一行，记录 `face_soft_pass_applied / face_soft_pass_auto / dropped_first_frame / text_only` 等）。
- 修改 `render-marketing-video/index.ts`：现有 `fallbackNotes` 数组写回子任务和父任务的 `fallback_notes` 列。
- 新建 `src/components/marketing/VideoJobDetailPanel.tsx`：
  - props: `jobId`；订阅 `marketing_video_jobs` realtime + 5s 轮询；
  - 顶部显示父任务进度（复用 `surpriseJob` 的 progress 字段）；
  - 列表每段显示「段 N · 状态 · 模型 · 时长」，并把 `fallback_notes` 翻译成中文徽章：
    - `face_soft_pass_applied` → 「软通过 ✓」（绿）
    - `face_soft_pass_auto` → 「自动软通过」（蓝）
    - `dropped_first_frame` → 「去首帧」（灰）
    - `text_only` → 「纯文本兜底」（橙）
- 接入位置：`MarketingVideo.tsx` / `SurpriseVideoDialog.tsx` 渲染中状态下，把当前进度条改成可点开的卡片，点击展开 `VideoJobDetailPanel`。

## 技术细节
- 迁移 SQL（两列 + 索引）：
  ```sql
  ALTER TABLE public.marketing_characters
    ADD COLUMN IF NOT EXISTS face_pass_level text NOT NULL DEFAULT 'auto'
    CHECK (face_pass_level IN ('auto','character_sheet','illustration','faceless'));

  ALTER TABLE public.marketing_video_jobs
    ADD COLUMN IF NOT EXISTS fallback_notes jsonb NOT NULL DEFAULT '[]'::jsonb;
  ```
  现有 RLS / GRANT 不变。
- 新 edge function `character-preflight`：入参 `{ character_ids: string[] }`，按 shop 校验权限，逐个跑 `softPassFaceImage`，返回 `{ ok, results: [{id, status, error?}] }`。`verify_jwt = false`，内部用 `getUser` 校验。
- 前端通过 `supabase.functions.invoke('character-preflight', { body: { character_ids: [...] } })` 顺序调用，避免一次请求超时。

## 不做
- 不动 `IdentityVerifyDialog` / 真人活体认证流程。
- 不改现有提示词或渲染策略选择逻辑。