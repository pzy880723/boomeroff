# 营销中心（AIGC）功能与 API 接口完整说明

下面这份文档把当前 H5 营销中心（`/marketing/*`）的所有功能模块、数据表、Edge Function 接口、存储桶都整理成一份「PC 端对接清单」。PC 端只要走同一个 Supabase 后端（同 anon key + 同登录态），所有数据、图片、视频都能复用。

> 后端 base URL（Edge Function 调用都用这个域名）
> `https://narqwgwpqglathwtyevz.supabase.co/functions/v1/<函数名>`
> 公共 anon key 已在前端 `.env` 暴露，PC 端直接复用即可。
> 所有接口都需要带 `Authorization: Bearer <user_access_token>`（用户必须先用 Supabase Auth 登录），除非下文标注「公开」。
> 多数函数请求体是 JSON，响应也是 JSON；建议 PC 端直接用 `@supabase/supabase-js` 的 `functions.invoke()`，效果等价于 `POST` + Authorization 头。

---

## 一、功能模块总览

H5 营销中心一共分 6 大块，PC 端建议 1:1 复刻：

```text
营销中心
├─ 1. 素材库 (MarketingLibrary)        图片 / 视频 / 文案统一仓库
├─ 2. AI 修图 / 美化 (MarketingPhoto + AiImage)
├─ 3. AI 文案 (MarketingCopy)          看图写小红书/视频号/朋友圈
├─ 4. AI 短视频 (MarketingVideo)       脚本→分镜→Seedance 渲染
├─ 5. 惊喜一下 (SurpriseVideoDialog)   一键随机生成 15 秒竖版
└─ 6. 内容分发中心 (dispatch/*)        多平台多账号发布工作台
   ├─ Accounts.tsx     账号扫码登录
   ├─ Workbench.tsx    选素材→选账号→发布
   ├─ History.tsx      发布历史
   └─ JobDetail.tsx    单任务详情/重试/取消
```

辅助：角色板（marketing_characters，存「人物参考图」）、店铺画像（shop_marketing_profiles）、品牌知识库（kb_documents / kb-search）。

---

## 二、核心数据表（PC 端直接通过 PostgREST 读写，遵循 RLS）

| 表 | 字段要点 | 用途 |
|---|---|---|
| `marketing_assets` | `id, shop_id, user_id, kind('image'/'video'/'copy'/'storyboard'), input_image_urls, output_url, output_text, meta jsonb, sha256, tags text[], category, created_at` | 统一素材库；视频用 `output_url`，图片放 `input_image_urls[0]`，文案放 `output_text` |
| `marketing_video_jobs` | `id, asset_id, shop_id, status('queued'/'running'/'rendering'/'done'/'failed'...), progress, output_url, error_message, meta jsonb, model_id` | Seedance 渲染任务，前端轮询用 |
| `marketing_characters` | `id, shop_id, name, reference_image_url, last_frame_url, traits jsonb` | 角色板（视频里的"主角参考图"） |
| `shop_marketing_profiles` | 店铺画像（品牌调性、目标人群、品类） | 给 AI 生成做上下文 |
| `marketing_presets` | 平台/口吻预设（小红书、朋友圈…） | 文案生成的 system prompt 拼装用 |
| `social_accounts` | `id, shop_id, platform, account_name, avatar_url, worker_account_id, cookie_status` | 已绑定的自媒体账号（抖音/小红书/视频号/快手/B站） |
| `social_platform_specs` | `platform, supports_video, supports_image_text, title_max, body_max, images_max, video_seconds_max ...` | 各平台规则（PC 端要按这个置灰按钮） |
| `social_publish_jobs` | `id, shop_id, asset_id, kind, title, body, tags, images, cover_url, media_url, per_platform jsonb, status` | 发布主任务 |
| `social_publish_targets` | `id, job_id, account_id, platform, status, progress, platform_post_url, error_message` | 单账号子任务，进度走它 |
| `kb_documents` | 向量知识库（品牌/SOP/QA） | RAG，影响所有生成的口吻 |

**RLS 已开启**：所有营销表都按 `shop_id + user_id` 过滤；同店铺内所有员工可见，跨店看不到。PC 端登录后即可读，不需要任何「白名单」。

**Realtime**：`marketing_assets`、`marketing_video_jobs`、`social_publish_jobs`、`social_publish_targets` 已加入 `supabase_realtime` 发布，PC 端可用 `supabase.channel(...).on('postgres_changes', ...)` 实时刷新。

---

## 三、Storage 存储桶

| Bucket | 公开 | 用途 |
|---|---|---|
| `product-images` | ✅ 公开 | 上传图片素材主要桶（marketing 也复用） |
| `marketing-videos` | ❌ 私有 | 视频渲染中间产物；下载需要走 `download-marketing-asset` 代理 |
| `avatars` | ✅ | 角色 / 用户头像 |
| `activity-posters` / `voucher-screenshots` | ❌ | 活动 & 优惠券，与营销关系小 |

视频最终 `output_url` 通常是火山 TOS 域（`*.tos-cn-*.volces.com`），有签名时效，PC 端直接拉可能 403——**统一用 `download-marketing-asset` 走后端代理**。

---

## 四、Edge Function 接口清单（按模块归类）

调用模板（任何语言通用）：

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
| `auto-tag-marketing-asset` | `{ asset_ids: string[] }` | `{ ok, updated }` | 上传后异步打标签 / 写 `tags` `category` `meta.description` |
| `analyze-marketing-assets` | `{ asset_ids }` | 同上，附带视觉描述 | 详细描述 + 适合场景 |
| `describe-marketing-images` | `{ image_urls: string[], shop_id? }` | `{ description, highlights }` | 单次看图描述（不入库） |
| `beautify-image` | `{ image_url, toggles, custom?, shop_id? }` | `{ asset_id, output_url }` | AI 修图美化 |
| `ai-image-chat` | `{ messages, image_urls, shop_id? }` | `{ reply, image_url? }` | 对话式 P 图 / 重绘 |
| `backfill-storyboard-assets` | `{}` | `{ migrated }` | 把历史分镜图回填入素材库（管理员用） |
| `download-marketing-asset` | GET `?asset_id=xxx&filename=xxx` 或 POST `{ asset_id, filename }` | 直接流式返回文件（含 `Content-Disposition: attachment`） | **PC 端下载视频/图片唯一可靠入口**，自动转发 Range，支持断点续传 |

### B. AI 文案

| 函数 | Body | 返回 |
|---|---|---|
| `generate-marketing-copy` | `{ image_urls[1-9], platform('xhs'/'wechat_video'/'douyin'/...), tone, style?('scream'/'heal'/'story'/'flex'), product_name?, price?, highlight?, shop_id? }` | `{ success, candidates:[{title, body, hashtags[], first_comment}], asset_id }` |
| `generate-share-copy` | `{ product_id }` | 单品种草文案 |

### C. AI 视频（核心）

| 函数 | Body | 用途 |
|---|---|---|
| `marketing-video-brief-chat` | `{ messages, shop_id }` | 引导式对话收集 brief，返回 chip 选项 |
| `generate-marketing-video-script` | `{ brief, shop_id, character_id?, asset_ids?[] }` | 生成脚本 + 分镜列表（`scenes[]`） |
| `generate-character-board` | `{ shop_id, prompt, ref_image_url? }` | 生成角色板（人物参考图） |
| `ensure-auto-anchor-character` | `{ shop_id }` | 没有角色时自动建一个 |
| `storyboard-marketing-video` | `{ job_id 或 script_id, shop_id }` | 用 Gemini 合成每个分镜的高清静帧；静帧自动入库 (`category=storyboard`) |
| `render-marketing-video` | `{ script, scenes[], character_id?, model_id('seedance-pro'/'fast'/'mini'), resolution('720p'/'1080p'/'4k'), shop_id, asset_id_hint? }` | 调 Seedance 2.0 渲染，落库 `marketing_video_jobs` |
| `poll-marketing-video` | `{ job_id }` | 轮询任务状态，4s 一次；返回 `{ status, progress, output_url?, error? }` |
| `surprise-marketing-video` | `{ shop_id }` | 「惊喜一下」一键全自动；返回 `{ job_id, script, scenes }`，前端轮询 |

**视频任务状态机**：`queued → running → rendering → done`，失败时 `status='failed' + error_message`。PC 端订阅 `marketing_video_jobs` 的 Realtime 即可，不用轮询。

### D. 内容分发（多平台发布）

| 函数 | Body | 返回 | 说明 |
|---|---|---|---|
| `dispatch-account-list` | `{ shop_id }` | `{ accounts: SocialAccount[] }` | 列已绑定账号（聚合 worker 在线状态） |
| `dispatch-account-login` | `{ shop_id, platform }` | **SSE 流**：`{step:'qr'\|'scanned'\|'confirmed'\|'success'\|'fail', qr?, account_id?, msg?}` | 扫码绑账号；二维码 base64 在 `qr` |
| `dispatch-account-revoke` | `{ account_id }` | `{ ok }` | 解绑 |
| `dispatch-job-create` | `{ shop_id, asset_id, kind('video'\|'image_text'), account_ids[], title, body, tags[], cover_url?, per_platform?, schedule_at?, images?[] }` | `{ job_id }` | 创建发布主任务 |
| `dispatch-job-status` | `{ job_id }` | `{ job, targets[] }` | 查任务状态 |
| `dispatch-job-cancel` | `{ job_id }` | `{ ok }` | 取消整任务 |
| `dispatch-job-retry` | `{ target_id }` 或 `{ job_id }` | `{ ok }` | 重试单子任务 / 整任务 |
| `dispatch-cron-tick` | 内部定时器，不用手动调 | — | 推进 scheduled / running |

**平台代号**（与 social_platform_specs.platform 对齐）：`xhs / wechat_video / douyin / kuaishou / bilibili / tiktok`。
**素材 → 平台能力判定**：PC 端发布工作台必须读 `social_platform_specs`，按 `supports_video` / `supports_image_text` 灰掉不支持的账号（H5 已经这么做）。

### E. 知识库 / RAG（影响文案与视频口吻）

| 函数 | Body | 返回 |
|---|---|---|
| `kb-search` | `{ query, scope('image'\|'copy'\|'video'\|'chat'), shop_id?, k? }` | `{ hits: [{title, content, similarity, source_type, ...}] }` |
| `kb-ingest` | `{ source_type, source_id }` | 后台向量入库（一般由触发器调） |
| `kb-accept` | 管理员审核 | — |
| `chat-knowledge` | `{ messages, shop_id, scope }` | RAG 对话回答 |
| `generate-shop-profile` | `{ shop_id, hints }` | 自动生成店铺画像 |
| `generate-shop-kb` | `{ shop_id }` | 拉门店 SOP / QA |

### F. 公共 / 辅助

| 函数 | 用途 |
|---|---|
| `test-ai-model` | 后台调试 AI 配置 |
| `compress-storage` | 旧素材压缩（cron） |
| `compute-importance` | 素材重要度评分（cron） |

---

## 五、PC 端典型调用流程示例

### 1. 列素材库（带分页 + 标签过滤）

```ts
const { data } = await supabase
  .from('marketing_assets')
  .select('id, kind, input_image_urls, output_url, output_text, tags, category, meta, created_at')
  .eq('shop_id', shopId)
  .in('kind', ['image', 'video'])
  .contains('tags', ['夏季'])          // 可选
  .order('created_at', { ascending: false })
  .range(0, 39);
```

### 2. 上传图片（直传 Storage + 写库 + 异步打标）

```ts
const path = `${shopId}/${crypto.randomUUID()}.webp`;
await supabase.storage.from('product-images').upload(path, blob, { contentType: 'image/webp' });
const url = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
const { data: row } = await supabase.from('marketing_assets')
  .insert({ shop_id, user_id, kind: 'image', input_image_urls: [url], sha256, category: '产品图' })
  .select().single();
supabase.functions.invoke('auto-tag-marketing-asset', { body: { asset_ids: [row.id] } });
```

### 3. 生成视频 + 实时进度

```ts
const { data } = await supabase.functions.invoke('render-marketing-video', {
  body: { script, scenes, character_id, model_id: 'seedance-pro', resolution: '1080p', shop_id },
});
supabase.channel(`job-${data.job_id}`)
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'marketing_video_jobs', filter: `id=eq.${data.job_id}` },
      payload => updateUI(payload.new))
  .subscribe();
```

### 4. 多平台发布

```ts
const { data } = await supabase.functions.invoke('dispatch-job-create', {
  body: { shop_id, asset_id, kind: 'video', account_ids, title, body, tags, cover_url },
});
// 订阅 social_publish_targets 看实时进度
```

### 5. 下载视频（绕过 TOS 403）

```ts
// 直接当 <a href> 用即可（带 token）
const url = `${SUPABASE_URL}/functions/v1/download-marketing-asset?asset_id=${assetId}&filename=demo.mp4`;
fetch(url, { headers: { Authorization: `Bearer ${token}`, apikey: ANON } });
```

---

## 六、需要 PC 端注意的几个坑

1. **登录态共享**：PC 端必须用同一个 Supabase 项目的 Auth；建议直接 `signInWithPassword` 或扫码登录，session 自动满足 RLS。
2. **`shop_id` 必填**：用户可能属于多个店铺，PC 端要做店铺切换器（参考 `useShops`），所有写入和查询都带 `shop_id`。
3. **视频任务的 model_id / resolution** 记忆放在前端 `videoModelPrefs.ts`，PC 端自己存 localStorage 即可。
4. **发布平台规则**用 `social_platform_specs` 表，**不要硬编码**，后端可能更新。
5. **错误信息中文化**：参考 `src/lib/invokeFn.ts`，所有 Edge Function 失败时 body 里都有人话化的 `error` 字段，PC 端可以照抄。
6. **Seedance 失败常见原因**：账号未开模型 / 内容审核 / 输入图含真人——`videoFailure.ts` 已有完整映射，建议复用。
7. **下载视频统一走 `download-marketing-asset`**，不要直接访问 TOS URL。

---

## 七、交付计划（如果你确认这份说明）

我会把这份内容沉淀成项目内的开发者文档：

1. 新增 `docs/marketing-center-api.md`，把以上接口表、参数、示例代码完整写入，方便 PC 端工程师直接对照实现。
2. 在文档里附一份 TypeScript 类型清单（直接从 `src/integrations/supabase/types.ts` 摘录对应表的 Row 类型）。
3. 如需要，再补一个最小可运行的 PC 端 demo（Node + supabase-js）调用「列素材 / 生成视频 / 轮询 / 下载」全流程。

请告诉我：

- ✅ 直接落到 `docs/marketing-center-api.md` 就行，还是要顺带做一个 PC 端 demo 仓库脚手架？
- ✅ PC 端是否会复用 Supabase Auth 同账号体系？（如果不行，需要我加一个 service-token 类的对外网关）
