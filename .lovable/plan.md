## 找错地方了，重做计划

之前我改的是 `AiKnowledgeDialog`（"AI 修改"弹窗）。你截图里的是另一个组件 **`KnowledgeRichEditDialog`**（"编辑词条"弹窗），位于 `src/components/library/KnowledgeRichEditDialog.tsx`。

## 目标

把"编辑词条"弹窗里的图片编辑也升级成可视化图集编辑器：
- 移除原来的「封面图 URL」输入框 + 「图集（每行一个 URL）」textarea
- 用一个**图集编辑器**取代两者：缩略图网格 + 上传/联网搜图/删除/排序/设为主图
- 主图 = 图集第一张，保存时自动写回 `cover_url`

## 改造内容（KnowledgeRichEditDialog.tsx）

### 1. 状态合并

- 删掉 `galleryText` (textarea) 和 `draft.cover_url` 输入
- 新增 `gallery: string[]` state，初值 = `item.gallery`（若为空且有 cover_url，就 `[item.cover_url]`）
- 新增 `uploading: boolean`

### 2. UI 替换"封面图 URL" + "图集"两个区块为单一「图片」区块

- 标题：**图片**（说明：第一张为主图）
- 3 列网格缩略图，每张：
  - 第一张显示「主图」徽章
  - 右上角：删除按钮
  - 底部小工具条：前移 / 后移 / 设为主图
- 空态提示：「尚无图片，请上传或联网搜图」
- 操作按钮（按钮组）：
  - 「上传图片」(`<input multiple>` → `product-images/official-gallery/`)
  - 「联网搜图」(调 `web-search-images` edge function，复用现有)
  - （不在这里放 AI 生成，AI 创作留在 `AiKnowledgeDialog`）

### 3. 保存逻辑

```ts
update official_knowledge set
  cover_url = gallery[0] ?? null,
  gallery = gallery,
  ...
```

### 4. 复用代码

把 `AiKnowledgeDialog` 里写好的上传/排序逻辑抽出共享，或直接复制一份精简版（这里不带 persist-on-change，统一在「保存」按钮提交即可，简单点）。

## 不动

- 视频 URL 输入框保留
- 「正文 / 卖点 / 小贴士 / 重要程度」保留
- 数据库结构不变
- `AiKnowledgeDialog` 保留之前的改动（给 AI 流程用）

## 涉及文件

- `src/components/library/KnowledgeRichEditDialog.tsx`（主改）

审批后我直接改。
