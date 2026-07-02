## 更正 & 重构范围
上一版误改了 Banner 剪裁，撤回。这次真正的痛点在**消息中心**：撰稿流程要"对话优先"、Banner 要**手动裁剪**、消息要像微信一样能聊。

---

## 1. 撤回 Banner 剪裁
**文件**：`src/pages/Home.tsx`

- Banner 容器恢复原比例 `aspect-[16/6]`（或用户提供的横幅原始比例），`<img>` 保持 `object-cover` 但不做正方形裁剪。上一版首页 Feed 卡片的方形裁剪保留，不动。

## 2. 消息中心 Tab 精简（删除"通知"）
**文件**：`src/pages/Notifications.tsx`、`src/components/layout/BottomTabBar.tsx` 未读角标 hook

- Tab 从 `notice / news / message` 三栏 → **`news / message` 两栏**。
- 默认落到 `news`；`?tab=notice` 兼容重定向到 `news`。
- 数据层保留 `notice` 分类不做迁移（历史数据不删），但 UI 不再展示、不计入未读。
- `useNotifications` 未读计算改为 `category IN ('news','message')`。

## 3. 撰稿弹窗重构：对话在下，预览在上
**文件**：`src/pages/Notifications.tsx`（撰稿 Dialog）

新布局（自上而下）：

```text
┌─────────────────────────────────────┐
│ [顶部] 标题 / 类型选择               │
│                                     │
│ [中区] 实时预览面板                  │
│   - 标题                            │
│   - Banner（含裁剪结果）             │
│   - 正文 Markdown 渲染               │
│   - 内嵌图片                        │
│                                     │
│ [工具栏] 插图 · 生成 Banner · 上传 Banner · 发布 │
│                                     │
│ [底部] AI 对话框（Chat 输入 + 消息流） │
└─────────────────────────────────────┘
```

### 3.1 对话优先流程
- 底部输入框始终可见（类微信输入区），支持多轮对话。
- AI 系统提示词升级：**先追问需求 → 用户确认 OK 后才输出 JSON 草稿**。JSON 落入上方预览区（标题 + 正文），用户可继续对话让 AI 改稿。
- 移除"预览 / 编辑" Tab 切换 —— 预览常驻。正文可点击进入行内编辑（textarea toggle），改完立即反映在预览里。

### 3.2 内嵌图片
- 预览区正文旁提供「插入图片」按钮，弹出上传（走已有 `notification-images` 桶）。
- 上传后在光标位置注入 `![](url)` Markdown，`react-markdown` 直接渲染。

### 3.3 Banner AI 一键生成
- 在工具栏加「AI 生成 Banner」按钮：调用现有 `generate-notification-banner` edge function，用当前标题 + 正文摘要作 prompt。
- 生成中显示 shimmer；完成后写入 `coverUrl`，同样进入下一步的**手动裁剪**。

### 3.4 Banner 上传后手动裁剪
- 新增 `NotificationBannerCropper.tsx`（基于 `react-easy-crop`，已在项目其他地方用过或需新增依赖）。
- 用户选择本地图片 / AI 生成完成后，弹出裁剪弹窗：
  - 固定裁剪框比例 `16:6`（与首页 Banner 一致）。
  - 支持缩放、拖动、旋转（可选）。
  - 输出裁剪后的 blob 上传到 `notification-images` 桶，得到最终 `image_url`。
- **绝不使用 `object-cover` 拉伸/压缩**：所有 Banner 显示都是裁剪后的成品，1:1 呈现。

## 4. 消息 Tab 改造成"微信式店员聊天"
**文件**：新建 `src/pages/StaffMessages.tsx`、复用现有 `spirit-chat` 通道或新建 `staff-chat` edge function

### 4.1 列表页（Tab = 消息）
- 拉取同 `shop_id` 下所有员工：`profiles` 表 join `shifts` 或 `presence` 判断在线（已在班标记🟢）。
- 每行：头像 + 昵称 + 最近一条消息 + 时间 + 未读小红点。
- 顶部固定「BOOMER 助手」（AI）作为第 1 行，其他为真人店员。

### 4.2 会话页
- 点击行或头像进入 `/messages/:peerId`，仿微信：
  - 顶部对方昵称 + 在线状态。
  - 中间气泡列表（自己右侧红瓷、对方左侧灰底）。
  - 底部输入框 + 图片按钮。
- 底层用新表 `direct_messages(id, shop_id, sender_id, receiver_id, body, image_url, read_at, created_at)`：
  - RLS：`sender_id = auth.uid() OR receiver_id = auth.uid()`；`GRANT` 补齐给 `authenticated`。
  - Realtime 订阅按 `receiver_id = auth.uid()` 推送新消息。
- 未读徽章：`useNotifications` 扩展 `messageUnread = SELECT count(*) FROM direct_messages WHERE receiver_id = me AND read_at IS NULL`。

### 4.3 头像入口
- 首页员工列表 / 排班卡片 / 帖子作者名的头像点击 → 直接进入 `/messages/:peerId`。

---

## 技术说明
- 新增依赖：`react-easy-crop`（Banner 裁剪）。若已装则复用。
- 新增表 `direct_messages` + RLS + Realtime replica identity full；配套 `messages_read_at` 更新 RPC。
- 保留 `generate-notification-banner` edge function，仅调用时机改到用户点按钮。
- 无需迁移历史 `notice` 数据；查询侧过滤即可。
- Home Banner 数据源保持 `category='news'`，与本次改动一致。
