## 一、分镜预览（SurpriseVideoDialog）UI 精修

在分镜静帧横滑条 + 每条分镜行的缩略图按钮上：
- 增加 `rounded-xl` 圆角矩形（已有圆角，加重一档），加 `ring-1 ring-border` + `shadow-lg shadow-black/15`，让图凸显出来。
- 容器加微微的内边距和 `bg-card`，与背景分离。

`ImageLightbox.tsx`（毛玻璃左右按钮也归这里管）：
- 左右两个 `ChevronLeft/Right` 按钮，把 `bg-white/15` 改为 `bg-white/25`，再加 `shadow-lg shadow-black/40 ring-1 ring-white/30`，让毛玻璃按钮从黑底中明显跳出来。
- 右上的关闭按钮保留现状（已有 shadow-xl）。

## 二、Lightbox 不再叠两层

`AssetDetailDialog.tsx`：移除内置的 `<ImageLightbox>` 以及触发它的图片点击（line 608-614 + 相关 `setLbOpen` state 和图片 onClick）。  
素材库点缩略图 → 只弹 `AssetDetailDialog` 一层，恢复"原来那样"。

## 三、`+2` 标签溢出徽章改写

`MarketingLibrary.tsx` line 690-692 当前展示 `第一个标签 +2`，用户看不懂。改为：
- 只有 1 个标签时：显示该标签。
- 多个时：显示 `共 N 个标签` 或直接展示前两个 `tagA · tagB`（不带 `+N`）。

## 四、上传后自动打标签（补齐所有入口）

目前只有 `UploadAssetDialog` 在上传后调用 `auto-tag-marketing-asset`；`UploadGrid.tsx` 的快速批量上传路径（`processOne` line 79-92）没调用。  
在 `UploadGrid` 的批量上传完成后，按 batch（例如每 8 个 asset_id 一组）异步 fire-and-forget 调用 `auto-tag-marketing-asset`，不阻塞 UI。

## 五、一次性回填历史无标签素材

新建 edge function `backfill-marketing-asset-tags`：
- service-role 客户端查 `marketing_assets` 中 `tags is null or tags = '{}'` 且 `kind='photo'` 且 `output_url not null`，按 shop 分批（每批 10 个 id）循环调用现有 `auto-tag-marketing-asset` 逻辑。
- 限速：每批之间 sleep 800ms，避免 LLM 限流；总数上限例如 500 条/次，返回 `processed / remaining`，前端可多次触发。
- 在 `MarketingLibrary.tsx` 顶部"管理模式"区，仿照"回填分镜"按钮，新增"一键补标签"按钮（仅 admin 可见），点击调用此函数，Toast 显示已处理张数和剩余张数。

## 六、自动生成视频与标签关联

`surprise-marketing-video` 当前在素材池里按"时间新→旧"加权随机挑 3-5 张，互相之间没有主题一致性。改造为"先选主题 tag，再围绕该 tag 挑素材"：

1. 拉素材时同时收集 `tags`、`category` 频次，得到该店最近 90 天的 Top tag 列表（出现 ≥2 次的）。
2. 加权随机选 1 个"主题 tag/category"（频次越高权重越高）。
3. 池内素材按"是否包含该 tag/category" 拆为命中组和未命中组：
   - 命中 ≥3 张：从命中组里挑 3-5 张；
   - 命中 1-2 张：命中全选 + 从池里补足到 3-5 张；
   - 命中 0：保持当前随机逻辑兜底。
4. 把选中的 `theme_tag` 写进返回的 `picked` 里（前端可在分镜预览顶部显示 `主题 · xxx` Chip，让用户知道这一组是围绕哪个标签拍的）。
5. `pickVtypeByAssets` 继续基于这批素材的 tags 决定视频类型，逻辑天然受益于本次主题聚拢。

> 不再为每张图额外生成参考词，仅复用既有 tags / category，无额外 token 消耗。

## 技术备注

- 文件：`SurpriseVideoDialog.tsx`、`ImageLightbox.tsx`、`AssetDetailDialog.tsx`、`MarketingLibrary.tsx`、`UploadGrid.tsx`、新建 `supabase/functions/backfill-marketing-asset-tags/index.ts`、`supabase/functions/surprise-marketing-video/index.ts`。
- 不涉及数据库 schema 改动。
- 回填函数 verify_jwt = true（前端用户 token 调用，函数内部 admin client 操作），仅 admin 可触发（在 SQL 之前先校验 `has_role(uid, 'admin')`）。
