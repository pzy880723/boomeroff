# 营销中心（AIGC）功能与 API 接口完整说明

> 面向 PC 端 AIGC 模块对接的工程文档。PC 端只要走同一个 Supabase 项目的后端（同 anon key + 同登录态），所有营销数据、图片、视频、发布任务都能复用。

- 后端 base URL：`https://narqwgwpqglathwtyevz.supabase.co`
- Edge Function 调用：`POST {base}/functions/v1/<函数名>`
- 数据查询：`{base}/rest/v1/<table>`（推荐直接用 `@supabase/supabase-js`）
- 所有请求需要 `apikey: <anon_key>` + `Authorization: Bearer <user_jwt>`（除非函数标注「公开」）
- anon key 在 `.env` 的 `VITE_SUPABASE_PUBLISHABLE_KEY` 中，公开可用

---

## 一、模块总览

```text
营销中心
├─ 1. 素材库  (MarketingLibrary)           图片 / 视频 / 文案 / 分镜统一仓库
├─ 2. AI 修图 (MarketingPhoto + AiImage)   单图美化 + 对话式 P 图
├─ 3. AI 文案 (MarketingCopy)              看图写小红书 / 视频号 / 朋友圈
├─ 4. AI 视频 (MarketingVideo)             脚本 → 分镜 → Seedance 渲染
├─ 5. 惊喜一下 (SurpriseVideoDialog)       一键随机生成 15 秒竖版
└─ 6. 内容分发 (dispatch/*)                多平台多账号扫码绑定 + 发布
   ├─ Accounts.tsx      扫码登录账号
   ├─ Workbench.tsx     选素材 → 选账号 → 发布
   ├─ History.tsx       发布历史
   └─ JobDetail.tsx     单任务详情 / 重试 / 取消
```

辅助：`marketing_characters`（人物参考图）、`shop_marketing_profiles`（店铺画像）、`kb_documents`（品牌知识库，影响所有 AI 生成口吻）。

---

## 二、核心数据表

> RLS 已开启：按 `shop_id + user_id` 过滤，同店铺员工互通；跨店看不到。PC 端登录后用同一套 client 即可，无需额外授权。
>
> Realtime 已开启：`marketing_assets`、`marketing_video_jobs`、`social_publish_jobs`、`social_publish_targets`。建议 PC 端用 `supabase.channel(...).on('postgres_changes', ...)` 订阅。

### `marketing_assets` —— 统一素材库

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | |
| `shop_id` | uuid | 必填 |
| `user_id` | uuid | 创建人 |
| `kind` | text | `image` / `video` / `copy` / `storyboard` |
| `input_image_urls` | text[] | 图片素材主链接放第 0 个 |
| `output_url` | text | 视频成片链接（火山 TOS） |
| `output_text` | text | 文案存这里（多候选 JSON 序列化） |
| `meta` | jsonb | 任意元数据：`{ job_id, model_id, resolution, description, from_video_id, ... }` |
| `sha256` | text | 上传时算的哈希，用于去重 |
| `tags` | text[] | 自由标签 |
| `category` | text | 品类 / 分类（含 `storyboard` 分镜头） |
| `published_at` / `published_platforms` | | 已分发记录 |
| `created_at` | timestamptz | |

### `marketing_video_jobs` —— Seedance 渲染任务

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | |
| `shop_id` / `user_id` | uuid | |
| `script` | jsonb | 脚本 + 分镜 + 模型 / 分辨率 / 角色 等配置 |
| `status` | text | `queued` / `running` / `rendering` / `ready_to_stitch` / `stitching` / `done` / `succeeded` / `failed` / `cancelled` |
| `provider` / `provider_task_id` | | 火山方舟任务 ID |
| `segment_index` / `segment_total` | | 多段渲染时的分段 |
| `segment_url` | | 单段产物 |
| `output_url` / `video_url` | | 最终视频链接 |
| `error` | text | 失败原因（已中文化） |
| `parent_job_id` | uuid | 子任务挂父任务 |
| `last_polled_at` / `finished_at` | | |

### `marketing_characters` —— 角色板（视频主角参考图）

`id, shop_id, name, auto_anchor, core_emotion, reference_image_url, last_frame_url, traits jsonb`

### `shop_marketing_profiles` —— 店铺画像

品牌调性、目标人群、品类、口吻……作为所有 AI 生成的 system prompt 上下文。

### `marketing_presets` —— 平台 / 口吻预设

`platform`、`tone` 的下拉枚举源，文案生成会读它。

### 内容分发相关

- **`social_accounts`** —— 绑定的自媒体账号
  `id, shop_id, platform, account_name, avatar_url, worker_account_id, cookie_status, capabilities jsonb, content_kinds text[]`
- **`social_platform_specs`** —— 各平台规则（PC 端按这个置灰按钮）
  `platform, label, supports_video, supports_image_text, title_max, body_max, tag_max, images_min, images_max, video_seconds_min, video_seconds_max, supports_schedule, needs_cover, enabled, sort_order`
- **`social_publish_jobs`** —— 发布主任务
  `id, shop_id, asset_id, kind('video'|'image_text'), title, body, tags[], images[], cover_url, media_url, per_platform jsonb, schedule_at, status, worker_file_path`
- **`social_publish_targets`** —— 子任务（按账号拆分，进度看它）
  `id, job_id, account_id, platform, status, progress, platform_post_url, error_message, last_step, retry_count`

平台代号：`xhs / wechat_video / douyin / kuaishou / bilibili / tiktok`

任务状态枚举：`queued / scheduled / running / success / failed / cancelled`（target）；`queued / scheduled / running / done / partial / failed / cancelled`（job）

### `kb_documents` —— 向量知识库

`id, source_type, source_id, shop_id, title, content, embedding vector, scopes text[], metadata jsonb, weight`

通过 `kb-search` 检索，决定文案 / 视频的口吻一致性。

---

## 三、Storage 存储桶

| Bucket | Public | 用途 |
|---|---|---|
| `product-images` | ✅ | 营销图片主桶（与商品共用） |
| `avatars` | ✅ | 角色 / 用户头像 |
| `marketing-videos` | ❌ | 视频渲染中间产物 |
| `voucher-screenshots` / `activity-posters` | ❌ | 营销外模块 |

> 视频最终 `output_url` 是火山 TOS 临时签名 URL，可能 403。**统一用 `download-marketing-asset` 走后端代理**，自带 attachment 头、支持 Range / 断点续传。

---

## 四、Edge Function 接口清单

通用请求格式：

```http
POST https://narqwgwpqglathwtyevz.supabase.co/functions/v1/<fn-name>
Authorization: Bearer <user_jwt>
apikey: <anon_key>
Content-Type: application/json

{ ...body... }
```

### A. 素材库 / 图片处理

| 函数 | Body | 返回 | 说明 |
|---|---|---|---|
| `auto-tag-marketing-asset` | `{ asset_ids: string[] }` | `{ ok, updated }` | 异步给素材打标签、写 `tags` `category` `meta.description` |
| `analyze-marketing-assets` | `{ asset_ids }` | `{ ok, results }` | 更详细的视觉描述 |
| `describe-marketing-images` | `{ image_urls: string[], shop_id? }` | `{ description, highlights }` | 单次看图描述（不入库） |
| `beautify-image` | `{ image_url, toggles, custom?, shop_id? }` | `{ asset_id, output_url }` | AI 修图美化 |
| `ai-image-chat` | `{ messages, image_urls, shop_id? }` | `{ reply, image_url? }` | 对话式 P 图 / 重绘 |
| `backfill-storyboard-assets` | `{}` | `{ migrated }` | 历史分镜静帧回填到素材库（管理员） |
| `download-marketing-asset` | `GET ?asset_id=&filename=` 或 `POST { asset_id, filename }` | 流式文件 + `Content-Disposition: attachment` | **PC 端下载入口**，支持 Range |

### B. AI 文案

| 函数 | Body | 返回 |
|---|---|---|
| `generate-marketing-copy` | `{ image_urls[1-9], platform('xhs'/'wechat_video'/'douyin'/...), tone, style?('scream'/'heal'/'story'/'flex'), product_name?, price?, highlight?, shop_id? }` | `{ success, candidates:[{title, body, hashtags[], first_comment}], asset_id }` |
| `generate-share-copy` | `{ product_id }` | 单品种草文案 |

### C. AI 视频（核心）

| 函数 | Body | 用途 |
|---|---|---|
| `marketing-video-brief-chat` | `{ messages, shop_id }` | 引导式对话收集 brief，返回 chip 选项 |
| `generate-marketing-video-script` | `{ brief, shop_id, character_id?, asset_ids? }` | 生成脚本 + 分镜列表（`scenes[]`） |
| `generate-character-board` | `{ shop_id, prompt, ref_image_url? }` | 生成角色板 |
| `ensure-auto-anchor-character` | `{ shop_id }` | 没有角色时自动建一个 |
| `storyboard-marketing-video` | `{ job_id 或 script_id, shop_id }` | Gemini 合成每个分镜高清静帧，静帧自动入库（`kind='storyboard'`） |
| `render-marketing-video` | `{ script, scenes[], character_id?, model_id('seedance-pro'/'fast'/'mini'), resolution('720p'/'1080p'/'4k'), shop_id, asset_id_hint? }` | 调 Seedance 2.0 渲染，落库 `marketing_video_jobs` |
| `poll-marketing-video` | `{ job_id }` | 主动轮询任务（也可换 Realtime） |
| `surprise-marketing-video` | `{ shop_id }` | 「惊喜一下」一键全自动 |

**状态机**：`queued → running → rendering → done`（失败 → `failed` + `error`）。PC 端推荐订阅 `marketing_video_jobs` Realtime，无需轮询。

### D. 内容分发

| 函数 | Body | 返回 | 说明 |
|---|---|---|---|
| `dispatch-account-list` | `{ shop_id }` | `{ accounts: SocialAccount[] }` | 聚合 worker 在线状态 |
| `dispatch-account-login` | `{ shop_id, platform }` | **SSE 流**：`{step:'qr'\|'scanned'\|'confirmed'\|'success'\|'fail', qr?, account_id?, msg?}` | 二维码 base64 在 `qr` |
| `dispatch-account-revoke` | `{ account_id }` | `{ ok }` | 解绑 |
| `dispatch-job-create` | `{ shop_id, asset_id, kind('video'\|'image_text'), account_ids[], title, body, tags[], cover_url?, per_platform?, schedule_at?, images?[] }` | `{ job_id }` | 创建发布主任务 |
| `dispatch-job-status` | `{ job_id }` | `{ job, targets[] }` | 查任务状态 |
| `dispatch-job-cancel` | `{ job_id }` | `{ ok }` | 取消 |
| `dispatch-job-retry` | `{ target_id }` 或 `{ job_id }` | `{ ok }` | 重试 |
| `dispatch-cron-tick` | 内部定时器，无需手动调 | — | |

PC 端发布工作台**必须**读 `social_platform_specs`，根据 `kind` 灰掉不支持的账号。

### E. 知识库 / RAG

| 函数 | Body | 返回 |
|---|---|---|
| `kb-search` | `{ query, scope('image'\|'copy'\|'video'\|'chat'), shop_id?, k? }` | `{ hits: [{title, content, similarity, source_type, ...}] }` |
| `kb-ingest` | `{ source_type, source_id }` | 触发器自动调，一般不手动 |
| `kb-accept` | 管理员审核 | — |
| `chat-knowledge` | `{ messages, shop_id, scope }` | RAG 对话回答 |
| `generate-shop-profile` | `{ shop_id, hints }` | 自动生成店铺画像 |
| `generate-shop-kb` | `{ shop_id }` | 拉门店 SOP / QA |

### F. 辅助

| 函数 | 用途 |
|---|---|
| `test-ai-model` | 后台调试 AI 模型配置 |
| `compress-storage` | 旧素材压缩（cron） |
| `compute-importance` | 素材重要度评分（cron） |

---

## 五、PC 端典型流程示例

### 1. 列素材库（分页 + 标签筛选）

```ts
const { data } = await supabase
  .from('marketing_assets')
  .select('id, kind, input_image_urls, output_url, output_text, tags, category, meta, created_at')
  .eq('shop_id', shopId)
  .in('kind', ['image', 'video'])
  .contains('tags', ['夏季'])                // 可选
  .order('created_at', { ascending: false })
  .range(0, 39);
```

### 2. 上传图片（直传 Storage + 写库 + 异步打标 + sha256 去重）

```ts
const sha256 = await sha256OfBlob(blob);
const { data: dup } = await supabase
  .from('marketing_assets')
  .select('id').eq('shop_id', shopId).eq('sha256', sha256).maybeSingle();
if (dup) return dup;                          // 秒传命中

const path = `${shopId}/${crypto.randomUUID()}.webp`;
await supabase.storage.from('product-images')
  .upload(path, blob, { contentType: 'image/webp' });
const url = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;

const { data: row } = await supabase.from('marketing_assets').insert({
  shop_id: shopId, user_id: userId, kind: 'image',
  input_image_urls: [url], sha256, category: '产品图',
}).select().single();

supabase.functions.invoke('auto-tag-marketing-asset', { body: { asset_ids: [row!.id] } });
```

### 3. 生成视频 + Realtime 进度

```ts
const { data } = await supabase.functions.invoke('render-marketing-video', {
  body: { script, scenes, character_id, model_id: 'seedance-pro', resolution: '1080p', shop_id: shopId },
});
const jobId = data.job_id;

supabase.channel(`job-${jobId}`)
  .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'marketing_video_jobs', filter: `id=eq.${jobId}` },
      payload => updateUI(payload.new))
  .subscribe();
```

### 4. 多平台发布

```ts
const { data } = await supabase.functions.invoke('dispatch-job-create', {
  body: {
    shop_id: shopId, asset_id, kind: 'video',
    account_ids, title, body, tags, cover_url,
  },
});
// 订阅 social_publish_targets 看实时进度
supabase.channel(`pub-${data.job_id}`)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'social_publish_targets', filter: `job_id=eq.${data.job_id}` },
      payload => updateTargets(payload.new))
  .subscribe();
```

### 5. 下载视频（绕过 TOS 403）

```ts
const url = `${SUPABASE_URL}/functions/v1/download-marketing-asset?asset_id=${assetId}&filename=demo.mp4`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY } });
const blob = await res.blob();
saveAs(blob, 'demo.mp4');
```

### 6. SSE 扫码登录账号

```ts
const url = `${SUPABASE_URL}/functions/v1/dispatch-account-login`;
const res = await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ shop_id: shopId, platform: 'douyin' }),
});
const reader = res.body!.getReader();
const decoder = new TextDecoder();
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  for (const chunk of decoder.decode(value).split('\n\n')) {
    const line = chunk.split('\n').find(l => l.startsWith('data:'));
    if (!line) continue;
    const evt = JSON.parse(line.slice(5).trim());
    // evt.step = qr | scanned | confirmed | success | fail
    handleStep(evt);
  }
}
```

---

## 六、对接注意事项

1. **登录态共享**：PC 端必须用同一个 Supabase 项目的 Auth。`signInWithPassword` 后 session 自动满足 RLS，所有写入查询带 `shop_id` 即可。
2. **`shop_id` 必填**：用户可能属于多个店铺，PC 端要做店铺切换器（参考 `useShops`），所有 insert / select / function body 都带 `shop_id`。
3. **错误中文化**：参考 `src/lib/invokeFn.ts`。Edge Function 失败响应里都带人话化 `error` 字段，建议复用映射。
4. **视频偏好**：`model_id` / `resolution` 用 `localStorage` 记忆（参考 `src/lib/videoModelPrefs.ts`）。
5. **平台规则**用 `social_platform_specs` 表，**不要硬编码**。
6. **Seedance 失败**：账号未开模型 / 内容审核 / 输入图含真人——`src/lib/videoFailure.ts` 已有完整映射 + 修复建议按钮。
7. **下载视频走 `download-marketing-asset`**，不要直接拉 TOS URL。
8. **Realtime 而非轮询**：`marketing_video_jobs` / `social_publish_targets` 都已加入 publication，订阅即可。
