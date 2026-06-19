## 目标

1. 视频参考图从最多 6 张放宽到 **20 张**；AI 写脚本时按镜头智能匹配挑图。
2. 素材库新增 **角色库（人物）** Tab，店铺共享；支持上传人物照、或一键 AI 生成"角色身份板"。
3. 视频生成可选择 1 个角色，渲染时强制角色一致性。
4. **多段视频（>12s）即使用户没选角色，系统也会自动先生成一张兜底角色身份板**，把它作为所有分段的"角色锚点"，避免人物在分段之间跳脸。

---

## 1. 数据层（migration）

新表 `marketing_characters`（店铺共享）：

```
id uuid pk, shop_id uuid not null fk shops, created_by uuid not null,
name text not null,                 -- 例 "店长 Aki"
role_label text,                    -- 例 "店长" / "顾客" / "模特"
cover_url text not null,            -- 角色身份板大图
ref_image_urls jsonb default '[]',  -- 用户上传的人物参考照
prompt text,                        -- 生成时用的最终 prompt
core_emotion text, visual_signature text,  -- 文字描述，喂给 video prompt
source text not null,               -- 'uploaded' | 'ai_generated' | 'auto_anchor'
auto_anchor boolean default false,  -- 多段视频自动生成的兜底角色
meta jsonb default '{}',
created_at timestamptz default now()
```

GRANT + RLS：店铺成员可读写自己店的角色（按 `shops` 现有归属判定，沿用项目内 helper）；admin/super_admin 全权。

`marketing_video_jobs.script` 内新增字段 `character_id`、`character_cover_url`、`character_signature`（无需 schema 改，存 jsonb 即可）。

---

## 2. 前端

### 2.1 参考图上限放宽
- `MarketingVideo.tsx`：`max` 由 6 改为 20；`LibraryImagePickerDialog` 的 max 同步；提示文案改为"最多 20 张"。
- `UploadGrid` 网格保持紧凑 3-4 列。

### 2.2 素材库新增"角色"Tab
- `MarketingLibrary.tsx`：在 Tabs 增加"角色"页，复用图库网格风格。
- 新组件 `src/components/marketing/CharacterCard.tsx`：方块封面 + 名字 + 角色标签。
- 新组件 `src/components/marketing/CharacterDialog.tsx`：
  - 详情：大图 + 参考照缩略图行 + 文字签名
  - 操作：编辑名字 / 删除 / 重新生成
- 新组件 `src/components/marketing/CharacterCreateDialog.tsx`：
  - 两种入口：① 上传人物照（直接保存为角色） ② AI 生成（必填：名字、角色描述；选填：上传 1-3 张主体参考照）
  - 调用 `generate-character-board` edge function，流式预览，完成后落库。

### 2.3 视频页选择角色
- `MarketingVideo.tsx` 新增"角色（可选）"区域：
  - 横滑选择已有角色（来自当前店铺）+「新建角色」入口
  - 选中后：身份板大图 + 名字显示在 chip 上
- 选中的 `character_id`、`character_cover_url`、`character_signature` 一起带进 `generate-marketing-video-script` 与 `render-marketing-video`。

### 2.4 多段兜底逻辑（前端）
- 用户点"确认脚本，开始渲染"时：若 `duration > 12` 且未选角色：
  - 弹一个轻提示"为保证角色不变脸，正在生成兜底角色…"
  - 调 `ensure-auto-anchor-character` edge function（同步等待 ≤30s），返回的 character 自动注入脚本后再渲染。

---

## 3. Edge Functions

### 3.1 新建 `generate-character-board`
- Body: `{ shop_id, name, role_label?, subject_image_urls?: string[], extra_desc? }`
- 使用 **Gemini Nano Banana 2 (`google/gemini-3.1-flash-image-preview`)** via `/v1/images/generations`（OpenRouter chat-completions image shape，aspect 16:9，stream=true → 后端 buffer 出最终 PNG）。
- Prompt = 用户给定的固定模板（中文，1.5k 字），主体描述拼接 `name + role_label + extra_desc`；如带 `subject_image_urls`，作为 `image_url` 块塞进 messages（multimodal）做形象锁定。
- 上传产物到 `marketing-videos` bucket 下 `characters/{shop_id}/{id}.png`，落 `marketing_characters` 记录，返回 `character`。

### 3.2 新建 `ensure-auto-anchor-character`
- Body: `{ shop_id, video_type, style, brief_summary }`
- 先查 `marketing_characters where shop_id=? and auto_anchor=true and meta->>video_type=? limit 1`，命中直接返回。
- 否则用 Lovable AI (`gemini-3-flash-preview`) 把 brief/视频类型/风格压缩成一句"角色设定"（如"30+ 文艺女店长，棕色短发，米白色亚麻衬衫…"），再调 `generate-character-board` 内部逻辑生成一张并存库，标 `auto_anchor=true`。

### 3.3 改 `generate-marketing-video-script`
- 新增入参 `character` `{name, role_label, signature, cover_url}`。
- system prompt 加段："本片固定主角：{name}（{role_label}）。外观锁：{signature}。每个出现人物的镜头都使用该主角，禁止换人换装。"
- 当 `image_urls.length` 多（>6）时，prompt 显式说明"`image_urls` 是素材池，按场景从中挑选最贴合的一张，输出 image_index"，并要求 AI 不要全部用同一张。
- 返回 script 内带回 `character` 字段。

### 3.4 改 `render-marketing-video`
- `buildPrompt` 顶部加入："主角锁定：{name} — {signature}。每段必须出现同一主角，面部、发型、服装、体型严格一致。"
- 多段路径下，**每段都把 `character_cover_url` 作为 `first_frame` 图片** 传给 Seedance（不只是第 1 段），最大化跨段一致性。若该段已有镜头参考图，则把角色板作为附加 `image_url` 而非 first_frame（Seedance 仅支首帧时退回首帧策略，由 model capability 判定）。
- 单段路径同上：若选了角色，优先用角色板做 first_frame（除非用户镜头本就有强引导参考图）。

---

## 4. 受影响文件

新建：
- `supabase/migrations/<ts>_marketing_characters.sql`
- `supabase/functions/generate-character-board/index.ts`
- `supabase/functions/ensure-auto-anchor-character/index.ts`
- `src/components/marketing/CharacterCard.tsx`
- `src/components/marketing/CharacterDialog.tsx`
- `src/components/marketing/CharacterCreateDialog.tsx`
- `src/components/marketing/CharacterPicker.tsx`（视频页用）

编辑：
- `src/pages/marketing/MarketingVideo.tsx`（max=20、角色选择、兜底逻辑）
- `src/pages/marketing/MarketingLibrary.tsx`（新增角色 Tab）
- `src/components/marketing/LibraryImagePickerDialog.tsx`（max 上限同步）
- `supabase/functions/generate-marketing-video-script/index.ts`
- `supabase/functions/render-marketing-video/index.ts`

---

## 5. 风险与说明

- 兜底角色板生成会让多段视频首次提交多等 15-25 秒；同店铺同类型只会生成一次，之后命中缓存。
- Seedance 对首帧引导力度有限，跨段一致性是"显著改善"而非"绝对一致"；prompt 锁 + 同一首帧已是当前管线下最强手段。
- 角色板里的中文文字（名字、Mood 等）由 Nano Banana 2 渲染，少量错字可接受；这张图主要给 AI 当形象锚，不是给观众看的成片。
