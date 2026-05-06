## 目标

把"联网搜图"从"自动塞 4 张到图集"改成"弹出选图器 → 一次给 20 张候选 → 勾选后再加入图集，不满意可点'下一批'刷新"。

## 实现方案

### 1. 边缘函数 `web-search-images` 增加两种模式

接口扩展（向后兼容）：

- 默认 / `mode: "search"`：返回最多 20 张**原始 URL**（不再镜像下载到 Storage，速度极快，~1–2s）。新增 `exclude: string[]` 参数 —— 把"上一批已经展示过的 URL"传进来，在去重时直接跳过，实现"下一批"。同时把 Firecrawl `limit` 调到 30–40 做候选池。
- `mode: "mirror"`：前端把用户**勾选的原始 URL** 传进来（`urls: string[]`），函数并发下载 + 上传到 `product-images/web-gallery/`，返回公网 URL 数组。这样只为真正被选中的图付出下载成本。

返回结构：
```ts
// search 模式
{ images: [{ url, source }], found: number, reason?: string }
// mirror 模式
{ images: string[], failed: number }
```

### 2. 新增 `src/components/library/WebImagePickerDialog.tsx`

一个 Dialog 组件：

- 顶部：搜索词（默认 `draft.name`，可改）+ 「搜索」按钮
- 中部：3 列网格，最多 20 张缩略图；每张右上角勾选框；底部小字显示来源域名
- 加载中骨架；无结果时提示并保留"下一批"按钮
- 底部按钮：
  - **下一批**：把当前 20 张 URL 加入 `seenSet`，重新调用 `mode: "search"` 并传 `exclude: [...seenSet]`
  - **取消**
  - **加入图集（已选 N 张）**：禁用直到至少选 1 张；点击后调用 `mode: "mirror"` 把选中 URL 镜像到 Storage，拿到公网 URL 后通过 `onConfirm(urls: string[])` 回调返回，并 toast 成功。

为避免热链失败展示空白：`<img>` 加 `referrerPolicy="no-referrer"` 和 `onError` 隐藏失败缩略图。

### 3. 改造 `KnowledgeRichEditDialog.tsx`

- 删除现有的 `webSearch()` 直接搜图逻辑。
- "联网搜图"按钮改成打开 `<WebImagePickerDialog open initialQuery={draft.name} onConfirm={(urls) => setGallery(prev => Array.from(new Set([...prev, ...urls])))} />`。
- 其它（上传 / 删除 / 移动 / 设为主图）保持不变。

### 4. AiKnowledgeDialog 不动

`AiKnowledgeDialog.tsx` 里的 `webSearchImages()` 还在多处自动调用（封面候选、底款等），保持向后兼容（不传 `mode` 时默认走老的镜像路径）。

## 改动文件

- 编辑：`supabase/functions/web-search-images/index.ts` —— 增加 `mode` / `urls` / `exclude` 分支
- 新建：`src/components/library/WebImagePickerDialog.tsx`
- 编辑：`src/components/library/KnowledgeRichEditDialog.tsx` —— 用选图器替换原直连搜图

## 兼容性

- 边缘函数对老调用方（不传 `mode`）保持原行为：搜图 + 自动镜像 + 返回 `{ images: [{url, source}] }`。
- 前端老的 `AiKnowledgeDialog` 调用无需修改。

## 用户体验

- 第一次出图：1–2 秒内出 20 张缩略图（不镜像，纯展示）
- 「下一批」：再 1–2 秒
- 「加入图集」：仅镜像被选中的 N 张，并发下载，3–5 秒拿到入库后的公网 URL