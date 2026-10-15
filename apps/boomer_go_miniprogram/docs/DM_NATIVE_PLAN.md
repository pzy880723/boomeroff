# 原生员工 DM 设计计划

状态：2026-10-16，设计已获批准，已按 Round 9/10/11/12 的准确契约实现通知/会话/联系人、原生文字及附件聊天。沿用已授权的五 Tab 和现有红白原生样式，不新增一级 Tab，不提交或回滚 Git。真实员工双端与设备验收仍未完成。

## 范围与依据

- 本 worker 后续仅写 `miniprogram/pages/messages/*`、新增 `miniprogram/pages/chat/*`、`tests/direct-messages.test.cjs` 与本文；其他员工页保持冻结。
- 主流程负责 backend、共享 API/session/page、preview 和 `app.json` 页面注册；本 worker 只读这些文件。复用 `definePage`、`api.action`、`session.get/revision` 与现有全局样式，不直连数据库。
- 已读原 Web：`src/pages/Notifications.tsx`、`src/pages/MessagesConversation.tsx`、`src/components/messages/MessagesTabs.tsx`（`ContactsList` 在此文件内）、`AttachmentPicker.tsx`、`src/lib/onlineStatus.ts`；`src/App.tsx` 的 `/messages/:peerId` 是同事聊天路由。
- 已读当前 native `pages/messages`、`shared/page.js`、`shared/api.js`、`shared/session.js`、`app.wxss`，以及 DESIGN/PLAN/GO_MINI_API_CONTRACT/FEATURE_PARITY。现有 `conversation-*` 是 BOOMER 助手，不得改名冒充 DM；当前文档没有准确 DM BFF 契约。
- Web 会话组合最近消息与同店同事；联系人按可见员工资料、门店、岗位、角色分组搜索。Web 聊天只取时间升序前 200 条，并乐观清空输入；原生不继承这两个限制。

## 页面设计

1. 消息 Tab 顶部固定一个三项筛选条：**通知 / 会话 / 联系人**，默认通知，各筛选独立加载、错误、空态、续页状态。仅当前筛选可见，不同时请求三个列表；首次 onLoad/onShow 合并一次加载。沿用 `.page/.card/.row/.muted/.error/.empty`，正文约 16px、点击区至少 44px。
2. 通知保留现有中文分类、上海时间、全部/未读和服务器确认后标已读；已读操作只影响通知，不清空 DM 未读。BOOMER 助手会话保留为明确标注的次级入口，不混入同事会话列表。资讯等服务端已有通知内容不因新增筛选而被隐去。
3. 会话行用头像/姓名、最近消息摘要、`MM-DD HH:mm`、服务端未读数。按服务端顺序续页并按 peer/message 稳定 ID 去重；不从一页消息推算全局未读。同店未聊同事是否混排以准确契约为准，不在客户端拼组织权限。空态引导去联系人。
4. 联系人提供姓名/门店/岗位搜索、授权门店分组，显示后端允许的真实姓名、昵称、岗位、角色、头像；不展示手机号等无关个人信息。优先由 BFF 搜索和分页；若仅支持本地过滤，明确“已加载联系人中搜索”，不可冒充全组织搜索。多店员工按稳定用户 ID 合并，不自行查表补全权限或猜授权门店。
5. 点击会话/联系人进入新增 `/pages/chat/index`；路由仅传编码后的稳定对方 ID，具体参数名待契约确认。服务端重验对方可见性；不能靠传入姓名、角色、门店或 userId 获得访问权。
6. 聊天页使用微信原生导航、紧凑对方资料栏、`scroll-view` 文字气泡、顶部“更早消息”、底部 `textarea` 与发送按钮。本人消息靠右品牌红、对方白底靠左；长文本换行可复制，纯文本渲染，无 HTML/web-view。输入栏适配键盘和底部安全区，不挡最后一条消息。
7. 首读最近一页，历史按服务端稳定游标向前续页，展示时按契约规定的时间/ID 稳定排序。加载旧页保持原阅读锚点；新消息仅在已接近底部时滚到底，否则显示“有新消息”，不打断阅读历史。旧页失败保留已有消息和原游标，重试同页。

## 发送、已读和可见生命周期

- 空白文本不发送；长度按真实契约限制。点击发送后 single-flight，输入保持可见；只在服务端返回可验证的持久化消息回执后插入/合并正式气泡并清空该次原稿。若允许发送期间编辑，新草稿不得被旧回执清空；第一版可发送中禁用编辑以简化。
- 写入失败保留原文并显示局部重试，不生成“已发送”临时气泡；HTTP 成功但回执缺 ID/参与人不符/正文不符也不能宣称成功。超时结果属于未知，先对账；若后端提供幂等键，重试复用同一键及原载荷。没有幂等/查询能力时不得自动重发或宣称重复发送已解决。
- 仅对本次可见会话中已展示的入站消息发已读，提交边界按后端明确的消息 ID 或 read-through 游标。确认后才更新本地状态/未读；失败不假清零，单独重试。本人消息的对方“已读”只取服务端 `read_at` 或等效回执，不能以发送成功代替。
- 初步轮询设计为可见会话列表/聊天页每 10 秒刷新一次，最终遵守后端限频；联系人和隐藏筛选不轮询。用请求结束后安排下一次 `setTimeout`，同类请求 single-flight；不使用累积重叠的 `setInterval`。后台刷新失败保留真实内容并提示同步失败，不回退样例。
- onShow 设置可见状态并刷新/对账；onHide 与 onUnload 立即清 timer、递增可见 epoch，卸载同时遵守 `_gone`。隐藏期间不启动新请求、不应用迟到回包、不补发已读；返回前台不重复创建轮询器。已发出的写操作无法假定已撤销，返回后按真实回执/历史对账。
- 每个请求捕获 userId、shopId、scopeVersion、session.revision、peerId/筛选、page request 序号及可见 epoch；任一不符丢弃成功和失败。换身份/授权范围时清消息、联系人、游标、未读及草稿，不把旧员工内容带给新员工；不持久化私信正文/草稿或任何 token。
- 普通分页/发送/已读错误各自可重试，不把整个聊天页清空；当前有效请求的 401 交给共享 `this.run` 登录失效处理，旧 revision 的 401 不得登出新员工。预览只能来自主流程显式 preview adapter，持续标注“开发预览”，不作为真实发送/已读证据。

## 必须等准确契约确认

| 能力 | 接入前需要的明确内容；当前未假定字段/action |
| --- | --- |
| 联系人与会话 | 各 action/params、稳定 peer ID、搜索/分组与多店语义、page 或 cursor、has_more、未读总数、员工/总部可见范围、selected shop 注入是否适用 |
| 聊天读取 | peer 定位方式、首读是否最新、前后向游标及同时间戳排序、增量是否含本人其他端消息/已读变更、已删除或不可见对方的错误码 |
| 文字写入 | 文本限制、持久化回执字段、参与人校验、稳定 client request ID 的幂等语义、超时对账办法、限流与服务端拒绝语义 |
| 已读 | 指定消息/截至游标的参数、返回确认边界和数量、只允许本人收件、是否返回对方 read_at、未读更新口径；不得以 `{ok:true}` 猜全部已读 |
| 附件与在线状态 | 原 Web 支持图片/视频/文件及 Realtime Presence；文字版不是完整 DM 附件平替。附件发送/安全签名与原生打开、在线状态时效没有真实契约前不露假按钮，不把“未知”显示为“离线” |

## 接契约后的 TDD 与验收顺序

1. 先将真实 DTO 样例转成 `tests/direct-messages.test.cjs` 的 nativePage + 小 wx mock；新增回归并记录失败。只模拟平台与共享边界，不把手造 normalized 数据当作唯一契约证据。
2. 覆盖三筛选切换隔离、首读仅一次、真实联系人搜索/分组/续页、同 ID 去重、通知已读不污染 DM；无权限/空数据/缺字段保留明确区别。
3. 覆盖聊天最近页/更早页/同时间戳去重、续页失败原游标与阅读锚点不丢；确认前不清输入、重复点击只发一次、失败/超时/无效回执保留原稿、发送与轮询交叠无重复气泡、未知结果对账不自动重发。
4. 用可控定时器覆盖 onShow/onHide/onUnload 轮询启停、隐藏页无新请求/已读、迟到成功与失败隔离、同用户重新登录 revision 改变、切店/换 peer/快速切筛选、当前 401 与旧 401 分离。
5. 最小实现仅写约定 pages/messages、pages/chat 与独立测试文件；记录转绿后跑 `node --test tests/direct-messages.test.cjs` 和 `node --test tests/*.test.cjs`，保留原有通知回归，不改旧测试来掩盖行为退化。主流程注册 chat 路由与共享 adapter 后再做集成。
6. 用 DevTools 官方 wcc/wcsc 编译两页，检查 raw `&&`、旧版 WXML 可用语法；请主流程截图验收三个筛选、长气泡/键盘、历史阅读位置和错误保稿。最后用两个真实授权员工核对发送持久化、历史续页、已读跨端、权限拒绝与后台停轮询；预览/单测/编译不算真实 DM 业务验收。

## 当前实施边界

- 已实现 `pages/messages` 三筛选、通知续页与精确 ids 分块已读、DM 会话/联系人续页、已加载联系人搜索；新增 `pages/chat` 原生文字气泡、before 历史、after 积压追取、最新页合并、可见消息 dm-read 与可见页轮询。
- 文字及附件发送确认持久化回执后才清原稿；失败保留、相同载荷使用相同 request_id 重试。附件由用户明确选择后调用主流程的 uploadChatAttachment，保留原扩展名；打开传完整 Message 给 openChatAttachment。没有页面直传云端或 web 跳转。
- 通知批量每块最多 100，只修改 read_ids 确认的已加载通知；ignored_ids 保持未读并说明。不调用 all:true，也不以已加载未读数代表全局。
- Round 12 v3（主流程提供 fixed ref `7a3081199b99cbee95c0ea72d2ca5ffa785ba9ea`，source hash `654c25d0`）：会话首屏不传 snapshot_id，保留服务端冻结 latest_message_ids 集合的 snapshot_id；后页只传该 ID，不再传 snapshot_at。每页（含空页/被删槽位）严格校验同一 snapshot_id、同一 total_at_snapshot，has_more 按服务端槽位语义而非返回 items 数判断；空集合也必须有有效 ID 和总数 0。snapshot_at 不经 Date 转换，但不再作为客户端分页凭证。
- v3 快照 TTL 为服务端 5 分钟；409/snapshot_expired 保留已有列表/游标/快照，显示“会话列表已过期，请刷新”，停自动轮询与续页，不自动重试或拼入新集合。明确刷新才无 ID 重读首屏并重建集合。静默首屏的新快照仅提示更新，不能覆盖原快照或续页游标。此轮仅修改 messages 协议、相关回归及本文，chat/community/共享层/preview 保持冻结。
- Round 11 的其他能力保持：可见消息另用只读 dm-status 更新回执，不把 after 当作旧回执来源。每次打开附件先 dm-attachment{id} 重签并核对 message_id/原消息双方，再传新完整 Message 给共享打开接口；签名失败或错配绝不回退缓存 URL。
- 系统选择器使用独立 token + 原身份/门店/scope/revision + peer 校验，不依赖可见 epoch。hidden 返回结果只暂存，onShow 同一身份/同一 token 才应用并上传一次；hidden 不启动上传，取消保留原稿，卸载或身份变化丢弃。其他网络与回执仍严格按可见 epoch 隔离。聊天宽度约束已修，最终截图复核仍由主流程执行。
- 主流程拥有页面路由注册、共享层和 preview。本 worker 没有修改这些文件，没有真实发送业务消息或操作 backend，没有 Git 提交。完成原生编译与单测后仍需 DevTools 截图和真实双账号端到端验收。
