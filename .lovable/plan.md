## AI 撰稿弹窗 - 编辑体验重构

围绕四个诉求改造 `src/pages/Notifications.tsx` 及裁剪器 `NotificationBannerCropper.tsx`。不动 edge function 与数据库。

### 1. Banner 允许"直接修改"
现在 `coverUrl` 存在时只有一个 ✕ 移除,再重新走"上传/AI 画封面"。改为:
- 预览 banner 右上角新增「更换」按钮(RefreshCw 图标),点击弹出小菜单:
  - 重新上传本地图片(触发原 `<input type=file>`)
  - AI 重画封面(调 `generateBannerByAI`)
  - 重新裁剪当前 banner(把 `coverUrl` 作为 `cropSrc` 再送进裁剪器)
- 保留原 ✕ 移除按钮。
- 移除现在的错误感:替换/裁剪失败时,原封面不清空(现在 `applyCroppedBanner` 一路顺利才置 URL,已 OK;补一句错误提示时保留旧 URL)。

### 2. 裁剪器:图片自由拖放,固定虚线框
`NotificationBannerCropper.tsx` 现在容器 `aspectRatio: 16/6` + `objectFit=contain`,导致图片被缩到很小,裁剪框贴着容器。改为:
- 容器改为固定高度(如 `h-[70vh] max-h-[520px]`)、全宽,黑底,图片 `objectFit="horizontal-cover"` 让图片按自然大小铺满容器宽度,超出的部分可由用户拖动。
- 裁剪框仍为 16:6 固定虚线框、居中显示(react-easy-crop 的默认 crop area),用户通过拖动图片 / 缩放来决定框住哪块。
- 缩放范围放宽到 `min=1, max=5`,双指手势与滚轮都启用(`zoomWithScroll`, 已默认)。
- 底部工具条加提示文案:"拖动图片调整位置,双指或滑块缩放"。
- 保存时仍按当前裁剪区域输出 blob,逻辑不变。

### 3. 撰稿弹窗排版与插图修复
**a) 标题独立输入框**  
现在标题只在「预览」tab 顶部一行的分类/类型选择器旁边,窄且不显眼。改为:
- 预览 tab 顶部改成两行:
  - 第 1 行:分类 Select + 类型 Select(保留)
  - 第 2 行:一个专门的**标题输入框**(整行,font-semibold,占位"输入通知标题")
- 正文区块与标题分开清晰:标题下方是编辑正文的区块(Markdown 或 Textarea)。

**b) 正文换行/段落显示**  
AI 输出 body 有时是纯字符串没有段落。让前端在渲染前做一步"归一化":两个换行分段、单换行保留(用 `remark-breaks` 或手动 `\n` → `  \n`)。方案:给 `MarkdownArticle` 加 `remark-breaks` 插件,渲染时单换行即换行,不需要 AI 严格输出双空行。
(仅前端渲染层改动,不改 edge function。)

**c) 插图上传"插不进去"的排查与修复**  
现在只有在预览 tab 的工具条有「插图」按钮,且用户如果没点「手改」进入 Textarea,insertBodyImage 走的是"追加到 body 末尾"分支——追加后 body 仍以 Markdown 渲染,图片其实是插入了,但用户看不到光标反馈,以为失败。修复:
- 每次 `insertBodyImage` 成功后 `toast.success('已插入图片')`,并自动进入 `editingBody=true` 让用户看到 `![](url)` 语法便于删改;然后短延时切回渲染(或保留手改态由用户决定,保留即可)。
- 若上传报错,把错误信息 toast 出来(现在已有 catch,但确认信息可读)。
- 插入的 Markdown 片段前后各留一个空行,确保和上下段隔开:`\n\n![](url)\n\n`(已有,保留)。
- 提供一个"从工具条直接添加图片"的快捷:点击后立即出现在正文末尾,同时把预览区自动滚动到底,让用户看到新插入的图。

### 4. 新增「保存到草稿箱」+ 草稿箱入口
底部工具条改为三个按钮:
```text
[ 保存到草稿箱 ]  [ 草稿箱 (n) ]  [ 发布 ]
```

- 存储方式:`localStorage['notif-drafts']` 数组,每项 `{ id, title, body, type, category, coverUrl, updatedAt }`。
- 保存草稿:写入(或按 `id` 更新),toast 成功,不关弹窗。
- 打开弹窗时,如果有正在编辑的 `currentDraftId`,继续编辑同一条;否则新建。
- 草稿箱按钮点开一个小 Sheet/Dialog,列出所有草稿(标题 + 时间 + 类型徽章):
  - 点条目:载入到编辑器(填 title/body/type/category/coverUrl,`currentDraftId` 记住)。
  - 每条右侧:删除按钮。
- 关闭撰稿弹窗时不再直接 reset;若有未保存改动,提示"保留草稿?"(保留 = 自动写入草稿箱;丢弃 = 清空)。
- 发布成功后,从草稿箱移除该草稿。

### 技术细节
- 文件:
  - `src/pages/Notifications.tsx`(主改)
  - `src/components/notifications/NotificationBannerCropper.tsx`(容器/objectFit/zoom range)
  - `src/components/notifications/MarkdownArticle.tsx`(加 `remark-breaks`)
  - 新增 `src/lib/notificationDrafts.ts`(localStorage 读写、id 生成)
- 依赖:`remark-breaks` 已很小,可以直接 import(若未安装再 `bun add remark-breaks`)。
- 不改动:`compose-notification` edge function、`uploadNotificationImage`、bucket 策略、发布 API。

### 交互后的弹窗结构
```text
Dialog (fullscreen)
 ├─ Header: [AI 撰稿]  [对话 | 预览]  [X]
 ├─ Chat view (对话)          Preview view (预览)
 │   聊天流 + 快捷 chip         ┌─────────────────────┐
 │   底部: [👁] [发一条通知…] [→]   │ Banner ⤴更换  ✕移除 │
 │                              │ [标题输入框]         │
 │                              │ [正文 Markdown/手改] │
 │                              └─────────────────────┘
 │                            工具条:上传/AI画/插图/手改
 │                            主按钮行: 保存到草稿箱 | 草稿箱(n) | 发布
```
