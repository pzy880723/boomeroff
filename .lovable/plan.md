
# BOOMER GO 门店运营系统 · 改版计划书 (v2)

## 一、品牌与视觉方向(锁定)

- 应用名: **中古小精灵** → **BOOMER GO**(登录页/顶栏/PWA/Capacitor/文档全站替换)
- Logo: 替换为附件 BOOMER-OFF 朱红 wordmark
- 主色板锁定:
  - 主色朱红 `#E60012`
  - 背景纯白 `#FFFFFF`(**不使用粉色底**)
  - 深字 `#1A1A1A`,次级灰 `#8A8A8A`,分隔线 `#F0F0F0`
- 视觉方向: **方向 1 + 方向 2 融合**
  - 卡片: 方向 2 的几何结构感,粗黑边框 + 硬阴影 4px offset(Neubrutalism 收敛版,纯白底)
  - 底部导航: 方向 1 的**悬浮黑色胶囊 + 中间朱红凸起按钮**
  - 品牌栏: 大号 BOOMER-OFF wordmark
- 字体: `HarmonyOS Sans SC` / `Noto Sans SC`(中文),数字 `Inter` tabular-nums

## 二、BOOMER 海獭浮标(保留,重要)

- **形象/浮标完全保留**,继续用 `SpiritMascot` + 8 姿态资产,不动 canonical 规则
- 抽屉 `SpiritDrawer` 改为**只有一个 Tab: 对话**
  - 删除现有「仪表盘」Tab 及内部 `DashboardInner`
  - 抽屉打开后直接就是全屏聊天,不再有 Tab 切换
- 浮标交互不变: 点击弹出对话抽屉、长按/滑动等既有手势保留
- 悬浮位置: 移动端右下贴边(避开新底部胶囊导航,间距 96px 以上)

## 三、BOOMER Agent 对话页重新设计(全店问答入口)

Agent 定位重写: **不再只是"精灵闲聊"**,是店员的"店内一切问题问它"入口。能查排班、查活动、查商品知识、查通知、查话术、走 AI 识别、走营销、查门店 SOP、查顾客 Q&A。

### 3.1 UI 结构(遵循 chat-ui-composition)

采用 AI Elements 组件搭建:
- `Conversation` + `ConversationContent` + `ConversationScrollButton`: 消息流
- `Message` + `MessageContent` + `MessageResponse`: 用户/助手气泡,助手气泡**无底色**、用户气泡朱红底白字(`#E60012` / `#FFF`)
- `Tool` + `ToolHeader/Content/Input/Output`(默认收起): 工具调用可视化
- `PromptInput` + `PromptInputTextarea` + `PromptInputFooter` + `PromptInputSubmit`: 输入区
- `Shimmer` "BOOMER 正在思考…" 作为 pending 态
- 顶栏: 左侧 BOOMER 头像(`boomer-avatar.png`) + 名称「BOOMER」+ 副标题「店内小百科」;右侧「新对话 / 关闭」两个 icon button
- 空态: 大号 BOOMER `wave` 姿态 + 一句问候 + **4 张快捷问题卡**(可点击直接发送):
  1. 「我今天几点上班?」
  2. 「店里现在有哪些活动?」
  3. 「帮我拍一条探店视频」→ 直跳 `/me/marketing/video`
  4. 「这个包大概值多少钱?」→ 直跳 `/scan`

### 3.2 Agent 能力(工具集)

在 `supabase/functions/spirit-chat` 中扩展工具(AI SDK `tool` + Zod `inputSchema`,`stepCountIs(50)`):

| 工具 | 作用 | 数据源 |
|---|---|---|
| `get_today_shift` | 查询当前登录店员今日班次+搭档 | `shift_schedules` + `shop_shifts` |
| `list_active_activities` | 列门店进行中活动/优惠券 | `activities` + `vouchers` |
| `list_recent_notifications` | 最近未读通知 | `notifications` |
| `search_official_knowledge` | 官方知识库 RAG | `official_knowledge` |
| `search_shop_kb` | 门店 SOP / 顾客 Q&A | `shop_kb_entries` |
| `lookup_product_history` | 查历史成交价 | `products` + `price_records` |
| `open_route` | 让 Agent 直接跳转前端路由 | 前端接管 `navigate()` |
| `submit_correction` | 报错纠正入队(admin 审) | `app_settings.pending_corrections` |

所有查询自动带 `auth.uid()` + `shop_id` 上下文,不越权。

### 3.3 会话历史策略

按 `chat-agent-ui-contract`,提前确认:
- **单会话 + localStorage** (推荐)—— 不建线程列表,浮标每次打开都是同一会话,可"新对话"清空;不占数据库表。
- 若用户想要历史线程,再改为「多线程 + Supabase」方案(需要新建 `spirit_threads` 表)。
- 现有 `spirit_conversations` / `spirit_messages` 表**保留**用于打点分析,不作为会话回放来源。

### 3.4 微交互

- 输入框始终聚焦(初次打开、发送后、关闭再打开)
- 支持 `Cmd/Enter` 发送、`Shift+Enter` 换行
- 工具执行渲染为可折叠卡片,默认收起
- 长回答支持 markdown、代码块、内联链接可点(跳内部路由)

---

## 四、底部导航改版

新 5 Tab(左→右):
```
仪表盘  |  官方知识  |  AI识别(中,凸起)  |  通知  |  我的
```
- 删除「中古圈」Tab(路由保留,后台可访问)
- 「个人知识」独立 Tab 移除,合并到「我的 → 我的知识库」
- 悬浮黑胶囊 + 中间朱红凸起按钮,底部离屏 8px

## 五、首页(Dashboard,新增)

新 `src/pages/Home.tsx`,路由 `/` 默认改为 Home。原 BOOMER 浮标抽屉里的仪表盘内容(`DashboardInner`)搬到这里并升级。

首屏卡片顺序:
1. **品牌栏**: BOOMER-OFF logo + 门店名 + 店员名 + 等级徽章
2. **今日打卡卡**: 当前时间大字 + 打卡状态 + 「开始打卡 / 下班打卡」大按钮(硬阴影)
3. **我的今日排班**: 班次时段 + 搭档头像 + 休息时长
4. **门店进行中活动/优惠券**: 横滑卡片,聚合 `activities` + `vouchers`
5. **最新通知 Top 3**: 未读红点 + 置顶标记
6. **每日知识卡**: 复用 `daily_knowledge`
7. **等级 & 经验**: 精简 `LevelCard`
8. **快捷入口 4 宫格**: AI识别 / 营销中心 / 官方知识 / 顾客 Q&A

数据聚合: 新建 `useHomeData()`,并发拉取 + `homeCache` localStorage 首屏 0 RTT。

## 六、通知模块(替代"中古圈")

路由: `/notifications`。表 `notifications` 扩展字段:
- `pinned bool`
- `require_ack bool`
- `target_shop_ids uuid[]`
- `target_roles text[]`
- `target_levels int[]`
- `cover_url text`
- 新表 `notification_acks(notification_id, user_id, acked_at)`

管理员界面 `/portal → 通知管理`:
- 富文本 + 封面
- 分发维度: 门店多选 / 角色职位 / 等级区间
- 置顶 + 必读回执开关

用户端:
- Tab 徽章实时未读数
- 「置顶 / 全部」分段
- 必读通知底部「我已阅读」→ `notification_acks`
- 未确认必读通知首页强弹一次

RLS: SELECT 按三维过滤;INSERT/UPDATE/DELETE 仅 admin。

## 七、"我的"页收纳「个人知识」

- `/my-kb` 路由保留,底部 Tab 入口移除
- 「我的」Settings 加一行「我的知识库」→ 跳 `/my-kb`

## 八、删除 / 迁移清单

| 项目 | 处理 |
|---|---|
| 底部 Tab「中古圈」 | 删入口,路由保留 |
| 底部 Tab「个人知识」 | 删入口,进「我的」 |
| `SpiritDrawer` 内「仪表盘」Tab + `DashboardInner` | **删除**,抽屉只剩对话 |
| `FloatingDashboard` 浮球 | 删除(与 SpiritMascot 重复),仅保留 SpiritMascot |
| 现有 `Dashboard.tsx` (LiveStreamPanel) | 归到 `/portal` 后台运营视图 |
| `Me.tsx` 内「营销中心」入口卡 | 保留 |
| BOOMER 8 姿态资产 / SpiritMascot 动画 | **保留不动** |

## 九、实施顺序

**Step 1 · 视觉底座 + 首页**
- 全站 logo/文案替换为 BOOMER GO
- 重写 `index.css` design tokens(红白 + 硬阴影 + 粗边)
- `BottomTabBar.tsx` 改悬浮黑胶囊 + 新 5 Tab
- 新 `Home.tsx` + 8 卡片组件
- 路由 `/` 默认改 Home
- 删除 `FloatingDashboard`

**Step 2 · BOOMER 抽屉瘦身 + Agent 对话页重设计**
- `SpiritDrawer` 删仪表盘 Tab,只留对话
- 用 AI Elements 重写对话面板 UI
- 扩展 `spirit-chat` edge function 工具集(排班/活动/通知/知识/跳转)
- 单会话 + localStorage 历史(先默认,后可扩线程)
- 空态 4 张快捷问题卡

**Step 3 · 通知模块**
- 迁移 `notifications` 表 + 新建 `notification_acks`
- 用户端 `/notifications` 页
- 后台 `NotificationManager` 扩展分发维度/置顶/必读
- Realtime 徽章

**Step 4 · 我的页收纳 + 中古圈下线**
- Settings 加「我的知识库」入口
- 底部 Tab 去 `/community` `/my-kb`

## 十、技术要点

- 首页缓存: 参考 `profileCache.ts` 建 `homeCache.ts`
- 通知 RLS: `(target_shop_ids @> ARRAY[my_shop_id] OR target_shop_ids IS NULL) AND (target_roles && my_roles OR target_roles IS NULL) AND (my_level = ANY(target_levels) OR target_levels IS NULL)`
- 硬阴影 token: `--shadow-hard: 4px 4px 0 0 #1A1A1A`,`--border-hard: 2px solid #1A1A1A`
- Agent 对话: `spirit-chat` 已存在,升级为 AI SDK `streamText` + tools + `stopWhen: stepCountIs(50)`
- Agent 前端: `useChat` + `DefaultChatTransport`,消息渲染 `message.parts`,工具用 `Tool` 组件默认收起

## 十一、验收

- [ ] 文案「中古小精灵」/ 旧 logo → BOOMER GO + 新 logo
- [ ] BOOMER 浮标仍在,点击只弹对话(无仪表盘 Tab)
- [ ] Agent 对话能查排班/活动/通知/知识,能跳内部路由,回答带 markdown
- [ ] 底部 5 Tab 正确、悬浮胶囊、中间凸起
- [ ] 首页 8 卡片按序展示,数据真实
- [ ] 管理员可发通知并定向门店/角色/等级 + 置顶 + 必读
- [ ] 「个人知识」入口在「我的」内可点,底部无
- [ ] Home 首屏 < 300ms(缓存命中)
