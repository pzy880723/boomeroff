## 目标
1. 资讯 tab 用独立、贴合门店经营的分类
2. 修复 Banner 上传/显示失败
3. 编辑正文所见即所得，插图能正常工作

---

## 1. 资讯分类改造（门店经营向）

`资讯`tab 使用 6 个新类型，`通知` tab 保留原来的公告/制度/活动/紧急。

**资讯专用类型**（value → 中文 → 色调）：
- `store_open` 新店开业 - 主色
- `store_update` 门店动态 - accent
- `hot_item` 爆款情报 - warning 橙
- `official_event` 官方活动 - primary
- `industry` 中古行业 - foreground/10
- `staff_story` 店员故事 - accent

**实现**：
- `TYPE_LABEL` 里追加以上 key（保留旧的向下兼容，老数据不出错）。
- 抽出 `NOTICE_TYPES` / `NEWS_TYPES` 两个数组，撰稿弹窗里的类型 `Select` 根据当前 `category` 动态渲染选项。
- `resetCompose` 与 `openCompose`：切到资讯时默认 `type = 'store_update'`，切到通知时默认 `type = 'announcement'`。当用户在预览页手动切分类，若当前 `type` 不属于目标集合则自动重置成该集合的默认值。
- `CHIPS`（AI 快捷指令）根据 `category` 切换：资讯时展示"🏪 发新店开业 / 📈 发爆款情报 / 🎉 发官方活动 / 📖 发店员故事"。
- `compose-notification` edge function 的 prompt 追加"当前分类 = 资讯"时的类型枚举说明，让 AI 返回资讯类的 type，而非 announcement。

---

## 2. Banner 上传失败修复

**根因**：`notification-images` bucket 是私有的，但代码用 `getPublicUrl` 拿 URL；私有 bucket 的 public URL 无法在 `<img>` 里加载，同时上传成功后前端拿到的是 404/403 图片，界面看起来"上传不上去"。

**修复**：
- 用 `supabase--storage_update_bucket` 把 `notification-images` 改为 **public**（已有的 SELECT storage policy 本来就是全放开，语义一致）。
- 顺便在 `uploadNotificationImage.ts` 把 `upsert: false` 改成 `true`，避免重名场景 5xx。
- `pickCoverFile` 里 `URL.createObjectURL` 拿到的对象 URL 传给 cropper 后要 `URL.revokeObjectURL` 释放；顺手补一下（防止内存泄漏，非关键）。

---

## 3. 富文本编辑器 + 插图

**根因**：当前正文用 `Textarea` + Markdown 渲染，双模式切换 → 编辑时看到裸 `##`、`![](url)`，插图逻辑本身可跑，但用户"编辑态"看到的是源码。

**方案**：引入 **TipTap**（React 生态成熟、体积可控），替换正文的 Textarea 编辑模式：
- 新增依赖：`@tiptap/react`、`@tiptap/starter-kit`、`@tiptap/extension-image`、`@tiptap/extension-placeholder`。
- 新建组件 `src/components/notifications/RichBodyEditor.tsx`：内嵌工具栏（B / I / H2 / H3 / • / 1. / 引用 / 插图 / 撤销）+ 编辑区，输出 HTML。
  - 插图按钮：内部 `<input type=file>` → `uploadNotificationImage` → `editor.chain().focus().setImage({ src })`。
  - `HTMLtoText` 长度用于草稿 / 校验。
- **正文数据**：body 字段继续存字符串。约定：新写的内容以 HTML 存（`<p>...</p>` 开头），老 Markdown 保持兼容。
- 渲染分流：`MarkdownArticle` 在 `content.trim().startsWith('<')` 时改走 `dangerouslySetInnerHTML`（先经过 `DOMPurify` 白名单），否则走原有 markdown 管道。
  - 新增依赖：`isomorphic-dompurify`（很小，同构安全）。
- 撰稿弹窗里预览页把原来的 `editingBody ? Textarea : MarkdownArticle` 换成永远显示 `RichBodyEditor`。删掉 `editingBody`、`bodyRef`、`insertBodyImage` 的旧 textarea 分支，改为把已上传 URL 传给 editor 插入。
- AI 生成的正文当前是 Markdown → 首次进入预览时用 `marked` 转成 HTML 灌进 editor（`marked` 已经装过就复用，未装则加）。若已装 `react-markdown` 但没 `marked`，就用轻量正则做 md→html 也可以；简化起见新增 `marked` 依赖。
- 详情弹窗 `NotificationDetailSheet` 也走同一个 `MarkdownArticle`（自动分流 HTML / MD），无需额外改动。

---

## 涉及文件
- `src/pages/Notifications.tsx`：分类枚举、Select 动态选项、CHIPS、`resetCompose` 默认值、把预览正文改为 `RichBodyEditor`
- `src/lib/uploadNotificationImage.ts`：`upsert: true`
- `src/components/notifications/RichBodyEditor.tsx`（新增）
- `src/components/notifications/MarkdownArticle.tsx`：HTML/MD 分流 + DOMPurify
- `supabase/functions/compose-notification/index.ts`：prompt 增加资讯类型枚举
- Storage：`notification-images` bucket → public（工具调用）
- `package.json`：新增 tiptap 三件套 + `isomorphic-dompurify` + `marked`

无数据库 schema 变更，无破坏性数据迁移，老通知继续按 Markdown 渲染。