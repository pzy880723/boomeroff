## 恢复「通知」Tab

上一轮误删了通知分栏，这次把它加回来，并跟资讯/消息严格区分职责。

### 三栏定位
- **通知**：系统 & 运营下发的强提醒（活动开始、审核结果、排班变更、后台公告、紧急通告等），带未读红点，可能弹 Toast。
- **资讯**：图文长内容（AI 撰稿的 Banner 文章），首页 Banner 只吃这一栏。
- **消息**：同店店员一对一微信式聊天。

### 改动点
1. `src/pages/Notifications.tsx`
   - `Tabs` 改回三栏：通知 / 资讯 / 消息，默认 tab 支持 `?tab=notice|news|message`。
   - 通知列表：按 `category in ('notice','system','activity','shift','urgent')` 拉取，卡片支持已读态、跳转、清空全部已读按钮。
   - 保留资讯栏的 AI 撰稿弹窗与 Banner 裁剪流程，保留消息栏的店员列表。

2. `src/hooks/useNotifications.tsx`
   - 恢复对通知类目的拉取，`unreadCount` 拆成 `noticeUnread / newsUnread / messageUnread` 三个数，`BottomTabBar` 的总红点 = 三者之和。
   - Realtime 订阅仍然只订 `notifications` 表；分类由 `category` 字段区分。

3. `src/pages/Home.tsx`
   - Banner 数据源保持 `category='news'` 不变（不受本次影响）。
   - 顶部铃铛点击默认打开「通知」Tab，即 `/notifications?tab=notice`。

4. 兼容旧数据
   - 已有 `category is null` 或未知分类的记录归入「通知」栏，避免历史消息丢失。

### 不改动
- `direct_messages`、店员聊天页、资讯撰稿/裁剪逻辑保持现状。
- 数据库表结构无需 migration（`notifications.category` 已存在）。
