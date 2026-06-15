
# 营销中心 v3 调整方案

## 1. 视觉小调整（前端 only）

**StepBar 居中**（`src/pages/marketing/StepBar.tsx`）
- 当前 `flex-1` 让进度条占满整行，视觉上贴边。改为内容紧凑居中：外层 `justify-center`，去掉 step item 上的 `flex-1`，连接线改成定宽（如 `w-8`），让整条步骤条像一段印章居中浮在页面顶部。

**去掉模块右上角的数字角标**（`src/pages/MyMarketing.tsx`）
- 图片/文案 `ToolTile`：删除 `count > 0` 的 badge。
- AI 视频 row：删除 `counts.video` badge。
- 数据统计仍然保留在 Hero 区（"图片 X / 文案 X / 视频 X"），只是不再在每张卡的右上角重复。

## 2. 素材库（`src/pages/marketing/MarketingLibrary.tsx`）

支持「选择 + 编辑 + 删除」：

- 顶部加一个「管理」按钮，进入多选模式：每张卡左侧出现勾选框，底部出现操作条（已选 N · 删除 · 取消）。
- 单条点击进入详情抽屉（Dialog）：
  - **文案**：把 `output_text` 当作 JSON `JSON.parse`，按候选展示标题 / 正文 / 话题 / 首评；每段一个「复制」按钮；正文可就地编辑、保存（写回 `marketing_assets.output_text`）。
  - **图片**：大图 + 复制原图链接 + 下载。
  - **视频**：状态徽章 + 脚本逐镜展示（只读，因为已入队）。
- 删除：`delete from marketing_assets where id in (...) and user_id = auth.uid()`（RLS 已限定本人）。

**关键 fix：文案列表卡片不再展示原始 JSON**
- 现在卡片把 `it.output_text.slice(0,120)` 直接渲染，所以会看到 `[{"title":"…`。改为：解析后取第一个候选的 `title || body` 显示纯文本预览；解析失败 fallback 到去掉花括号的 raw。

## 3. 视频：文生视频 + 图片辅助（不是图片拼接）

把"图片拼接式短视频"改成"AI 文生视频，图片只作为视觉参考 / 锚点"。

**前端 `MarketingVideo.tsx`**
- 步骤改为：`脚本立意 → 参考图（可选）→ 确认分镜 → 生成视频`。
- 顶部多一个**主要输入框**："这条视频想讲什么 / 主题 / 一句话"。
- 图片上传保留，但写明"可选 · 用于风格 / 商品 / 店面参考，不是必须"。
- 移除"素材充足度诊断"硬门槛：变成软提示——如果选了"产品展示 / 新品上架"且没有参考图，只是黄色提示，不阻塞。
- 分镜确认：每个 scene 不再强绑定 `image_index`，改成可选「参考图：第 N 张 / 无」。
- "确认渲染" 时调用同一个 `render-marketing-video`，把 `script.mode = 'text2video'`、`reference_image_urls = urls` 一起塞进去。

**Edge function 改造**
- `generate-marketing-video-script`：prompt 改成"基于主题 + 可选参考图生成 6–8 个文生视频镜头描述（每镜一段 video prompt + 字幕 + 时长 + 推荐参考图 index 或 null）"。输出 schema 加 `video_prompt` 字段，`image_index` 改为可空。
- `render-marketing-video`：保持现状（仍是入队），落库 meta 加 `mode: 'text2video'`，为后续接入视频模型预留。当前 worker 不变。

## 4. 文案风格扩展

`MarketingCopy.tsx` 的 `TONES` 当前只有 4 个。扩展为分组、共 ~12 个：

```
情绪类：种草 · 治愈 · 怀旧 · 偶遇
故事类：探店 · 翻筐日记 · 主理人手记 · 顾客来信
专业类：藏家分享 · 年代考据 · 工艺解读
推新类：上新 · 限定到店
```

- UI：按分组横向 chip，分组之间用一根 `border-accent/15` 细线。
- Edge function `generate-marketing-copy`：扩 `Tone` 联合类型 + 对应 `TONE_BRIEF` 文本（每种 1 句给 AI 的写法约束），保留旧 4 个不变以兼容老数据。
- 数据库：`tone` 只是字符串存在 `meta.tone`，不需要 migration。

## 5. 预设管理入口（重点）

把"品牌信息 / 视频镜位规则 / 文案 tone 描述 / 平台描述"这些目前**硬编码在 edge function** 的预设，搬到数据库 + 后台 UI。

**数据模型**

新建表 `marketing_presets`（key/value 单行配置，admin only）：

```sql
create table public.marketing_presets (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,        -- 'brand_system_prompt' | 'tone_brief' | 'platform_brief' | 'video_type_rules'
  value jsonb not null,
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id)
);
grant select on public.marketing_presets to authenticated;
grant all on public.marketing_presets to service_role;
alter table public.marketing_presets enable row level security;

create policy "all auth can read presets" on public.marketing_presets
  for select to authenticated using (true);
create policy "admin write presets" on public.marketing_presets
  for all to authenticated
  using (has_role(auth.uid(), 'admin'))
  with check (has_role(auth.uid(), 'admin'));
```

种子数据：把当前 `brand-context.ts` 里的 4 段内容 upsert 进去。

**Edge function 改造**

`_shared/brand-context.ts` 新增 `loadPresets(admin)`：
- 从 `marketing_presets` 读全部 4 个 key；
- 任意一个缺失 fallback 到代码里的常量（保持向后兼容）。
- `generate-marketing-copy` / `generate-marketing-video-script` / `analyze-marketing-assets` 全部改为先 `await loadPresets()` 再拼 prompt。

**后台 UI**

`src/pages/Portal.tsx` 新增 tab「营销预设」→ 新组件 `src/components/admin/MarketingPresetsPanel.tsx`：
- 一张表格 + 4 张可折叠卡片，对应 4 个 key。
- `brand_system_prompt`：大 textarea，可直接改品牌话术。
- `platform_brief` / `tone_brief`：键值列表，可增删改每个平台/口吻的描述。
- `video_type_rules`：每个视频类型可改 label / required slots / recommended / scriptHint。
- 保存：`upsert into marketing_presets`，立即生效（下一次生成自动读到新版）。
- 右上有"恢复默认"按钮（用代码常量回写）。

## 技术细节区

**文案 JSON 解析（库列表卡片）**
```ts
function previewOf(asset): string {
  if (asset.kind !== 'copy' || !asset.output_text) return '';
  try {
    const arr = JSON.parse(asset.output_text);
    const first = Array.isArray(arr) ? arr[0] : arr;
    return (first?.title || first?.body || '').replace(/\n+/g, ' ').slice(0, 80);
  } catch { return asset.output_text.replace(/[\[\]{}"`]/g, '').slice(0, 80); }
}
```

**StepBar 居中改写**
```tsx
<div className="flex items-center justify-center gap-2 px-0.5">
  {steps.map(...)
    <div className="flex items-center gap-2 shrink-0">
      <Circle/> <Label/>
      {i < last && <div className="h-px w-8 bg-..." />}
    </div>
  )}
</div>
```

**视频脚本 schema 新版（核心字段）**
```ts
{ hook: { video_prompt, text, duration_s, image_index?: number|null, motion },
  scenes: [...same],
  outro: {...same},
  mode: 'text2video',
  reference_image_urls: string[] }
```

## 受影响文件

前端：
- `src/pages/MyMarketing.tsx`（去角标）
- `src/pages/marketing/StepBar.tsx`（居中）
- `src/pages/marketing/MarketingLibrary.tsx`（选择/编辑/删除/解析 JSON）
- `src/pages/marketing/MarketingCopy.tsx`（扩展 tone 分组）
- `src/pages/marketing/MarketingVideo.tsx`（文生视频流程）
- `src/pages/Portal.tsx`（新 tab）
- 新建 `src/components/admin/MarketingPresetsPanel.tsx`
- 新建 `src/components/marketing/AssetDetailDialog.tsx`

后端：
- 新建表 `marketing_presets` + RLS + 种子
- 改 `supabase/functions/_shared/brand-context.ts`（加 `loadPresets`）
- 改 `generate-marketing-copy/index.ts`（扩 tone + 读 preset）
- 改 `generate-marketing-video-script/index.ts`（text2video schema + 读 preset）
- 改 `analyze-marketing-assets/index.ts`（读 preset；改为软提示，不阻塞）
- `render-marketing-video/index.ts` 只多记录 mode 字段

不变：业务表 `marketing_assets` / `marketing_video_jobs` schema 保持不变。

---

确认这个方案吗？确认后我会一次性按以上顺序实现完。
