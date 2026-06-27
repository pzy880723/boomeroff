## 现象
「BOOMER 帮我拍 / 惊喜一下」生成的视频，在素材库的卡片封面是插画风。

## 根因
`surprise-marketing-video` 从 `marketing_assets` 里抽 `kind='photo'` 当原始素材时，**没有排除** `category='分镜头'`。

```text
marketing_assets (photo)
├── 用户拍的真实店内照 ✅ 应该入池
└── 过往生成的分镜静帧（kind=photo, category=分镜头）❌ 不应该入池
    ├── 早期 stylized 模式合成的插画风静帧
    └── 即便是 photoreal 静帧，也是 AI 合成的"二手"素材
```

被选中后：
1. `pickedAssets[0].output_url` 写进新视频 asset 的 `input_image_urls`
2. 素材库卡片缩略图 fallback 到 `input_image_urls[0]`
3. 你就看到一张插画风封面

雪上加霜：分镜静帧自己也会出现在素材库里作为单独的图片卡，强化「插画到处都是」的错觉。

## 修复

### 1. `supabase/functions/surprise-marketing-video/index.ts`
两次 `marketing_assets` 查询都加：
```ts
.neq("category", "分镜头")
.not("meta->>source", "eq", "storyboard")
```
（双保险：旧记录可能没分类只有 meta.source。）

### 2. 给"渲染中的视频卡"一个稳的封面
在 `render-marketing-video` 落 `marketing_assets` 占位行的两处（单段 387、多段 515 附近），把 meta 里加一条：
```ts
cover_url: imageUrls[0] || character?.cover_url || null,
```
这样 `MarketingLibrary` 的 thumbnail 直接走 `meta.cover_url`，不再回退到分镜静帧或空白。

### 3. 数据清理（不动表结构，只补丁）
后端无须迁移；前端 `MarketingLibrary` 已有「分镜头」筛选 chip。无需额外动作，老数据不会再被 surprise 误抽。

## 不动
- 不改 storyboard prompt（photoreal 分支已正确）
- 不改 render 路径、character、realism 传参
- 不改素材库 UI 渲染逻辑
- 不删历史分镜静帧（用户可能想留作素材）

## 验证
1. 跑一次「惊喜一下」→ 新视频卡片封面是真实店内照（来自 `meta.cover_url`），不是插画。
2. 查 `marketing_assets` 最新 video 行，`meta.cover_url` 非空且指向用户原图。
3. 老数据：之前那条已经在跑的视频卡片，封面仍可能是插画（因为 `input_image_urls` 已经写死），但**新生成**的不会再出现。
