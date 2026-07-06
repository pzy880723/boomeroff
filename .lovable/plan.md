## 根本原因

之前给素材库做加载优化时，为了减少数据量，`MarketingLibrary.tsx` 里定义了 `ASSET_COLS` 只拉取了轻量字段：

```
id, kind, output_url, input_image_urls, tags, category, shop_id, user_id, created_at, meta
```

**漏掉了 `output_text` 这一列**。而所有"文案"素材（`kind='copy'`）的正文都存在 `output_text`：

- 列表里的两行预览用 `copyPreview(it)` 读 `it.output_text` → 拿不到 → 显示"（无内容）"
- 点开详情用 `JSON.parse(asset.output_text || '[]')` → 解析出空数组 → 显示"没有可读的文案内容"

数据库里文案本身完全没问题（已核对：JSON 结构完整、正文 800~1200 字）。视频文案（存在 `meta.video_copy` 里）不受影响，所以只有独立的"文案"卡片失效。

## 修复方案

`src/pages/marketing/MarketingLibrary.tsx` 第 67 行，把 `output_text` 加进 `ASSET_COLS`：

```ts
const ASSET_COLS = 'id, kind, output_url, output_text, input_image_urls, tags, category, shop_id, user_id, created_at, meta';
```

影响：每条素材多传几百字节，图片/视频卡片本来 `output_text` 就是空，只在文案卡片上有真实开销，不会明显拖慢加载。

## 顺带清理（可选，需你确认）

前面被我删掉的 12 条失效视频，还留着 8 条 `from_video_id` 指向已删除视频的旧文案（`meta.from_video_id` 里能看到）。文案本身可用，只是"来源视频"已经不存在了。要不要一并删掉？还是保留文案（它们独立可用）？