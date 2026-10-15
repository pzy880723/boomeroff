# 原生活动根详情与申请列表

状态：2026-10-16，归属页面已完成本地 TDD 与官方单页编译，停止修改等待主流程 GUI 与 Stage1 后台实际合同对齐。此文仅属于活动根详情/脱敏申请列表，不是 A 的 ACTIVITY_NATIVE_PLAN，不实现申请 editor、发布确认、上传、审批、领券或核销。

## Ownership 与已确认方向

- 仅 `miniprogram/pages/activity/index.js/index.json/index.wxml/index.wxss/model.js`、`tests/activity-pages.test.cjs`、本文。shared/app/list/detail/preview/其他测试/Git 不修改。
- 原生路由 `/pages/activity/index?id=<activityuuid>`，入口与注册由主流程负责。已只读获取同文件 `SXY4nF6NWwrsw3jxZOIaDU` 的 Figma `10:2` 设计上下文和参考图，沿用已批准白灰红员工卡片方向；没有新增 Figma 或把截图当页面素材。
- 灰底 #F5F6F8、白卡、正文 #202125、辅助字 #737780、品牌红 #EB0029，32rpx 正文、44px/88rpx 按钮，长中文换行、底部安全区，不做管理后台样式或 H5。

## 只读合同

1. `activity-detail {id,shop_id}`：共享 API 包 `{item:{shop_id,...}}`；须核对 id 与捕获的当前店一致后才显示。准确 baseline 为 ACT_LIST 加 form_fields/min_followers/share_token，无 content_html。页面只保留实际展示字段，不缓存 share_token、原始回包或表单答案。
2. `activity-capabilities {shop_id}`：`{shop_id,can_manage,can_confirm_publish,can_upload_evidence:false}`。三个能力字段严格校验；只有合法 can_manage===true 才可读申请。can_confirm_publish 不在根页面触发写入，paused 状态不撤销管理读取能力。
3. `activity-applications {shop_id,activity_id,publish_confirmed?,limit:20,cursor?}`：回执 `{shop_id,activity_id,publish_confirmed:null|boolean,items,next_cursor:string|null,has_more:boolean,order:'desc'}`。全部不传过滤字段，对应回执 null；待确认 false；已确认 true。报名 status 与发布确认互相独立，未确认不等于未审核。
4. 申请条目只投影 id/activity_id/activity_name/status/created_at/applicant_name_masked/applicant_phone_tail/publish_confirmed/publish_confirmed_at/has_publish_url/publish_screenshot_count。不保存 raw 姓名/电话/form_data/answers，也不从 raw 字段回退。尾号只展示四位数字，截图数不补零，布尔值不按 truthiness 推断。
5. 只对本次有效已载申请 ID 导航：`/pages/application/index?id=<id>&activityId=<activityId>`；A 单独拥有 editor。不能凭 dataset、旧缓存或伪造客户端 canManage 绕过已确认 capabilities。

## 布局与状态

- 顶部基本详情白卡：状态、平台、名称、完整 description、真实时间及实际配置字段。cover/poster 仅实际 HTTPS 图片，非跳转链接；不显示分享 token，不执行 HTML。
- 基础信息与 capabilities 并行加载、独立错误与重试。普通 staff 可看基础信息；明确 capfalse 显示“当前没有申请管理权限”，不请求申请列表。cap失败不能遮住已加载基本信息。
- 管理区：全部/待确认/已确认三个原生分段；标题“申请与发布确认”，持续说明“发布确认与报名审核是不同状态”。卡片仅脱敏信息、审核与发布两个独立原生行、服务端时间、是否有链接及截图数，按钮“查看申请详情”。不显示可执行确认或上传按钮。
- 申请首屏有加载/错误/真实空态；续页只显示局部错误，保留已载条目、has_more 和原 cursor，按钮重试同 cursor。新 filter 先清旧申请和 cursor，不能拼接旧筛选续页。按持久化 ID 去重，不按当前条数伪造总数或判断末页。
- 显式 preview 持续标记“只读管理流程示例，非真实员工权限或申请记录”，只消费主流程提供的 fixture，不在页面制造成功，也不把管理示例当正式 staff 被授予权限。

## 生命周期与隔离

- 无登录/当前授权店或 id 非 UUID 时零业务请求。选店只取 verified session，不接受 URL/shop/user 参数授权。
- 请求捕获 user/shop/scopeVersion/session.revision、activityId、visible epoch、各通道请求序号；申请额外绑定 filter/cursor。success/error/finally 都要匹配，旧401不登出新用户。
- basic 匹配且 capabilities 合法 true 后才开始申请首屏；cap 与 basic 同时完成也只加载一次。onLoad/紧接 onShow 去重，后续 onShow fresh 重读。
- hide 清申请、私有已载 ID 集与 capabilities，invalidate 所有请求；隐藏期间零新请求、不应用回包。unload 后不 setData。换身份/店/revision 清旧基本信息和敏感资料，再读取新范围。
- 当前401交 shared run；当前403/404不保留申请资料。普通分页网络/DTO失败保留已载条目和原 cursor，错误仍是错误，不伪装空态或成功。

## TDD 与后续验收

先用真实 page + shared lifecycle 的 VM harness 观察 RED，只 mock wx/app API；再在本 ownership 内 GREEN。覆盖普通staff/cap严格布尔值、无店/非法UUID、id店错配、独立重试、脱敏、三筛选、真cursor分页去重/失败保留、旧页/过滤/店/身份/隐藏/卸载回包、合法已载导航、显式只读预览。旧414测试不降低预期，执行全套时记录实际并行快照。

```sh
node --test tests/activity-pages.test.cjs
node --test tests/*.test.cjs
npm run check
```

主流程注册入口、shared/preview 以及 Stage1 契约并作 GUI 检查。官方编译、模拟单测、GUI 与真实员工 E2E 分开记录；不执行真实活动操作或读取私人申请/文件。

## 本轮验证记录

- 首轮 32 项页面测试先观察页面缺失 RED，再实现转 GREEN。收尾新增独立 loading 与两行状态检查，实际观察 3 RED，再修复至 focused **38/38**；未削弱其他测试。
- `wcc-exec/wcc miniprogram/pages/activity/index.wxml` 与 `wcc-exec/wcsc miniprogram/pages/activity/index.wxss` 均退出 0，编译输出只在内存检查，不生成发布产物。
- `npm run check` 通过，当前共享配置检查 17 路由；不能由此声称本页面已注册。归属页面另行完成上面的官方编译。
- 全套执行期间主流程与 A 正在添加集成 RED：当次 **478 项，453 通过、25 失败**。22 项属于尚不存在的 `pages/application/index`；3 项分别为 app.json 活动/申请路由、list 活动详情新路径、旧 detail 的活动入口待集成。只读定位确认，未修改这些文件或测试，不声称全套已绿。
- 本 worker 未核验 Stage1 已部署源码，未操作真实活动或读取私人申请/文件；页面 GUI 与真实员工权限、真数据分页 E2E 尚待主流程验收。

### 主流程恢复后的补强复核

- 页面实现未改动，仅本测试与本文更新；新增 7 项已有行为回归，未声称这些新增断言经历行为缺失 RED。focused **45/45**：补齐未登录零请求、当前申请401清资料并走 shared 登录处理、403/404撤权清资料后需重新取 capabilities、换店/同账号 revision 后旧申请 success/401 不影响新页，以及直接消费真实 shared preview UUID/DTO 的三筛选与已载导航。
- 再次官方 wcc/wcsc 单页编译均退出 0。`npm run check` 通过，主流程当前已注册 **19** 原生路由；native-contract **6/6**，list/legacy-detail 两项新活动入口测试 **2/2**。
- 最新完整快照 **490 项，488 通过、2 失败**；两项均定位于 `tests/application-pages.test.cjs` 的旧图片回调身份隔离和权限刷新期间编辑控件 disabled 回归，属于 A 的 editor ownership，未修改或降低预期。先前 478 项快照为当时并行集成状态，不代表当前仍缺路由。
- 本根页可交主流程做只读 GUI 验收。仍待 Stage1 固定实际合同、真实员工权限及真实分页验收；preview 管理示例不证明普通 staff 有管理权限，不证明保存或发布成功。
