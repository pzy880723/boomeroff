
# 消息中心重构

## 一、Tab 布局修复(Notifications 页)

在 `src/pages/Notifications.tsx` 顶部 Tab 切换器:

- **拉满宽度**:去掉 `max-w-[320px]`,改为 `w-full`,三个 tab 平分整行。
- **角标贴文字**:去掉 `absolute -top-1 -right-0.5`(会跑到按钮外角),改用 flex 布局把数字紧贴文字右侧,如 `通知 3` 之间用 gap-1.5,数字用小胶囊 badge。
- 保持点击切换、下划线/背景高亮不变。

## 二、消息 Tab 内部结构:双子 Tab

消息 Tab 内新增顶部置顶的二级 Tab:**聊天 / 联系人**(默认「聊天」)。

### 1. 聊天子 Tab(最近会话)
- 复用现有 `StaffMessagesList` 逻辑,但只显示**有过消息往来**的会话(不再把全部同事塞进来)。
- 每条会话:头像 + 名字 + 所属门店 · 角色 · 最后一条摘要 + 时间 + 未读红点。
- 空态改为:「还没有会话,去『联系人』找同事发起聊天」。

### 2. 联系人子 Tab(全员架构)
- 直接展示全部在用同事(不再"暂无同事"),按**组织架构树**分组:
  - 一级:门店(`shops.name`) / 无门店时归入「总部/未分配」
  - 二级:角色(`app_roles.name`,如超级管理员/区域经理/店长/店员)
  - 三级:用户卡片
- 每张用户卡片显示:头像 + 姓名 + 门店 · 岗位 + 「在线/离线」状态点(基于 `current_session` 表或 5 分钟内心跳)。
- 点击进入 `/messages/:peerId` 现有单聊页。
- 顶部搜索框:按姓名/门店模糊搜索。

## 三、单聊页增强(`MessagesConversation.tsx`)

支持文字/图片/视频/文件四类消息:

- `direct_messages` 表新增字段:`attachment_type`(image/video/file/audio)、`attachment_name`、`attachment_size`、`attachment_mime`。
- 底部输入区加号菜单:📷 图片 · 🎥 视频 · 📎 文件。视频用 `<video controls>` 内联播放,文件显示图标 + 文件名 + 大小 + 下载按钮。
- 复用 `marketing-assets` 或新建 `chat-attachments` bucket 存储。

## 四、群聊占位

- 数据库预留 `chat_rooms` / `chat_room_members` / `chat_messages` 表结构(带 RLS + GRANT),但前端本轮**不建群管理 UI**。
- 联系人页右上角显示「+ 发起群聊」按钮 → 点击弹「即将上线」toast,埋点保留。

## 五、推送通知(Capacitor)

按你选的方案「先本地,后端调用时同时发远程」:

### 本地推送(立即可用,无需凭证)
- `bun add @capacitor/local-notifications @capacitor/push-notifications`
- 新建 `src/lib/push.ts`:
  - 启动时请求权限并注册。
  - 订阅 `notifications` / `direct_messages` 的 realtime INSERT,当**当前收件人 = 自己**时触发 `LocalNotifications.schedule`,内容为标题 + 摘要。
  - `notificationActionPerformed` 监听:点通知 → `/notifications?open=xxx`(通知)或 `/messages/:peerId`(私信)。
- Web 端优雅降级为 `toast`(已存在)+ 浏览器 Notification API。

### 远程推送(后端 Edge Function 占位)
- 新表 `push_tokens` (`user_id`, `platform`, `token`, `updated_at`) + RLS。
- App 启动注册 APNs/FCM token → 存入 `push_tokens`。
- 新 Edge Function `send-push`:
  - 收到 `{user_id, title, body, deeplink}`,查 tokens 并调 APNs (`.p8`) / FCM v1 API。
  - 未配置凭证时静默 no-op(不阻塞现有流程)。
- 在**发通知/发私信**的现有 Edge Function 里追加 `send-push` 调用。
- 凭证(`APNS_KEY_P8` / `APNS_KEY_ID` / `APNS_TEAM_ID` / `APNS_BUNDLE_ID` / `FCM_SERVICE_ACCOUNT_JSON`)后续用 `add_secret` 收集,先留占位不阻塞。

### 通知点击深链
- `notifications` 通知:跳 `/notifications?tab=notice&open={id}`(现有支持)。
- 私信:跳 `/messages/{peer_id}`。
- Capacitor 层用 `App.addListener('appUrlOpen', …)` 统一处理。

## 六、数据库改动一览(单次 migration)

1. `direct_messages`:加 4 列 `attachment_type/name/size/mime`。
2. `push_tokens`:新表 + RLS + GRANT。
3. `chat_rooms` / `chat_room_members` / `chat_messages`:新表 + RLS + GRANT(占位)。
4. `current_session`:确认结构可推导在线状态(已存在,不改)。

## 七、文件改动清单

- **新建**
  - `src/components/messages/ChatTab.tsx` — 最近会话列表
  - `src/components/messages/ContactsTab.tsx` — 全员架构树 + 搜索
  - `src/components/messages/AttachmentPicker.tsx` — 图片/视频/文件选择
  - `src/lib/push.ts` — Capacitor 推送封装
  - `src/lib/onlineStatus.ts` — 在线状态计算
  - `supabase/functions/send-push/index.ts` — 远程推送 Edge Function
- **修改**
  - `src/pages/Notifications.tsx` — Tab 拉满 + 角标位置 + 消息 Tab 接双子 Tab
  - `src/pages/MessagesConversation.tsx` — 支持视频/文件消息
  - `src/hooks/useNotifications.tsx` — 触发本地推送
  - `src/App.tsx` — 挂载 push 初始化
  - `capacitor.config.ts` — 通知图标/声音

## 八、验证

- 桌面浏览器:Tab 平分/角标贴文字/联系人架构可展开/单聊发文件收发正常。
- 手机预览:Realtime 到达时能看到 toast 兜底。
- 打 APK/IPA 后:授权推送 → 后台收到本地通知 → 点击跳转正确页面。

