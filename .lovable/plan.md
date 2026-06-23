
## 为什么慢 — 排查结论

读了 `UploadGrid.tsx` / `LibraryImagePickerDialog.tsx` / `uploadMarketingImages.ts` / `uploadImage.ts` / `fileSha256.ts` 后，定位到 5 个真实瓶颈，按影响排序：

1. **SHA-256 算了两遍**  
   `UploadGrid.onPick` 已经为每张图算了一次 `fileSha256`（用于本地去重），但 `processOne` 又调一次。一张 5MB 手机原图算一次哈希要读完整个 ArrayBuffer，10 张图就是 100MB 的重复 I/O。

2. **去重查询是 N 次串行 DB 往返**  
   每张图先 `select ... eq('sha256', hash).maybeSingle()` 才决定要不要上传。10 张图就 10 次往返；移动 4G 上每次 200~400ms。可以一次 `.in('sha256', [...])` 拿完。

3. **`LibraryImagePickerDialog` 完全串行**  
   `for (const it of newItems) await runOne(it.id, it.file)` — 无并发。`UploadGrid` 是 3 并发，dialog 是 1 并发，明显被卡。

4. **入库 insert 阻塞下一张**  
   每张上传完后 `await supabase.from('marketing_assets').insert(...)` 再算"成功"，再让 worker 取下一张。insert 与下一张的"压缩+上传"完全可以并行 — 改成 fire-and-forget（失败 toast 即可）就能省掉一次往返的等待。

5. **压缩 + 哈希在主线程，串行做**  
   `compressForUpload` 用 `<img>` 解码 + `canvas.toBlob`，全部在主线程。一张图压缩 200~500ms，期间 UI 卡顿；并发 3 时三张图争抢同一个主线程更慢。哈希也一样占主线程。可用 `createImageBitmap`（浏览器后台线程解码，明显更快）替换 `new Image()`。

辅助观察：`product-images` bucket 是 public，`getPublicUrl` 是同步的，没有额外签名往返 — 这部分没问题。

---

## 优化方案（只动 4 个前端文件，不改 DB / edge function）

### A. 哈希只算一次，并把结果透传
- `src/pages/marketing/UploadGrid.tsx`：`onPick` 算完的 `hashes[i]` 直接随 `newItems` 一起带下去，`processOne(file, hash, ...)` 接收预计算的 hash，不再重算。
- `LibraryImagePickerDialog.tsx`：在 `onUpload` 同样先并行 `Promise.all(files.map(fileSha256))`，再带入 `runOne`。

### B. 去重查询批量化
- 上传前一次 `select output_url, sha256 from marketing_assets where sha256 in (...) and (shop_id=... or user_id=...)`，本地建 `Map<sha256, url>`。命中的图直接走"复用"分支；未命中的进上传队列。把 N 次 RTT 降为 1 次。

### C. Dialog 也开并发
- `LibraryImagePickerDialog` 用与 `UploadGrid` 同款 worker pool（默认并发 4）。

### D. insert 不阻塞下一张
- `processOne` 拿到 `finalUrl` 后立刻 `return`，把 `supabase.from('marketing_assets').insert(...)` 改成 `void insert().then(...).catch(toast)`，让 worker 立刻去拿下一张。

### E. 压缩用 `createImageBitmap`（更快、不卡 UI）
- `src/lib/uploadImage.ts`：在支持的浏览器走 `createImageBitmap(file, { resizeWidth, resizeQuality: 'high' })` + `OffscreenCanvas`，回退路径保留现在的 `<img>`+`canvas`。
- 同时把 `UploadGrid` / `LibraryImagePickerDialog` 的并发从 3 / 1 提到 4，配合后台解码不会让主线程更糟。

### F. 顺手：跳过明显已经够小的图
- `compressForUpload` 已经有 `minSize` 阈值（thumb 120KB），保留；但在 `'thumb'` 路径下，如果原图就是 jpeg 且 < 200KB，直接 `return file`，不再 decode/encode。

---

## 预期效果

以"10 张 3MB 手机原图、4G 网络"为基准粗算：

| 项                          | 现在        | 优化后    |
| --------------------------- | ----------- | --------- |
| SHA-256 计算                | 20 次       | 10 次     |
| 去重查询 RTT                | 10 × ~300ms | 1 × 300ms |
| 入库 insert 串在关键路径    | 是          | 否        |
| 实际上传并发                | UploadGrid 3 / Dialog 1 | 4 / 4 |
| 压缩主线程占用              | 100%        | ~30%（bitmap 后台线程） |

整体场景一次上传 10 张图的端到端时间，预计从 **20~30s → 6~10s**，并且 UI 不再卡顿。

---

## 涉及文件

- `src/pages/marketing/UploadGrid.tsx`（传 hash + insert 异步 + 并发↑）
- `src/components/marketing/LibraryImagePickerDialog.tsx`（并发 worker + 批量去重 + insert 异步）
- `src/pages/marketing/uploadMarketingImages.ts`（接受外部传入 hash 占位，无强改动）
- `src/lib/uploadImage.ts`（`createImageBitmap` + 小图直通）

不动：edge function、数据库 schema、RLS、storage bucket。
