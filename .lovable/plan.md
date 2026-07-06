## 目标

1. 「帮我拍一条」只从"用户上传"图片里挑,不再挑 AI 生成图
2. 素材库合并/精简顶部工具栏
3. 精简标签体系 + 增加"标签管理"入口

---

## 1. 惊喜视频只挑用户上传的实景图

**文件:** `supabase/functions/surprise-marketing-video/index.ts` (~L161)

拉素材池时,除了现有"剔除分镜头"过滤,再排除所有 AI 生成来源:

```
.not("meta->>asset_class", "eq", "generated")
.not("meta->>source", "in", "(storyboard,ai_smart_ad,ai-smart-ad,ai_image,smart_ad,generated,ai_generated)")
```

拉回后再用与前端 `assetSource()` 完全一致的规则在内存里二次过滤(旧数据没 `asset_class` 但可能是 AI 生成的,靠 source/category 兜底),只保留 `base` 与 `upload` 两类。这样"基础素材 + 我上传的"合并成一个"用户上传"概念,与用户理解一致。

若过滤后池子为空 → 返回中文提示 `"素材库还没有你上传的实景图,先去『素材库 › 图片』上传几张"`。

## 2. 素材库工具栏精简

**文件:** `src/pages/marketing/MarketingLibrary.tsx`

**A. 三个上传按钮合并为一个** (L631-648)

用一个 `+ 新增素材` 主按钮,点击弹出小菜单 (DropdownMenu 或 Popover) 让用户选「图片 / 文案 / 视频」,再打开原有的 `UploadAssetDialog`。

**B. 移除管理员一次性按钮**

删掉这些按钮及其对应的 handler / state:
- 回填分镜头 (`runBackfillStoryboards`, `backfilling`)
- 补标签 (`runBackfillTags`, `backfillingTags`)  
- 重整来源 (`runReclassify`, `reclassing`)
- 清理标签 (`runCleanTags`, `cleaningTags`)

edge functions (`backfill-*`, `cleanup-marketing-tags`) 本身保留,只是不再从 UI 触发。

**C. 保留:** `管理` (进入多选删除)、`清理失败视频`、以及即将新加的 `标签管理` 按钮。

## 3. 精简 + 新增标签管理

**文件:** `src/components/marketing/AssetTagDialog.tsx`

缩减 `TAG_GROUPS` 到 3 组、约 18 个核心标签:

```
📍 场景  : 门头、店内、橱窗、货架、收银台、门口
🛍 商品  : 商品、细节、特写、套装、配饰
👤 人物  : 人物、顾客、店员、合影
🎨 氛围  : 白天、夜景、复古、高级感
```

去掉「场景位置 / 分镜头 / 风格氛围」里的冷门词(店招、试穿区、街拍、材质、摆件、博主、主角、开场/过渡/结尾/空镜/特效、文艺、潮流、温馨、场景)。用户仍可通过搜索框自建自定义标签。

**新文件:** `src/components/marketing/TagManagerDialog.tsx`

范围:当前店铺内所有素材的标签(从已加载的 `items` 聚合;跨分页可先用当前列表,够 MVP)。

功能:
- 列出所有不同标签 + 使用次数,按频次排序
- 每行三个动作:**重命名**(输入框,批量 update 所有含该标签的素材)、**合并到**(选另一个已有标签,把 A 全部改成 B)、**删除**(从所有素材里移除该标签,不删素材本身)
- 全部操作走 supabase `update marketing_assets set tags = ... where id in (...)`,操作前 `confirm`,完成后本地 `setItems` 同步

**入口按钮:** 在 MarketingLibrary 工具栏 `管理` 旁加一个 `🏷 标签管理` (ghost 按钮),打开该 Dialog。

## 技术细节

- `UploadAssetDialog` API 不变,只是入口变成"先选类型再打开"
- `AssetDetailDialog` 现有的"编辑标签"入口保留不动(单张编辑仍走 `AssetTagDialog`)
- 无 DB 变更、无 edge function 新增
- 惊喜视频那次已经生成失败/跑掉的任务不做迁移
