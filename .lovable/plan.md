## 目标
让发布工作台既能发视频也能发图文,并且根据所选素材类型自动判断每个账号所属平台是否支持,不支持的置灰禁选;同时增加 AI 一键生成标题/正文/话题。

## 1. 素材选择(支持视频 + 图文)
- 顶部「素材」区改造:除了 URL `?asset_id=` 预填外,新增 `选择素材` 按钮,弹出 `LibraryAssetPickerDialog`(基于已有 `LibraryImagePickerDialog` 模式扩展):
  - Tab:视频 / 图文(图片可多选,1–9 张,按现有 `social_platform_specs.images_max` 上限校验)
  - 支持按标签/品类筛选(复用 `marketing_assets.tags / category`)
- 选中后:
  - 视频 → `kind='video'`, 显示封面缩略图
  - 图文 → `kind='image_text'`, 显示图片网格 + 张数

## 2. 平台账号灰度规则
- 拉到 `social_platform_specs` 后构建:
  - `videoOk(platform) = spec.supports_video`
  - `imageOk(platform) = spec.supports_image_text`
- 当前 `kind` 决定每个账号是否可选:
  - 不支持 → 禁用 Checkbox + 文案变灰 + 右侧小字「不支持视频/不支持图文」
  - 切换素材类型时,自动取消已勾的不兼容账号并 toast 提示
- 图文模式额外校验张数:某平台若 `images_min/max` 与所选图片数不符,显示行内红字提示且禁选

## 3. AI 辅助生成文案
- 通用文案区增加 `✨ AI 一键生成` 按钮:
  - 视频 → 调 `generate-marketing-copy`,传 `image_urls = [poster_url]`(无 poster 则用首帧/output_url)
  - 图文 → 传所选图片 URL
  - 平台参数:若只勾了一个平台,带上对应 `platform`;多平台或未选时默认 `xhs`
  - 返回 3 条候选 → 弹底部 Sheet 列表,点其中一条把 title/body/tags 回填到通用文案
- Loading/限流/额度错误按现有 toast 模式提示

## 4. 提交逻辑
- `dispatch-job-create` 已支持 `kind: 'image_text'` + `images: string[]`,无需后端改动
- 提交时根据当前 `kind` 组装 `images / asset_id` 字段

## 技术细节
- 新文件:
  - `src/pages/marketing/dispatch/LibraryAssetPickerDialog.tsx` — 复用现有素材库查询,Tab 切视频/图文,过滤 `kind in ('video','copy/image')` 与 `meta.output_image_urls`
  - `src/pages/marketing/dispatch/AiCopySheet.tsx` — 调 `generate-marketing-copy` 并展示 3 条候选
- 修改:
  - `Workbench.tsx` — 增 `kind` state、`images` state、灰度逻辑、AI 按钮、动态提交体
- 不动后端 edge function;不动 specs 表结构

## 验收
- 选视频后,只支持图文的平台账号变灰且无法勾选;反之亦然
- AI 按钮点击后能填充三栏文案
- 视频和图文都能成功提交到 `dispatch-job-create` 并跳转 JobDetail