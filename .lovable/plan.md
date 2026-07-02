# 通知/资讯/消息 编辑与消费升级

## 目标

把管理员的「AI 撰稿」弹窗从"标题+一段文本"升级成能真正发一篇带图文章;读者能看到富文本预览;三个分栏各自有未读角标;首页 banner 继续只吃「资讯」。

## 数据 / 存储

- `notifications.image_url` **复用为封面 banner**(已存在字段)。
- **正文以 Markdown 存 `body`**:插入的段落图用 `![](url)` 内联 —— 不动 schema,兼容旧数据。
- 新建 **public bucket `notification-images`**(公开读,认证用户可写):
  - 用 `supabase--storage_create_bucket` 建桶
  - 单独一条迁移写 RLS:`INSERT/UPDATE/DELETE` 仅 admin (`has_role(auth.uid(),'admin')`),`SELECT` 完全公开

## 编辑弹窗 (`Notifications.tsx` 里的 `<Dialog>`)

改造后布局(三段):

1. **AI 对话区**(保留,用于生成/改写草稿)。
2. **草稿编辑区**(新)—— 内部 tab `编辑 / 预览`:
   - **编辑** tab:
     - 顶栏:分类下拉、类型下拉、标题输入 (已有)。
     - **封面 Banner** 上传:拖拽/点击上传一张,缩略图 + 更换/删除按钮 → 写入 `image_url`。
     - **正文** Textarea + 上方"插入图片"按钮:上传后在光标处插入 `![](url)\n`。
     - 支持粘贴图片 (Ctrl+V) → 同一上传函数。
   - **预览** tab:
     - Banner 图 → 标题 → 分类/时间胶囊 → Markdown 渲染的正文,与首页/详情页视觉一致。
3. **底部**:取消 / 发布。

新依赖:`react-markdown` + `remark-gfm`(体积小,`bun add`)。

上传封装 `src/lib/uploadNotificationImage.ts`:
- `(file: File) => Promise<string>` 返回 public URL。
- 校验:≤5MB、`image/*`;路径 `${userId}/${crypto.randomUUID()}.${ext}`。

## 阅读端(列表 + 详情)

- 列表卡片:若 `image_url` 存在,加 16:9 缩略图 (`w-full h-24 rounded-md object-cover`)。
- **点击卡片打开** `NotificationDetailSheet`(新组件,移动 Sheet + 桌面居中 Dialog):
  - Banner + 标题 + 分类徽章 + 时间 + Markdown 正文
  - 打开即 `markRead`
- 复用 `MarkdownArticle.tsx`(`prose prose-sm max-w-none prose-img:rounded-lg`),预览和详情共用。

## 三个 tab 的语义 + 未读角标

- **通知** `category='notice'` = 系统/店铺内部通知
- **资讯** `category='news'` = 文章,首页 banner 同步这一类
- **消息** `category='message'` = 预留跨设备聊天(本轮只保留分栏 + 角标,不接实时聊天通道)

Tab 按钮角标:
- 三个分栏按钮右上角显示各自未读数(过滤 `matchesTab`),小胶囊 `bg-primary text-[10px] px-1 rounded-full`,无未读则不显示。
- 底部 `BottomTabBar` 的「消息」总徽章保持全量 `unreadCount`(已实现,不改)。

## 首页 banner

`Home.tsx:141` 已经只取 `category='news'`,行为不变。补一处:banner 点击跳 `/notifications?tab=news&open=<id>`;`Notifications.tsx` 读到 `open` 参数就自动弹出对应详情 Sheet。

## 影响文件

- 新增 `src/lib/uploadNotificationImage.ts`
- 新增 `src/components/notifications/MarkdownArticle.tsx`
- 新增 `src/components/notifications/NotificationDetailSheet.tsx`
- 改 `src/pages/Notifications.tsx`(弹窗编辑/预览 tab、列表点击、tab 角标、`?open=` 处理)
- 改 `src/hooks/useNotifications.tsx`(select 增加 `image_url, category`,`NotificationItem` 类型补齐)—— 目前 hook 已 select 这两列,但 type 缺,只补类型
- 改 `src/pages/Home.tsx`(banner 点击带 `?open=`)
- 新 storage bucket `notification-images` + RLS 迁移
- `bun add react-markdown remark-gfm`

## 不动

- `notifications` 表 schema
- 底部 tab 徽章逻辑、BOOMER 浮标
- 「消息」聊天功能本轮不做(只做分栏和角标占位,防止范围膨胀)