## 目标

在「官方知识卡编辑」弹窗中，把图片管理改造成"以上传为主、可增删改排序"的图集编辑器，主图就是图集第一张。

## 现状

- 主图 (`cover_url`) 只能由 AI 生成 / 联网搜索得到，不能手动上传
- 图集 (`gallery`) 是只读缩略图，不能删、不能换顺序、不能手动加
- 主图与图集是两个独立字段，关系不直观

## 改造方案

### 1. 概念统一

- **图集第一张 = 主图**：保存时自动把 `gallery[0]` 写到 `cover_url`，两边保持同步
- 「底款」`backstamp_url` 保持独立字段，不动

### 2. 新的图集编辑组件 `GalleryEditor`

替换现有的 PreviewCard 内"图集"那一段，提供：

- **缩略图网格**（横向滚动或 2-3 列）
  - 每张缩略图右上角：删除按钮
  - 每张缩略图左上角：拖拽手柄
  - 第一张额外标记「主图」徽章
  - 点击缩略图可放大预览（lightbox）
- **底部操作条**
  - `上传图片` 按钮（多选 `<input type="file" multiple>`，上传到 `product-images` bucket，路径前缀 `official-gallery/`）
  - `AI 生成` 按钮（保留现有 `generateGallery` 行为，结果 append 到末尾）
  - `联网搜图` 按钮（保留现有 `webSearchImages` 行为，结果 append 到末尾）
- **排序交互**
  - 桌面端：HTML5 drag-and-drop 重新排序
  - 移动端：每张图旁边加「上移 / 下移 / 设为主图」三个小按钮（移动端 390px 宽时拖拽不好用）
- **空状态**：提示「点击下方上传图片，第一张将作为主图」

### 3. 上传逻辑

新增内部函数 `uploadImages(files: File[])`：

1. 对每个文件：调用 `supabase.storage.from('product-images').upload(...)`，路径 `official-gallery/{timestamp}-{rand}.{ext}`
2. 拿到 publicUrl
3. `setGallery(prev => [...prev, ...newUrls])`
4. 编辑模式下立即 persist：`update official_knowledge set gallery = ...`

进度反馈：上传中显示 spinner overlay。

### 4. 主图同步

`save()` 里：

```ts
const cover = gallery[0] || coverUrl || null;
payload.cover_url = cover;
payload.gallery = gallery;
```

任何时候 `gallery` 变化（重排、删除、上传、AI 生成），如果 `gallery[0]` 与当前 `coverUrl` 不一致，自动 `setCoverUrl(gallery[0])`，让左侧大封面预览跟着变。

### 5. 顶部大封面区

继续显示 `coverUrl`（即 gallery[0]）；
"重新生成" 按钮保留，点击后 AI 生成的新图替换 `gallery[0]`（而非另存为 cover_url）。

### 6. 不改的东西

- 数据库结构（`gallery` jsonb + `cover_url` text + `backstamp_url` text 都已存在）
- `OfficialDetail.tsx` 的展示（仍读 `cover_url` + `gallery` + `backstamp_url`）
- 「一键丰富」流程（仍可写入 gallery / cover）
- 底款管理保持独立按钮

## 涉及文件

- `src/components/admin/AiKnowledgeDialog.tsx`：新增 `GalleryEditor` 子组件，替换原"图集"段；改 `save()` 的 cover/gallery 同步逻辑；新增 upload handler
- 不需要 migration、不需要新 edge function

## 待确认

如果你有不同想法，告诉我后我再调；否则审批后我直接按上面实现。
