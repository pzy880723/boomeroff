# 方案:素材库按店铺维度组织 + 视频生成接入店铺与素材库

## 一、数据层

### 1. 给 `marketing_assets` 加店铺归属
- 新增列 `shop_id uuid REFERENCES public.shops(id) ON DELETE SET NULL`(可空,兼容历史数据)
- 索引 `(shop_id, kind, created_at DESC)`,方便按店铺分组列表
- RLS 不变(仍按 `auth.uid()` 私有);策略不需要改

### 2. 给 `marketing_video_jobs` 加 `shop_id`
- 同上,可空,索引 `(shop_id, created_at DESC)`
- 用于"按店铺看渲染历史"

### 3. 新增「店铺描述」表 `shop_marketing_profiles`
专门承载营销视角的店铺画像(和现有 `shops` 基础信息、`shop_kb_entries` SOP 区分开)。

字段:
- `shop_id uuid PK REFERENCES shops(id) ON DELETE CASCADE`
- `tagline text` — 一句话定位
- `description text` — 店铺详细介绍(选品风格、客群、地段氛围)
- `selling_points jsonb` — 卖点数组
- `tone text` — 偏好口吻(治愈/活泼/稳重…)
- `target_audience text` — 目标人群
- `brand_keywords text[]` — 品牌关键词
- `cover_image_url text` — 店铺封面图
- `default_hashtags text[]` — 默认话题标签
- `updated_by uuid`, `created_at`, `updated_at`

授权:
- 读:所有 authenticated(店员要选店时能看)
- 写/删:有 `shop.write` 权限的人(沿用现有权限体系)
- 必带 GRANT + RLS + 触发器 `updated_at`

## 二、素材库 UI(`MarketingLibrary.tsx`)

### 1. 顶部加「店铺切换器」
- 横向 Chips:全部 / 各店铺(从 `shops` 拉取 active)
- 选中后所有列表(图片/文案/视频)按 `shop_id` 过滤
- 记住上次选择(localStorage `marketing_last_shop`),后续新建素材默认带上

### 2. 新增 Tab「店铺描述」
当选定具体某一店铺时显示,展示并允许编辑该店的 `shop_marketing_profiles`:
- 封面图 + 一句话定位
- 店铺详细介绍、卖点、口吻、目标人群、关键词、默认话题
- 「保存」按钮(权限校验)
- 没有 profile 的店铺显示「去完善店铺描述」空态

### 3. 列表卡片改造:左缩略图布局
现在是网格式,改成左缩略图 + 右文字的横向列表:

```text
┌──────┬─────────────────────────────────────┐
│      │ 标题(name / 文案首句 / 视频脚本主题)│
│ 80×80│ 平台徽章 / 视频状态 / kind 标签     │
│ 缩略 │ 店铺名 · 时间                       │
└──────┴─────────────────────────────────────┘
```

缩略图取值:
- `kind='photo'`:`output_url`
- `kind='video'`:`meta.cover_url` → 取不到则 `<video preload="metadata" #t=0.5>` 自动截首帧
- `kind='copy'`:平台彩色图标方块(小红书/抖音/视频号/朋友圈)+ 取首张 `input_image_urls[0]` 当背景(若有)

点击仍打开 `AssetDetailDialog`。

## 三、新建素材必须先选店铺

### 1. `MarketingPhoto.tsx` / `MarketingCopy.tsx` / `MarketingVideo.tsx`
顶部加一行强制「店铺选择器」(Select):
- 默认值 = 上次选择 / URL `?shop=xxx` / 当前用户 `staff_profiles.shop_id`
- 未选店铺时,后续步骤(拍图/写文案/生成视频)按钮禁用 + 提示「请先选择店铺」
- 入库时把 `shop_id` 一并写入 `marketing_assets` / `marketing_video_jobs`

### 2. 边缘函数
- `generate-marketing-copy`、`render-marketing-video`、`generate-marketing-video-script`、`marketing-video-brief-chat` 接收新参数 `shop_id`
- 在生成前 server 端拉 `shop_marketing_profiles` + `shops.name/address`,拼到 system prompt:

  ```
  店铺信息:{name} · {address}
  定位:{tagline}
  介绍:{description}
  卖点:{selling_points}
  目标人群:{target_audience}
  口吻:{tone}
  关键词:{brand_keywords}
  ```
- 没有 profile 时退化为只用店铺名/地址

## 四、视频生成「导入素材库」

`MarketingVideo.tsx` 的参考图步骤新增按钮「从素材库导入」:
- 打开 `LibraryImagePickerDialog`(新组件),查询当前 `shop_id` 下 `kind='photo'` 的素材
- 支持多选(尊重当前画幅上限),点击「导入」后把 `output_url` 追加到 `imageUrls` 数组
- 已有「直接上传」流程保留

## 五、技术细节(给开发看)

- 类型:迁移完成后 `src/integrations/supabase/types.ts` 自动重建,前端用新字段
- 历史数据:`shop_id` 留空 = "未分类",素材库给一个独立 chip「未分类」
- 不动业务逻辑:RLS/权限/AI 编排/渲染轮询保持现状,仅增量加 `shop_id`
- 不做:跨用户共享素材(仍是私有,按用户隔离),也不做店铺级别共享池

## 六、不做(明确划界)

- 不引入新画幅/新模型/新平台
- 不改 BOOMER 聊天、识别相关流程
- 不做店铺间素材迁移/批量改归属(后续可加)

完成后可在素材库按店铺浏览全部图/文/视频,每条素材左侧带缩略图;生成视频前必须先选店,AI 会基于该店描述与已有素材生成更贴合的脚本与画面。