## 目标
让「中古圈」详情卡的内容像 `/u/result` 的 GuestProductCard 一样丰富（故事 / 欣赏 / 完整介绍 / 材质工艺尺寸品相 / 保养），目前只保存了 name/era/origin/sellingPoints/tips，所以详情看着很单薄。

## 改动范围

### 1. 扩展 `community_posts` 表（迁移）
新增字段（全部可空，向后兼容）：
- `story` text — 它的故事
- `appreciation` text — 怎么欣赏
- `description` text — 完整介绍
- `care_tips` text — 保养与使用（独立于 `tips`，专门给丰富版用）
- `material` text — 材质
- `craft` text — 工艺
- `dimensions` text — 尺寸
- `condition` text — 品相
- `confidence` numeric — AI 置信度，用于显示「AI 不太确定」标

### 2. `submit-public-post` 边缘函数
接受并清洗（限长）以上新字段后写入 `community_posts`，不影响现有字段。

### 3. `PublicResult.tsx` 分享请求体
把 `result.story / appreciation / description / careTips / material / craft / dimensions / condition / confidence` 一并发送给 `submit-public-post`。

### 4. `PublicCommunity.tsx` 详情 Sheet
- `Post` 接口与 SELECT 列加上新字段。
- 把当前的 `PostDetailSheet` 改造为复用 `GuestProductCard` 的「编辑式杂志」版式：
  - Hero 大图 + 分类 / Era 浮层 + 低置信度标
  - Discovery + 大标题 + 元信息行（来源、时间、点赞、评论）
  - 编辑式 Meta 表格（材质 / 工艺 / 尺寸 / 品相）
  - The Story（首字下沉）
  - Highlights 编号看点列表（带 tag 色点）
  - Appreciation
  - Full Notes（description）
  - Care Tips 高亮卡
  - 保留底部「长按二维码加店铺微信」分享卡和返回 / 拍一张行动按钮
- 老的 post 没有这些字段时自动隐藏对应 block，不会出错。

## 执行顺序
1. 迁移：`ALTER TABLE community_posts ADD COLUMN ...`
2. 改 `submit-public-post`（自动部署）
3. 改 `PublicResult.tsx` 分享 body
4. 改 `PublicCommunity.tsx` 详情卡（提取一个共用渲染组件，与 `GuestProductCard` 共享 Block / SectionLabel 模式，避免重复）

## 不在范围
- 不动识别管线、不改 `useGuestRecognition`，已有字段直接复用
- 不动店员版 `Community.tsx`（与游客版互相隔离）
- 不重新生成历史 post 的丰富内容；老贴维持简版显示