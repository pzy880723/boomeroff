## 目标

在「文案/视频」页用 `UploadGrid` 上传**参考图**时，每张图自动落进**素材库**（`marketing_assets`），同时按图片内容去重——已经在我自己素材库里的同一张照片不会重复入库，也不会重新上传一份到存储。

## 行为定义

- 触发位置：仅 `src/pages/marketing/UploadGrid.tsx`（被参考图区域使用：MarketingVideo / MarketingCopy）。`UploadAssetDialog`（用户主动"上传到素材库"）和 `MarketingPhoto` 的主图上传不在本次范围内。
- 去重维度：**当前用户自己** 的 `marketing_assets`，按图片字节的 SHA-256（即"完全相同的文件"算重复）。同物不同角度不去重。
- 去重时机：
  1. 选完文件后，先在前端算每张图的 sha256。
  2. 查 `marketing_assets` 里 `created_by = me AND meta->>'sha256' = hash` 是否已存在。
  3. **已存在** → 跳过压缩+上传，直接把已存在的 `output_url` 当作"上传成功"回灌给参考图列表，不再 insert 一条新素材。
  4. **不存在** → 走原有 `uploadMarketingImages` 流程，成功后 insert 一条 `marketing_assets`（`kind='photo'`、`output_url=url`、`input_image_urls=[url]`、`meta={ source: 'reference_upload', sha256, filename }`）。
- 同一次选择内的重复（用户一次选了两张完全相同的图）也按 sha256 合并，只保留一份。
- 失败重试（`retryOne`）走同样的去重路径。
- 完成后用 toast 简短反馈：`已加入素材库 X 张 · 去重 Y 张`（Y=0 时不显示后半段；全 0 时不弹）。UI 形态、缩略图、删除按钮都不变。

## 技术细节

- 新增 `src/lib/fileSha256.ts`：用 `crypto.subtle.digest('SHA-256', await file.arrayBuffer())`，返回 64 位 hex。预览环境是 HTTPS，SubtleCrypto 可用；不可用时降级为 `${file.size}-${file.lastModified}-${file.name}`，仍能拦住"同一文件二次选择"。
- 改 `src/pages/marketing/UploadGrid.tsx`：
  - `onPick` 里先 `Promise.all` 算所有 hash，按 hash 在 `items` 内部排重；
  - 用一次 `supabase.from('marketing_assets').select('id, output_url, meta').eq('created_by', user.id).in('meta->>sha256', hashes)` 拿到已存在的映射（PostgREST 写法用 `.filter('meta->>sha256','in',\`(\${...})\`)`）；
  - 对命中已存在的：直接 `onProgress({stage:'done', url: existingUrl})`，不走 `uploadMarketingImages`，也不再 insert；
  - 对未命中的：原流程走完拿到 `url` 后，`insert` 一条 marketing_assets（带 sha256/filename/source）；插入失败不阻塞，参考图列表仍然能用。
- `retryOne` 复用同一份"算 hash → 查重 → 上传或复用"逻辑，抽到本文件内的小函数 `processOne(file)`。
- 不动数据库结构（meta 是 jsonb，足够放 sha256）。不动 RLS。不动 `UploadAssetDialog` / `MarketingPhoto`。

## 影响文件

- 新建：`src/lib/fileSha256.ts`
- 修改：`src/pages/marketing/UploadGrid.tsx`
