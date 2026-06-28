
# 素材库重整方案

针对四个核心痛点：来源混乱、全量不全、加载慢、标签噪声。

## 1. 新增「基础素材图」一级来源（最重要）

把"我上传的"再细分一层，并把它升级成与 AI 生成并列的硬区分。

- 数据层（无需迁移）：在 `marketing_assets.meta` 里加 `asset_class` 字段：
  - `base` = 基础素材图（门店实拍、商品原图等，长期反复使用）
  - `upload` = 普通上传（一次性参考）
  - `generated` = AI 生成（分镜头、智能广告图）
- 写入路径：
  - `UploadAssetDialog`：图片 Tab 顶部加一个开关「📌 作为基础素材图入库」，默认开（解决用户痛点：之前混在一起找不到了）。命中后写 `meta.asset_class='base'`。
  - 所有 storyboard / ai-smart-ad 路径写 `asset_class='generated'`。
- 读取层（`src/lib/assetSource.ts`）：把判定收敛到 `meta.asset_class` 为准，旧数据按现有 `meta.source` 兼容回退。
- UI：素材库顶部来源切换从 3 段改为 4 段：「📌 基础素材」「📷 我上传的」「✨ AI 生成」「全部」，并把默认停留位改为「基础素材」。基础素材独立排在最前，门店实拍一眼可见。
- 一次性回填脚本（`backfill-asset-class` edge function，admin 一键）：
  - `meta.source in ('storyboard','ai-smart-ad')` → `generated`
  - `category in ('店铺','门店','场景图')` 或 tags 含「门头/店招/店内/橱窗/货架」 → `base`
  - 其余 `manual_upload / library_picker_upload` → `upload`

## 2. 标签全面清理 + 收敛

当前 100+ 个杂乱标签（`场景1`…`场景11`、`elegant/energetic/lively/playful/steady`、`AI智能广告`、`图一/图二`等英文 + 编号噪声）。

- 新建 `supabase/functions/cleanup-marketing-tags`（admin 一键执行）：
  - 删除噪声标签集合：`/^场景\d+$/`、`/^图[一二三四五六七八九十\d]+$/`、`/^分镜头[\d一二三]+$/`、英文情绪词 `elegant|energetic|lively|playful|steady`、生成痕迹 `AI智能广告|AI生成`。
  - 标签词典统一映射：把同义近义聚到 `AssetTagDialog` 已有的 `TAG_GROUPS`（场景位置 / 商品 / 人物 / 分镜头 / 风格氛围）里，超出词典的自定义标签保留但不进入"热门"。
  - 输出：`{ removed, merged, kept }` 报告。
- 前端 `MarketingLibrary` 标签筛选条：默认只展示**白名单 + 当前店铺出现 ≥2 次**的标签，避免长尾刷屏；底部一个「更多标签」展开剩余。
- `AssetTagDialog` 已有分组结构保留，但移除上面被清掉的噪声词。

## 3. "全部"真正全量加载

当前 `PAGE_SIZE=60` + 必须手动触发 `loadMore`，但页面上并没有"加载更多"按钮，所以用户感知就是"全部只有 60 张"。

- 在素材列表底部加 IntersectionObserver 触发的自动 `loadMore`，并显示「加载中… / 已全部加载完毕（共 N 张）」。
- 顶部"共 N 条"改成「当前 X / 总 Y 条」，Y 用 `count: 'exact', head: true` 单独查一次（按当前 tab + 来源筛选）。
- 选择"全部"来源时去掉 `imgSource` 过滤，确保不再二次裁切。

## 4. 加载提速（图片压缩 + 缩略）

- `MarketingLibrary` 网格已用 `thumbUrl(rawThumb,240)`，但 storyboard 写库时存的是原图 URL。新增 edge function `compress-marketing-storyboards`（一次性，复用 `compress-storage` 的转换逻辑），把 `output_url` 大于 200KB 的 generated 图就地转 WebP 1080px Q78。
- 写入路径补：`storyboard-marketing-video` / `ai-smart-ad-images` 落库前调用 Supabase render 端点拿到压缩 WebP 再存。
- 网格 `<img>` 增加 `loading="lazy" decoding="async"`（确认现状若已有则保留），`<img>` 加固定 `aspect-square` 容器避免回流。

## 技术细节

| 改动 | 文件 |
|---|---|
| 来源判定增加 `asset_class` | `src/lib/assetSource.ts` |
| 4 段来源切换 + 自动加载更多 + 总数 | `src/pages/marketing/MarketingLibrary.tsx` |
| 「基础素材图」开关 + 写入 `asset_class` | `src/components/marketing/UploadAssetDialog.tsx` |
| 标签字典移除噪声 | `src/components/marketing/AssetTagDialog.tsx` |
| 一次性回填 `asset_class` | `supabase/functions/backfill-asset-class/index.ts` (新) |
| 一次性清理标签 | `supabase/functions/cleanup-marketing-tags/index.ts` (新) |
| 一次性压缩历史分镜图 | `supabase/functions/compress-marketing-storyboards/index.ts` (新) |
| storyboard 落库前压缩 | `supabase/functions/storyboard-marketing-video/index.ts`、`ai-smart-ad-images/index.ts` |

Admin 在素材库右上角看到三个一次性按钮：「重整来源」「清理标签」「压缩历史图」，跑完后这些按钮可以删除。

## 不会改的

- 不动数据库 schema（全部走 `meta` JSON），降低风险。
- 不动角色库、视频拼接逻辑、店铺切换。
- 不动现有店员只读权限。
