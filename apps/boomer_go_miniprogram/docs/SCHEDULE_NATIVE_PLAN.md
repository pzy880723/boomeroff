# 原生员工排班升级设计与 TDD 计划

状态：2026-10-16，已完成 Round14 DTO 的 RED→GREEN 及独立 review P2 修复。主流程已对齐固定后台 ref `5a4cdf6da4bd3d61279bc78d40141b8c8bd52aeb` 的 schedule.ts 与入口 handler，并收到 Lovable 部署完成报告；原生 GUI 已检查整月、明确休息和无记录日期。下文保留候选与 TDD 历史，不声明真实员工或真机 E2E。

## 本轮边界

- 本轮 ownership 为本文、`tests/schedule-native-v2.test.cjs` 和 `miniprogram/pages/schedule/index.js/index.wxml/index.wxss/newmodel.js`。不修改共享层、preview、旧 tests、ERP、数据库或 Git。
- 保留 `/pages/schedule/index?month=YYYY-MM`、整月日历、前后月、月份选择、选日及“查看整月”。默认“我的”，不增加一级 Tab。
- 只读补齐明确休息、实际门店名称、获权门店同事及排班冲突提示；不增加排班、换班、调店、请假申请、AI 排班、清空或班次设置写入口。
- 不读取真实班表、员工资料或申请数据。所有测试均为本地合成 DTO；测试不得调用网络或真实 API。

## 真实来源与已知差异

审计基线：GO Lovable 固定 ref `8ca1721ba933baf0b5367c530e30093cb3720d2e`，不是下一轮后端发布状态。

- `src/components/me/SchedulePanel.tsx`：当前 `/me` 中的未来 30 天排班卡。旧卡片按 code 匹配班次、把部分缺记录/缺定义情况显示为休息，不照搬这些推断。
- `src/pages/MySchedule.tsx` 及 `src/components/me/MyScheduleList.tsx`、`ShopScheduleList.tsx`：有本人/门店设计源码，但固定版本 App 未注册 MySchedule 路由。不能把旧页签存在当成普通员工看全店的授权。
- `supabase/migrations/20260915004525_a2e368f7-0f99-4df9-be0c-9f5bcc0617a5.sql`：最新已审计 `list_shift_schedules_v1`；本人或有 `can_view_shop` 的授权店范围可读，指定店必须在授权集合内。日期闭区间最多 31 天，可跨月。
- RPC 将 `shift_schedules` 与 `staff_day_offs` 合并；休息为 `is_rest:true, source:'day_off'`。上班优先，同人同日展示去重，额外返回 `conflicts`；不能用展示行数推导所有安排都无冲突。
- RPC 权限为 HQ 或 `scoped_has_action('schedule.view_shop')` 或 `scoped_has_action('staff.read')`，本人读取不授予任何同事或跨店权限。读权限不等于 `schedule.write/shift.write/dayoff.write/holiday.write`。
- 升级前小程序 `schedule {month}` 查询本人上班表，返回 `schedules/shift_defs`，不返回休息和同事。升级已保留店+code 匹配及“无记录不代表休息或请假”的正确语义；旧 DTO 只兼容本人视图，不能启用门店。
- Flutter 已在 `apps/boomer_go_native/lib/features/home/data/home_content_repository.dart` 调用同一 RPC；不是要求修改 Flutter 或复制其展示范围规则。

## 已核验 BFF 契约：Round14

```text
api.action('schedule', { month: 'YYYY-MM', view: 'mine' | 'shop' })
-> {
  month: 'YYYY-MM',
  shop_id: UUID | null,
  view: 'mine' | 'shop',
  can_view_shop: boolean,
  rows: [{
    work_date, shop_id, shop_name, user_id, display_name,
    shift_code, shift_name, start_time, end_time,
    source, is_rest, is_self
  }],
  conflicts: [{ work_date, user_id, count }]
}
```

此合同最初为主流程授权候选，后已与 Round14 固定源码逐项对齐。错误码和权限沿用实际后台，不由页面发明。主流程已接 shared selected-shop guard 与 preview v2；本 worker 不修改这些文件。

1. 页面只传 month/view，不传员工 ID、权限或授权店集合；共享 API 已负责注入当前 `shop_id`、身份隔离及续租。本轮不修改共享 API。BFF 仍须验证调用者、fresh scope 和授权店，不能信任页面显示权限。
2. mine：BFF 只投影 `is_self:true`，且 `user_id` 是调用者；conflicts 也仅本人。可包含本人实际被安排到其他店的记录，不能按当前选店删掉本人调店安排。响应 `shop_id` 必须匹配所捕获的当前选店，不是 mine 每行必须归属的店。依主流程最新 shared guard，无选店时本页拒绝请求，不接受 null 店上下文回包。
3. shop：必须已选授权店、服务端 `can_view_shop === true`，精确筛到当前店；rows/conflicts 都必须对应这个店的有效投影。RPC 自带的跨店集合不能直接原样返给当前店视图。请求 `_shop_id` 收窄及 conflicts 生成由 BFF 负责。
4. 月初到月末按上海业务日期生成 RPC 日期范围。日期不同月、非法日期、返回 month/店上下文不匹配时拒绝该回包，不展示混入行；不静默截出看似正确的一部分。
5. `can_view_shop` 必须为 boolean；字符串 `"true"`、数字 1、null 或缺失不能解锁门店视图。无当前选店时显示先选店的错误，本人和门店都不请求，即使本地缓存权限为 true 也不自动选第一家店。
6. 严格核对 is_self/user_id 的一致性；mine 不接受同事行。shop 每条行的 shop_id 必须等于捕获的选店，不能靠标题或同事姓名判断所属店。
7. RPC 原行没有持久化排班 id，不假设存在 id；展示 key 使用日期、员工、门店和休息状态组合。不使用数组位置或 `String(undefined)` 当排班身份。
8. RPC 不含 note、休息原因、假期审批、节假日或更新时间。不得伪造这些字段；原有 note 仅在旧 DTO 兼容路径保留，新 DTO 不从别的员工表拼接。新 rows 无效时不能降级读取同时存在的旧 schedules 来绕过校验。

### 主流程需确认的有限问题

- 实际部署是否与上述顶层结构一致，以及服务端 view 的缺省/非法值处理。
- shop 无权限/无选店及刷新后权限撤回的准确错误合同；页面只基于实际错误展示，不猜 403 子码。
- mine conflicts 如何只投影本人；shop conflicts 如何保证在精确当前店内生成。
- 旧 `schedules/shift_defs` 和 note 是否保留兼容。新测试不伪装旧 DTO 为新 DTO；既有 employee 测试本轮不改、不删。

## 白灰红原生交互设计

采用现有 `.page/.card/.row/.muted/.error/.empty` 与 schedule 局部样式方向。灰底、白卡、正文 `#202125`、辅助字 `#737780`、红色 `#EB0029`；不新建管理工具视觉。本文是待主流程设计复核的文本规格，未声称新增 Figma 帧或截图验收。

1. 保留原生月历导航；增加“我的 / 本店同事”分段按钮，红字/浅红底表达选中，同时保留文字，不只用颜色。未获权限不显示门店按钮；已有门店视图重读时按钮明确 disabled，直到服务端再次确认 true。点击不产生任何写入。
2. mine 可跨实际工作店，卡片显示服务端 shift_name、时间、shop_name。同名班次按每行原 DTO 展示，不按当前店名称覆盖调店记录；姓名不从 session 或“第一家店”补全。
3. 明确休息显示“休息”，灰色标记，不显示“时间待同步”作为班次。没有记录的日期保持无标记，选中后显示“当天暂无已同步安排”，不能显示休息/请假/缺勤。
4. shop 标题“本店排班”，展示真实行中的店名，按日及班次分组，区分本人。休息条目不计入在岗人数。无选店提示先在现有门店入口选店，不在本页提供跨店授权或员工管理。
5. 日历保留整月和选中红框；本人上班可沿用红点，明确休息用灰字“休”，无数据无标记。门店同日既有上班又有休息使用分开的在岗/休息摘要，不能把整店标为休息。
6. 冲突提示用红色边框/文字“排班有冲突，请联系管理人员”，按日期和 count 展示；不提供解决按钮。不能仅展示去重后的一个班次就隐藏 conflicts。
7. 首次/切月/切视图加载显示骨架或加载卡，立即撤下旧 rows/conflicts。失败显示错误与重试，不把失败当空列表；无权限或店变化时立即清理旧同事资料。
8. 当前状态刷新失败也清除未经重新确认的 rows/conflicts，保留月份、视图与选日用于重试。这不是离线班表，不保留可误认最新的旧同事信息。只有合法空回包才能显示空态。
9. 小屏长店名/姓名/错误可换行，按钮触控区至少 88rpx，继续底部安全区。保留显式 preview 提示，不能把合成班表当真实安排。

## 候选页面状态约定

以下为当前页面实现状态，不属于后端 DTO；契约确认后可由主流程明确调整测试，不得单为绿灯放宽隔离断言。

- `data.view: 'mine'|'shop'`、`data.canViewShop:boolean`；默认 mine。`onViewChange(event.currentTarget.dataset.view)` 只接受这两个值，门店切换再次核验已确认权限和当前选店。
- 保留 `items/visibleItems/days/month/selectedDate`。行归一为 `{id,date,title,start,end,shop,shopId,userId,isRest,isSelf}`；title 用真实班次名，shop 用真实 shop_name。休息的 start/end 为空，isRest 为 true。
- 本人日历 `days[].status` 为 `scheduled/rest/unscheduled`；门店可为 mixed。不能以缺行标记 rest。空回包仍生成完整月历。
- `data.conflicts` 为投影后的 `{date,userId,count}`，`visibleConflicts` 跟随选日。count 必须为至少 2 的安全整数；非数值不转换、不补零，拒绝该不完整回包。不提供冲突解决操作。
- `groups` 为当前店日期/班次/休息分组；UI 姓名仅来自 RPC。休息卡独立无工时，不计入在岗人数。
- 不允许 route/view 或旧页面缓存提前解锁 canViewShop。私有权限凭据仅在合法新 DTO 严格 true 时绑定当次 scope/revision；伪造 `data.canViewShop` 不触发门店请求。
- 普通网络/权限拒绝失败先清空旧资料，保留 view/month/选日供重试；只有合法空回包明确返回 can_view_shop=false 时从 shop 回到 mine，并提示重新同步本人安排。后台通常直接拒绝时不假装已成功读到本人数据。

## 请求与生命周期

- 每次加载捕获身份 userId、当前 shop.id、scopeVersion、session.revision、month、view 和请求序号。只读复用现有 scope 模式，但不修改共享模块。
- 相同身份快速切月/切视图也使旧响应无效；换店或同账号重登 revision 也必须使旧成功、失败及 finally 无效。
- onShow 发现选店/身份变化时立即撤销旧 canViewShop 和同事视图，重新以 mine 确认权限，不能沿用上一店的真值。
- onHide 清空 rows/conflicts/权限，增加请求及 loading 代次，隐藏期间点击/重试零请求且不接受迟到 setData；同一身份回前台重新校验当前逻辑视图。没有新 onShow 的 revision 变化，也由页面请求 finally 使旧 loading 收尾失效，不改共享层。
- 选日/查看整月/切视图事件也先核对身份；新 revision 的迟到原生事件不能把旧班表重新画回。
- onUnload 后不 setData、不重试、不因旧 401 登出新会话。共享 definePage/run 的现有保护必须保留，不另建续租定时器。
- 无店时零请求并说明先选店。只在已确认 true 且店存在后首次切换 view=shop；已授权逻辑视图的失败重试保持 shop，由后端再次核验。客户端限制不替代服务端限制。

## TDD 顺序与验收

最初设计阶段只执行 RED；本轮主流程授权后已实现页面并转 GREEN。不修共享层、不降低旧测试预期、不把测试标 skip/todo 或预期失败来隐藏红灯。

1. 现有能力基线：完整月历、前后月/跨年、选日/查看整月。继续使用旧真实 DTO，确保测试 harness 能运行已有行为。
2. 新合同：真实 RPC 原 rows 的工作/休息、店名/调店、空数据、can_view_shop 严格布尔值、shop 精确选店；不对 mock 结果预先做页面实现应做的转换。
3. 失败与权限：无店、拒绝、撤权、无效 month/row 日期、同事混入 mine、异店混入 shop、失败重试；不发任何写 action。
4. 竞争与生命周期：切月、切视图、换店、同账号 revision、迟到成功/错误、卸载后响应。检查旧 finally 不结束新 loading。
5. 已授权 ownership 后按失败逐项实现；后端实际合同回来再对齐。主流程负责 shared/API/preview 集成。不得因为老测试仍用旧 DTO 就删除覆盖。
6. 已运行官方 WXML/WXSS 编译；待主流程 GUI 检查白灰红、长名称、安全区、空态、错误和无权限截图，之后单独做真实授权员工验收。本轮无真机、网络或生产验收。

运行命令（小程序根目录）：

```sh
node --check tests/schedule-native-v2.test.cjs
node --test --test-reporter=spec tests/schedule-native-v2.test.cjs
node --test tests/employee-pages.test.cjs
```

新文件被现有 `tests/*.test.cjs` 通配发现。前一阶段预期红灯已保留历史记录，本轮转绿后全套重新运行，不改 package 脚本或旧测试规避它。

## 前一阶段 RED 记录

- 已执行 `node --check tests/schedule-native-v2.test.cjs`，语法通过。
- 已执行新文件的独立测试：33 项，4 通过、29 预期失败，0 cancelled/skip/todo。通过的是 3 项旧页面基线与现有共享生命周期支持的卸载保护；红灯来自尚未实现的 view 请求、RPC rows 展示、严格权限状态/处理器、休息/冲突及新 DTO 下的竞争处理。
- 初跑发现测试辅助代码把缺失字段 JSON 化，以及未等待的缺失处理器 rejection；已仅修测试，重跑确认无 SyntaxError/TypeError/unhandledRejection 或测试结束后异步异常。没有修改生产代码来转绿。
- 单独执行既有 `tests/employee-pages.test.cjs`，74/74 通过。没有修改该文件，也没有运行或声称全套绿灯。
- 所有接口响应、身份和门店均为本地合成；无后端调用、真实员工/班表读取、生产写入或 Git。

## 本轮实现与验证

- 本轮先对齐候选 view 回执和主流程已落地的无选店 guard，再观察 44 项中 39 红；随后实现新 DTO、只读分段、明确休息、真实店名、冲突和旧 DTO 兼容。
- 追加身份变更后迟到原生事件 3 项，先红再绿；追加无新 onShow 时旧 revision 的 loading finally 成功/失败 2 项，先红再绿。生产修复仅在 schedule 自有文件。
- 当前新排班测试 49/49，既有员工页测试 74/74，组合 123/123；旧 employee 测试未修改、未降低预期。无 skip/todo/cancelled 或异步未处理异常。
- 本次全套测试快照 388/388，通过；主流程并行工作，总数只代表这次运行，不等同所有业务已验收。
- DevTools 官方 wcc/wcsc 向 stdout 编译本 schedule WXML/WXSS，均退出 0；没有输出构建文件。`npm run check` 17 路由通过。
- 已停止页面实现，待主流程提供 Round14 后台准确源码合同及 GUI 验收；没有真实员工 API 调用或 E2E 声明，没有修改共享 API/preview/旧测试或执行 Git。

## 独立 Review P2 收尾

- legacy identity：真正缺少 `user_id/is_self` 的旧 DTO 继续兼容；只要字段存在，user_id 必须严格等于调用者，is_self 必须严格为 true。显式他人、false、null、数字、字符串或提供 undefined 等冲突均整包拒绝，不部分显示合法行，也不把他人 note 改贴为本人信息。
- shop conflicts：每条冲突必须关联同日期、同 user_id 的已校验当前店 row；额外提供 shop_id 时必须等于当前店，缺省不补造该字段。不从 rows 数量重算冲突，测试明确允许一个去重展示行携带服务端 count=4。
- 新增 19 项身份/关联与兼容测试，先观察 13 个预期红灯，再仅修改 newmodel.js 两处校验转绿。排班测试 68/68，旧员工测试 74/74，完整测试快照 414/414；旧测试未修改、未降低预期，样式和模板未改。
- 已只读核对固定 ref `5a4cdf6da4bd3d61279bc78d40141b8c8bd52aeb`：`supabase/functions/go-mini-api/index.ts:97` 对 mine 传 RPC `_shop_id:null`，shop 传 selected shop；`schedule.ts` 以 uid 投影 mine，shop 要严格 true，休息的 shift/time 为 null，顶层回显 month/shop_id/view，同时保留本人 schedules/shift_defs。shop 服务端 conflicts 使用 visibleUsers 投影，客户端再收窄到同人同日合法 row；不扩大权限或请求字段。没有查询任何真实班表或调用业务接口。
- 主流程报告已实际截图：整月 31 日、明确休息无工时、选择 3 日时无记录不显示休息，布局无明显问题。本 worker 未重新操作 GUI，不把该报告等同真实员工 server E2E。
- 已完成本 scope 修复并停写；部署结果、真实员工/真机 E2E 仍待主流程独立确认。没有数据库、ERP、共享层、preview、Git 或生产写入操作。
