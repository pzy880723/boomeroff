# 素材库:上传素材 vs AI 分镜 分流

## 问题

目前 `marketing_assets` 把两类图混在一起,选自定义视频参考图时很难挑:
- **我上传的素材** —— 真实门店/商品照片(`UploadAssetDialog` 写入,无 `meta.source` 或为 `upload`)
- **AI 生成分镜** —— 分镜静帧、智能广告图(`category='分镜头'` 或 `meta.source in ['storyboard','ai_smart_ad','ai_image']`)

## 判定规则(统一一个 helper)

新建 `src/lib/assetSource.ts`:

```ts
export type AssetSource = 'upload' | 'generated';
export function assetSource(a: { category?: string|null; meta?: any }): AssetSource {
  const src = a?.meta?.source;
  if (src && ['storyboard','ai_smart_ad','ai_image','smart_ad','generated'].includes(src)) return 'generated';
  if (a?.category === '分镜头' || a?.category === 'AI生成') return 'generated';
  return 'upload';
}
```

(纯前端判定,不动数据库,不动 backfill 函数。)

## 改动点

### 1) `src/pages/marketing/MarketingLibrary.tsx`
- 「图片」Tab 下增加一行 **二级分段控件**:`全部 / 我上传的 / AI 生成`,默认「我上传的」。
- 状态 `imgSource: 'all'|'upload'|'generated'`,持久化到 `localStorage('lib.imgSource')`。
- 现有的标签过滤(`activeTag`)在该子集内继续生效。
- 列表项左上角加一个极小角标:上传=📷、AI=✨(纯 lucide 图标,12px),让混排时也能一眼分辨。

### 2) `src/pages/marketing/dispatch/LibraryAssetPickerDialog.tsx`(发布工作台拾取器)
- 图文 Tab 顶部加同款分段控件,默认「我上传的」。
- 视频 Tab 不受影响。

### 3) 自定义视频选素材的拾取器
查 `MarketingVideo` / `CharacterPicker` 用到的素材选择弹窗,在那里同样加分段控件,**默认且仅显示「我上传的」**(用户原话:自定义视频选素材就是用我上传的)。
保留一个「显示 AI 生成」开关,避免完全藏死。

### 4) `AssetTagDialog` 不变
分类字段保留(管理员能改),但前端展示以 `assetSource()` helper 为准,不依赖人工分类。

## 不动的部分
- 数据库 schema / RLS / 任何 edge function
- 上传流程、去重、打标、分镜生成逻辑
- `marketing_assets` 历史数据(已有 backfill 写入的 `meta.source='storyboard'` 直接命中规则)

## 验证
1. 素材库默认看到「我上传的」,看不到分镜图。
2. 切到「AI 生成」能看到分镜与智能广告图。
3. 自定义视频选参考图弹窗默认只列上传素材。
4. 历史标签筛选(如「门头」)在子集内仍然工作。
