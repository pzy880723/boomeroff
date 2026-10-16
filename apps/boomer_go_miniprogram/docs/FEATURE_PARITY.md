# BOOMER GO 员工功能原生迁移盘点

盘点日期：2026-10-16（Asia/Shanghai）。下方原始矩阵记录约 01:58 的审计快照；最终集成状态以下列检查点为准。这不是发布说明或客户验收报告。

## 当前集成检查点

分类管理检查点：新增第23原生路由，沿用五Tab；本店SOP/QA分类的读取／新建／改名／数字排序／删除与原请求核对已接，独立shop.kb.category，不复用词条或AI写权限，共享分类只读。主流程800项、23路由和官方24WXML／25WXSS通过；实际GUI查看本店／共享列表及输入中文分类名和-2，预览零写入。后台R25/26固定813c12840f12a904fd07e6bc3a8bb08359b01090，0022将删除范围复查移到引用行锁之后；Lovable报告迁移应用，真实双会话／员工／手机未验。下方矩阵为早期历史快照，分类和SOP/QA的旧缺口不再代表当前源码，但其余角色管理与正式发布缺口仍保留。

门店AI草拟检查点：原生编辑页增加默认折叠的自然语言说明、完整候选和独立确认采用；采用仅改RAM，再单独保存，不创建分类。生成中可手改，任何编辑／hint变化让候选失效。主流程760项、22路由及官方23WXML／24WXSS通过；中文标题／说明／多行Markdown／标签已有实际GUI输入证据，补上上一检查点的输入缺口。新后台只读RAG经callerRLS、现有写权限和当前店门禁，R24固定e564fc300f51aa072e73da7c2d1b32203603a1c5修复RPC等待总超时及合法hint分层，独立复核闭合。Lovable报迁移／Edge部署；未调用真实AI验证质量，也未完成真实员工或手机验收。分类管理等剩余功能未被此项替代。

门店知识维护检查点：新增本店 SOP/QA 列表／阅读与编辑两原生路由，当前22路由、五Tab不变；服务端字面搜索、分类、共享只读、安全Markdown表格、保留原标签、明确保存／删除、CAS保稿与精确回执回读已接。主流程728项及官方23WXML／24WXSS编译通过；实际合成GUI查看了SOP列表／正文表格／编辑控件／共享只读／QA切换，输入与真实保存仍未验收。R22固定37e0466774995fac4ead86325d223b641a57dbe1源码与hash复核、独立审查通过，Lovable报0019迁移和Edge部署。店员无当天有效工作店会被拒绝，不新增跨店或写权限；AI草稿、分类管理和真实员工E2E未完成。下方旧矩阵的SOP/QA“无维护入口”为历史快照，不再是当前客户端状态。

连续练习检查点：新增第20原生路由，五Tab不变；本人最新300窗口→最旧5条待掌握→按user/shop/上海日本机已练排除，显式阅读／测试／下一条／跳过／退出。正式保存回执才计练过，不本地判分或设置每日限额，未通过也可记练过；普通favorite测试同样计入。主流程686项、官方编译和实际两条合成GUI通过。午夜未知原答卷恢复已修，旧stamp不计新日。后端新只读practice-library和深层投影修复已固定源码/hash核对，Lovable报部署；真实员工验收仍缺。

学习闭环检查点：本人收藏支持已加载范围的待掌握／已掌握筛选、阅读资格、单篇服务端测试、严格保存回执和提交后逐题回顾；历史按真实题源回看并可重新练习。主流程628/628、19路由及官方编译通过，实际合成GUI已走通并修掉重复时间。全量统计、服务端筛选、每日批量／断点任务及每次旧题恢复未完成。Round18持久化事实修复已固定源码读回、独立复核闭合，Lovable报已部署及合成SQL回滚通过；真实员工学习保存回读仍未验收。

登录／上传对齐检查点：已新增原生账号密码登录，保留验证码默认；手机号、用户名、邮箱均走既有 Auth 再 ERP 同步，不增加权限。主流程全套 587/587、19 路由和官方 20 WXML／21 WXSS 编译通过，mini-only 提交 `93334663d24dcc9da2a616fb2badb1ee58d87b89` 已非强推并 ls-remote 核对。上传已对齐固定 Round16/17 嵌套回执及严格 object_current，Lovable 报迁移／Edge 部署。独立复核确认两条后台 P2 闭合、客户端52项通过；主流程未运行特权 SQL 或真实员工上传。旧 quiz 结果重放 persisted 缺失已另交 Lovable 修复，尚未验收。此段取代下方“后台尚未结束”的历史状态，不代表正式发布。

Stage2 客户端检查点（约 05:18）：原生申请编辑器已新增原图选择、本地预览、固定意图上传／实际进度／只读核对及新证据关联参数，550/550 单测通过，仍为 19 路由、五 Tab。后台实现任务尚未结束，未完成固定源码／部署契约对齐；不能称此上传已可供员工使用。实际开发者工具只走查了明确标记的只读示例和禁用上传状态，没有上传生产对象。真实上传与其余角色管理仍未验收。

活动补充检查点：已新增原生活动根详情／脱敏申请列表和申请编辑两个路由，目前 19 路由、五 Tab。新入口替代旧“查看操作支持情况”；支持三种发布筛选、原证据引用保留／移除、显式确认／撤销、CAS 保稿和操作回执核对，不是审核／发券／社交发布。主流程 502/502 测试、官方 20 WXML／21 WXSS 编译及实际示例 GUI 检查通过。后台 0014 独立审查的两项 P2 已在固定 ref 171330bf 的 0015 修正并通过源码复核，Lovable 报已部署；不替代真实员工验收。Stage2 新图上传、申请审核、活动创建和其余角色管理仍未实现。下方历史矩阵的旧活动通用详情描述不再是当前客户端状态，详见 VERIFICATION.md 最新检查点。

后端契约已补至 GO Lovable Round 12（固定源码 `7a3081199b99cbee95c0ea72d2ca5ffa785ba9ea`，部署 fingerprint `654c25d0`），详见 GO_MINI_API_CONTRACT.md。下方原始矩阵保留排查证据，其中以下旧缺口已被修复，不能继续当作当前故障：

- 每日任务使用服务端真实 `items/pending_items`，工作台独立加载班次、任务和业绩；不要求 bootstrap 提供任务数组。
- 成长签到使用 `checkin-status/checkin-submit`，原生按钮、历史、连续天数及写后回读已接；明确不是考勤。
- 个人资料支持昵称和相册头像保存回读；ERP 姓名、手机号、门店和权限不可编辑。
- 知识搜索使用 `q`，SOP/QA 使用 `learning` 的 `type/category_id`；列表 snapshot、商品名称、时间和通过状态已归一化。
- 官方收藏与个人收藏删除分开调用；个人收藏包装、根层识物故事/卖点、图库和视频已解析；无真实商品 ID 不展示商品分享/收藏操作。
- 消息原生分为通知／会话／联系人；通知续页与精确已加载 ID 已读、同事私信及原文件附件已接。BOOMER 助手会话保留独立标识，不与同事私信混淆。
- 同事会话使用固定 snapshot_id 续页；过期保留列表、显式刷新，不拼接新旧集合。聊天支持前后游标、真实 read_at 回执、失败保稿及发送幂等；隐藏停轮询、旧身份回包丢弃。原文件上传/原生打开已接，40MB 为客户端及后端约束，不是已验证的真机上传能力。
- BOOMER 圈新增原生完整商品故事／卖点、稳定评论续页、显式点赞目标与幂等评论；服务端确认前不清草稿，不乐观捏造计数。开发示例只读，不会发送真实互动。
- 素材库和参考图片均支持续页、ID 去重与旧请求隔离；竖版参考图提交前逐张检查宽高。
- 当前预览的未知知识 ID 会报错，不再回退成第一篇无关文章；预览测验显式标记未保存真实成绩。
- ERP 只读龙虎榜接口已经部署腾讯云；真实订单缺员工销售归属，因此不伪造排名，也不关联考核。
- 本轮新增原生券码查询／核销页，路由总数为 17，仍为五个 Tab。门店模板入口改名“门店优惠券”，不再误叫个人券包；扫码只查券，显式确认后才提交，精确回执和详情回读分开。未决请求按账号／门店保留最小 App RAM，不因卸载或失权丢失，也不自动重发；首次明确事务失败不再永久占用操作槽位。
- 券后端 Round13 固定源码 `a4b3eb9f99aa13d0672a20df5e9be0718ddcea47` 已读取；Lovable 报告窄口 RPC 迁移已应用与 Edge 已部署，未增整表权限。活动／券的已有原生读路径也收窄到当前授权门店；旧 Web 特权路径的历史风险没有全局修复。
- 排班原生新增本人／获权同店视图、明确休息、真实工作门店和冲突提示；旧 DTO 明确他人身份会被拒绝。已读取并独立复核 Round14 固定源码 `5a4cdf6da4bd3d61279bc78d40141b8c8bd52aeb` 的 RPC 包装与契约；Lovable 回报 Edge 已部署、无需新迁移。实际原生截图使用标注示例，不是读取真实员工班表。
- 本轮主流程重新运行全部测试 414/414，17 路由静态检查与 18 WXML／19 WXSS 官方编译通过。此处计数取代此前 292 项快照，不代表真实业务或完整功能平替验收。

以上是源码、单测、后台部署报告及开发者工具证据，不是实际员工登录、双员工私信、真机相机/相册、真实考试或视频发布的端到端验收。尚缺活动申请审核／发布确认、券创建发放、角色管理和排班管理写入等，不能宣称全功能平替已完成。旧腾讯 Web 对新绑定路径附件的兼容适配仍未部署，因此新原生 DM 暂不可向员工正式开放；不能将后台迁移当作跨端发布已完成。最终验证见 VERIFICATION.md。

## 1. 结论与证据边界

- 目标是员工工作台原生迁移，不是客户 BOOMER OFF 小程序，也不是把员工 Web 放进 web-view。
- 当前小程序注册 17 个原生页面、5 个 Tab：工作台／学习／识物／消息／我的。二级模块大量复用 list/detail，菜单存在不等于对应操作完整。
- “我的”当前有 17 个二级菜单。个人资料、设置、签到、活动、券、社区深度交互、角色、营销管理仍有不同程度缺口，详见下表。
- 本轮盘点不访问生产数据库、不提交业务请求、不生成付费视频、不发送短信、不核销券、不修改用户数据。盘点仅写本文档；另有用户明确追加授权的素材分页、参考图前置校验与 source/cover 错误页面修复，不属于数据库变更。
- 所有模块均标记为**未真机验收**。真实员工登录 E2E 尚未运行，不能从静态源码、预览、单测、编译或部署推导出业务闭环已完成。
- 不给“迁移百分比”：完整 Web 路由、权限管理能力、Flutter 原生能力、预览示例不是同一个统计口径。

### 状态口径

| 标记 | 本文含义 |
| --- | --- |
| 实际已接（客户端） | 能定位到原生页面、事件处理器和明确 API 调用；不等于本轮已用真实员工执行成功。 |
| 只读 | 当前能请求/展示内容，但没有对应业务写入，或原功能本来只读。 |
| 缺少操作 | 原 Web/Flutter 存在的交互没有原生实现，或菜单/按钮存在但闭环缺失。 |
| 契约待核验 | 只能确认客户端调用名，未独立取得当前服务端请求/响应及授权证据；不猜测其已支持。 |
| 仅示例 | 来自显式开发预览适配器，不使用真实员工数据、不证明真实保存。 |
| 未真机验收 | 本文全部功能的共同状态；相机、相册、域名、权限、播放、真实身份及业务回读均需另验。 |
| 有意不恢复旧入口 | 用户批准的统一智能视频方向，不恢复独立 AI 图片/文案创作菜单。历史路由仍记录。 |

### 最新后端与共享层证据

1. 主流程提供的最新部署标识：Round 4 `6668b549`，source fingerprint `22146551`。主流程称已用 own/fresh ERP role 做保存 SQL 验证、保持媒体原格式后缀；**本文没有独立重跑该 SQL**。
2. 主流程已说明：`marketing-assets` 返回分页 items；`marketing-detail` 返回原始行，由共享 API 包装 `{item: row}`；`scan-history`、`knowledge-save {product_id}`、`conversation-send` 已部署；考试持久化已修复。这是主流程证据，不是本轮真实员工验收。
3. `recognition-save` 最新契约与上一轮的 `knowledge-save` 不同：前者创建识别商品/图片记录，后者只把既有商品加入用户知识库，不可互相替代。
4. 共享层当前已出现 `recognition-save` 本地照片转 data URL、稳定请求 ID 及响应归一化；不直接把临时文件路径发云端。页面契约不变：`{result,photos}`。
5. Round 4 识别结果写入 `ai_analysis` 的 `story/pitch/card/enriched` 位于根层，并带 `__go_mini` 来源。复核时 worker A 已新增 detail/content.js 根层与 legacy 解析；这只是显示接线，仍需真实历史/收藏包装数据分别验收。
6. 共享 API/session 当前有按需 `ensureFresh`：30 秒新鲜窗口，包含直接 `api.invoke` 的入口，不在页面另加续租定时器。真实登录、60 秒租约跨入口、身份撤销等 E2E 仍待验。
7. 本地仓库没有该版 `go-mini-api` 源码，但本轮已直接通过 Lovable **只读** `read_file` 取得并固定到 `e8d1e1849b930e0953880045273a349c04e491c4` 的 `supabase/functions/go-mini-api/index.ts`（688 行）；复读同 ref 内容一致，项目 config 与本地项目匹配。该源码 ref 与主流程给出的 Round 4 部署标识分开记录，不能自动断言二者完全同一部署。
8. 已从该源码确认 recognition-save、knowledge-save、knowledge-favorite、task-claim、objective-update、community-post、conversation-send、营销详情签名/错误码等契约；确认“代码中存在”不等于本轮已用员工身份验证写入成功。本轮没有调用数据库工具或修改 Lovable 项目。

## 2. 路径与 API 记法

源码根目录：`/Users/boomer/Documents/BOOMER GO Native`；小程序根目录：`/Users/boomer/Documents/BOOMER GO Native/apps/boomer_go_miniprogram`。

- `L(k)` = `/pages/list/index?kind=k`。
- `D(k,id)` = `/pages/detail/index?kind=k&id=id`；个人资料/设置允许省略 id。
- `Q(k,id)` = `/pages/quiz/index?kind=k&id=id`。
- `G(action,params)` = `api.action(action,params)` → `go-mini-api`；普通请求由共享层附加已验证门店。识物保存使用专门转码分支。
- `E(name,body)` = `api.invoke(name,body)`，现有 Edge Function，不新造服务名。
- `表/RPC/Storage` 标注的是旧 Web 或 Flutter 的实际数据来源，**不表示小程序已拥有可替代的写入 API**。
- “学习”Tab 的知识／培训／测验／记录由筛选器切换；不能假设给 `/pages/learn/index` 添加任意 query 就已实现对应深链。

主要证据入口：

- [Web 路由](</Users/boomer/Documents/BOOMER GO Native/src/App.tsx>)、[Web 我的](</Users/boomer/Documents/BOOMER GO Native/src/pages/Me.tsx>)、[营销主入口](</Users/boomer/Documents/BOOMER GO Native/src/pages/MyMarketing.tsx>)。
- [Flutter 分流与 Web 回退](</Users/boomer/Documents/BOOMER GO Native/apps/boomer_go_native/lib/app/boomer_shell.dart>)、[Flutter 我的](</Users/boomer/Documents/BOOMER GO Native/apps/boomer_go_native/lib/features/profile/presentation/profile_screen.dart>)。
- [小程序路由](</Users/boomer/Documents/BOOMER GO Native/apps/boomer_go_miniprogram/miniprogram/app.json>)、[共享 API](</Users/boomer/Documents/BOOMER GO Native/apps/boomer_go_miniprogram/miniprogram/shared/api.js>)、[预览适配器](</Users/boomer/Documents/BOOMER GO Native/apps/boomer_go_miniprogram/miniprogram/shared/preview.js>)。
- [小程序我的](</Users/boomer/Documents/BOOMER GO Native/apps/boomer_go_miniprogram/miniprogram/pages/mine/index.js>)、[列表映射](</Users/boomer/Documents/BOOMER GO Native/apps/boomer_go_miniprogram/miniprogram/pages/list/model.js>)、[详情操作](</Users/boomer/Documents/BOOMER GO Native/apps/boomer_go_miniprogram/miniprogram/pages/detail/index.js>)。
- 后端只读源：[GO Lovable 项目](https://lovable.dev/projects/bef32724-503e-467a-af03-2062176cf921)，上述固定 ref；没有将远端源码写入本地或重新部署。

### 已确认的 DTO / 入口不匹配（不是泛泛“待接 API”）

| 问题 | 已读源码证据与影响 |
| --- | --- |
| 每日任务并非 items 列表 | 后端 tasks 返回 `date/pending_exp/claimed_today/today_counts/note`，没有 items；当前共享层没有 tasks 转换，L(tasks) 会触发“接口未返回原生列表数据”。task-claim 本身存在，但从当前列表进入领取详情的链路未闭合。 |
| 签到记录错接 profile | profile 返回 profile/staff/experience/role/erp_scope，没有 items 或 user_check_ins 历史。L(check-ins) 在正式/preview 均不能作为签到历史证明。 |
| 知识搜索参数不一致 | 原生 learn/list 发 query，后端 knowledge 读 `p.q`；共享层未转换，故输入搜索不能证明服务端已过滤。 |
| SOP/QA 错用 knowledge | list/model 把 sop/qa 映射 knowledge；后端 knowledge 按 source 读取 product_knowledge/official_knowledge，并不按 kind 读 shop_kb_entries。正确后端读取能力在 learning 的 `type:'sop'` 或 `type:'qa'`；本文只记录，不越权修改 worker A。 |
| 培训类别参数不一致 | 后端 learning 读取 `type/category_id`，不是原生的 kind/category；其内容为 SOP+QA，不是另一个带完成进度的课程系统。 |
| 个人库 raw snapshot 未归一化 | my-library 返回 favorites 行与 snapshot、quiz_kind、passed；通用列表不读取 snapshot.name/cover_url，可能出现“未命名条目”。kind=my-library/favorites 也未让后端分成两个不同集合。 |
| 收藏写入不是全来源通用接口 | knowledge-favorite 只处理 official source_id。knowledge-save 才处理 products 的 recognition 收藏。把 product_knowledge 或识物收藏 ID 直接发给 knowledge-favorite 不能当作支持取消所有来源收藏。 |
| 部分只读详情字段不等价 | activity/voucher detail 是 raw name/description/template_terms 等；当前共享层只包 item，并不归一化 title/body/usage_rules，通用详情可能丢活动名/规则或出现错误字段标题。 |
| 历史时间/通过状态缺适配 | quiz-history 返回 last_attempt_at/passed_at，没有通用模型读取的 passed/created_at；conversation-list 的 last_message_at 也未进入通用 time。显示缺失不等于没有历史或未通过。 |
| 已追加业务卡解析，不等于所有包装均已覆盖 | 最新 detail 已转用 knowledge-detail 读取 history/favorite，并新增 businessContent(raw)。根层 ai_analysis 可解析；favorite 的 raw.source/快照嵌套、真实字段完整展示仍需分别回读验收。 |
| 未消费分页 | notifications、conversation-messages 读取链路并非都续页。后端默认 page_size=20；会话消息按时间升序分页，当前详情只读第一页，超过 20 条后不能据此证明最新回复可见。marketing-assets 素材库及参考选图的原生续页已于本轮补齐，不能据此消除其他列表缺口。 |
| 文本长度约束不同 | conversation-send 服务端 content 上限 2000 字，原生通用会话输入 maxlength=5000；超限仍将服务端拒绝，不是完整前置校验。 |
| mine 角色文字不对齐 | 后端 role 为 `{role,role_code}`，mine 读 role.name 或 staff.position，未消费 role_code；可能回退“员工”而非真实角色名。 |

上述为当前源码推断的静态契约风险，不是生产账号执行结果；正在进行的集成修复应在下一轮刷新本文。

## 3. 账号、工作台、排班与运营

以下每行共同附加“未真机验收”。

| 功能与现有来源 | 小程序路径 | 当前 API / 数据来源 | 实际状态与已知缺口 |
| --- | --- | --- | --- |
| 手机验证码登录；Flutter auth/session | `/pages/login/index` | `phone-login-send-otp`、`phone-login-verify-otp`、`erp-scope-sync`、必要时 `rpc:app_bootstrap_v1` | 实际已接（客户端）；续租由共享层处理。真实短信、租约、跨日、休息/未排班/停用账号 E2E 未验。 |
| Web 手机号/用户名/邮箱密码、忘记密码与 `/reset-password` | 原生登录页账号密码模式，默认仍为 OTP | 既有 phone-password-login／Auth password grant → GET user 精确验证 → 原 ERP 同步 | 密码登录客户端已接；原生忘记密码仅现有联系管理员说明，不虚构短信重置。注册／邀请／真实重置仍有缺口；未提交真实凭据验收。 |
| 邀请入职 `/invite/:code`；Web Invite | 无 | 小程序无邀请接受调用 | 缺少操作。不能把 OTP 登录视作已接邀请注册/绑定员工。 |
| 工作台 `/`；Home、Flutter HomeScreen | `/pages/workbench/index` | `G(dashboard,{})` + `api.sales({period:'today'})` | 实际已接（客户端）；姓名/门店/今日班次/任务学习入口。公告焦点、Web 完整首页 feed/活动联动不等价。DTO 必须实际返回 tasks/learning，缺字段不会证明待办已完成。 |
| 本人排班；Web Me 内 SchedulePanel，Flutter MyScheduleScreen | `/pages/schedule/index` | `G(schedule,{month})`，联结 `schedules/shift_defs` | 实际已接（客户端）＋只读。整月日历、前后月、按天/全月列表已写；不等于排班写入。 |
| 未来 30 天、每日同事在岗；Web SchedulePanel | 同上，部分对应 | Web `shift_schedules/shop_shifts/profiles/staff_profiles`；小程序未见同事分组专用消费 | 缺少同事姓名按班次分组、本人/门店视图等同等操作/呈现。不得将普通员工可见范围扩展为全店排班。 |
| 排班创建/修改、班次、休假配置；Portal | 无 | 旧 Web ScheduleManager、ShiftSettingsPanel；权限 `schedule.write/shift.write` | 缺少操作，未迁移管理页。月历只读不等于排班管理已迁移。 |
| 每日成长签到；Home、Me CheckInCard | 未见签到按钮；`L(check-ins)` 只有记录菜单 | 旧 Web `RPC perform_check_in`；当前记录菜单调用 `G(profile,{kind:'check-ins',...})` | 缺少签到写入；记录列表也需独立核对 DTO。不能称为考勤打卡闭环。 |
| 签到历史 `/me/check-ins`、连续天数 | `L(check-ins)` → `D(check-ins,id)` | Web `user_check_ins/user_experience`；小程序映射 `profile` | 已确认 DTO 缺口：profile 无 items，不返回签到历史。正式和 preview 均不能计为已迁移，不是“暂无签到”。 |
| 每日任务、待领取经验；TasksPanel/useTasks；Flutter StoreOperations | `L(tasks)` → `D(tasks,id)` | `G(tasks,...)`；详情按钮 `G(task-claim,{pending_id})` 或 `{task_key}` | 领取后端已确认复用 claim_pending_exp/claim_daily_task RPC；但 tasks 没有 items，当前正式列表链路存在断点。没有一键领全部和成长明细同等呈现，奖励成功仍待真实回读。 |
| 门店 OKR `/store/okr`、`/store/okr/:id`；Flutter operations | `L(objectives)` → `D(objectives,id)` | `G(objectives,...)`；编辑 `G(objective-update,{id,key_actions,key_results})` | 读取/写入代码及后端均存在，后端 RLS 检查 okr.write、0 行返回403；实际授权保存/刷新待验。服务端 key_actions 上限4000，页面5000，尚需对齐。旧 Web OkrDetail 本身只读。 |
| 等级、经验卡、识物/收藏/发帖计数；Web Me | `/pages/mine/index` | `G(profile,{})` 的 experience/profile/staff/role | 部分只读。现仅 total_exp 文本，没有 Web LevelCard、连续签到、三项计数的同等表现。缺字段显示“暂无数据”，不是 0。 |
| 今日营业额/订单及员工榜；Flutter sales/ERP | `/pages/sales/index`，`?kind=leaderboard` | ERP `/api/public/go/session` 映射门店，`daily-summary {date,location_id}`，`leaderboard {period,location_id}` | 实际已接（客户端）＋只读。仅在 complete/归属成立时排名。共享层明确拒绝月汇总；退款金额/客单价尚为 null。不能把销售额计入考试、考核或处罚。 |

## 4. 知识、培训、考试与识物

| 功能与现有来源 | 小程序路径 | 当前 API / 数据来源 | 实际状态与已知缺口 |
| --- | --- | --- | --- |
| `/library` 官方知识、类别、搜索 | `/pages/learn/index` 的知识筛选、产品/官方源切换 | `G(knowledge,{kind,source,query,category,page})` | 实际已接（客户端）＋只读，支持续页。Web 网格/列表、年代/产地/IP/排序等多维筛选没有全部迁移。 |
| `/library/:id` 官方知识详情 | `D(official,id)` / `D(knowledge,id)` | `G(knowledge-detail,{kind,id,view:'detail'})` | 正文/封面/字段阅读与测验入口已写。原 Web 一句话话术、分层卡片、语音朗读、底款图库及管理员编辑并非全部等价。 |
| 收藏/取消收藏 | 知识或官方详情；`D(favorites,id)` | `G(knowledge-favorite,{id,favorite})` | 后端已确认仅支持 official source_id；跨 product/recognition/favorite 包装来源仍有不匹配，不能把按钮当全来源收藏能力。 |
| `/my-library` 我的知识、已掌握归档、每日连续测验 | `L(my-library)`、`L(favorites)`、学习Tab及原生practice页 | `G(my-library,{page,page_size})`、`G(practice-library,{})`、`G(quiz-history,...)` | 两菜单为同一本人收藏；已加载掌握筛选及云刷新、最新300窗口连续每组最多5条已接。本机已练按账号/店/上海日隔离，正式回执后更新；不是服务器日配额、全量统计或跨设备／题目级断点。AI补知识卡仍缺；真实归档和本机恢复待验。 |
| 已有商品加入个人知识库 | 有 `_productId` 的通用详情 | `G(knowledge-save,{product_id})` | 客户端按钮已接，主流程称后端已部署。只收藏既有商品，不创建产品/上传图片，不可冒充识物保存。 |
| 培训、门店 SOP `/me/sop`；Flutter TrainingScreen | 学习 Tab 培训；`L(sop)` → `D(sop,id)` | `G(learning,{kind:'training',...})`；SOP 菜单当前错用 `knowledge`、详情 `knowledge-detail` | 已确认学习后端源为 shop_kb_entries 的 SOP/QA；菜单 action 与 type/category_id 参数待对齐。未见课程报名、课时/观看进度/证书 API，不能把 SOP 阅读称为 LMS 完整培训。 |
| 顾客问答 `/me/qa` | `L(qa)` → `D(qa,id)` | `G(knowledge,{kind:'qa',...})`、`knowledge-detail` | 只读。Web `shop.kb.write` 用户可 AI 草拟、新增、编辑、删除 SOP/QA；小程序没有对应写入和分类管理。 |
| 单条知识测验；Web QuizDialog、Flutter knowledge_test | `Q(official/knowledge/favorite,id)` | `G(quiz-start,{kind,id})`，`G(quiz-submit,{quiz_token,answers})` | 实际已接（客户端）。题干/四选项、翻题、交卷、结果与解析；正式模式要求服务端 `persisted:true`，失败重试保留原答卷。主流程称后端持久化已修复；真实账号回读尚未验。 |
| 测验历史、通关归档、换题 | `L(quiz-history)`、学习 Tab 记录 | `G(quiz-history,{page,page_size})`；item_kind/item_id阅读真实题源 | 历史是每条内容的最新结果，不是每次答卷档案。通过／作答时间及重新阅读练习已接；提交后回顾仅当前答卷。每日批量、管理员强制换题、历史旧题恢复仍缺；不预露答案或客户端评分。 |
| `/scan` 原生连续相机、多图/提示、识别结果 | `/pages/recognize/index` | `wx.createCameraContext().takePhoto`，相册 only 的 chooseMedia；`api.recognize(paths,hint)` → `recognize-product` | 实际已接（客户端）。快门立即加缩略图、最多 5 张、失败保留照片和提示、故事/材质/产地/工艺/卖点。微信权限、连续拍摄及真机性能未验。 |
| 新识别产品云保存 | 识物页“保存到云端识物记录” | 页面 `G(recognition-save,{result,photos})`；共享层转 `{result,image_data_urls,request_id}` | 已接客户端；Round 4 有主流程保存 SQL 证据。只有有效 `item.id` 才显示保存成功；真实登录上传、幂等超时重试、回读 `scan-history` 尚未 E2E。 |
| `/history` 商品历史与详情 | `L(history)` → `D(history,id)` | `G(scan-history,...)`；最新详情改读 `G(knowledge-detail,{kind:'history',id})` | 读取调用与根层 ai_analysis 业务卡解析已追加。旧 Web 字段编辑/删除、纠错、重新生成知识卡、精细筛选未迁移；真实保存结果/卡片需 E2E。 |
| 识物结果精修、实时会话联动；LiveStreamPanel | 识物页只有重识别/保存，部分详情可收藏/分享 | 旧 Web `enrich-recognition/enrich-knowledge-core`、products 更新、useRealtimeSession | 缺少原生精修对话、已有商品编辑/删除、实时当前商品会话同步。不能由“识别返回成功”推导这些也完成。 |
| Flutter 账号隔离的本机识别历史/笔记 | 无独立本机笔记页面 | Flutter `RecognitionHistory` + SharedPreferences；小程序目前云端 `scan-history` | 缺少本机笔记编辑/删除/离线历史同等能力。不能把云端记录等同于旧设备本机笔记迁移。 |

## 5. 消息、社交与 AI 会话

| 功能与现有来源 | 小程序路径 | 当前 API / 数据来源 | 实际状态与已知缺口 |
| --- | --- | --- | --- |
| `/notifications` 通知/资讯/未读；Flutter Messages | `/pages/messages/index` → `D(notifications,id)` | `G(notifications,{page,page_size})`、`G(notification-read,{id})` 或精确 `{ids}` | 客户端已接通知续页和已加载范围的精确批量回执；不调用旧 all:true。中文分类与时间保留；未接系统推送和全部 Web 编辑管理。 |
| 管理员 AI 编写通知、草稿、封面、发布 | 无原生编写页 | 旧 Web `compose-notification/generate-notification-banner`、notifications 插入 | 缺少操作。看通知和标已读不等于能够发布通知。 |
| `/messages/:peerId` 员工私聊、联系人、图片、已读与 realtime | 消息三筛选 → `/pages/chat/index?peer_id=...` | `dm-contacts/conversations/messages/send/read/status/attachment`，原文件 Storage 上传 | 客户端已接文字、图片/视频/文件、历史及已读；可见时轮询，不伪造在线状态。沿用原 RLS，普通员工无 staff.read 时联系人可为空，仅可回复已有入站会话。尚未真双员工／真机验收；腾讯旧 Web 附件适配尚未上线，不能宣称跨端完整可用。 |
| 我的 AI 会话列表/历史与新建 | 消息页 → `L(conversations)` → `D(conversation,id)` | `G(conversation-list,...)`、`G(conversation-messages,{conversation_id})`；`G(conversation-send,{content,conversation_id?})` | 读取/文字发送处理器已写；主流程称 send 可返回 `{conversation_id,reply}`。当前未见图片上传/发送、会话重命名/删除、usage；真实历史与新建回读待验。 |
| 随处 BOOMER 助手；Web SpiritDrawer/useSpiritChat，Flutter assistant | `/pages/assistant/index` | `api.assistant(messages,conversationId,onDelta)`，当前共享层仍调用 `spirit-chat` | 原生文字对话、重试、新对话、卸载/身份变化保护已写。当前网络层是接收完 SSE 后解析再回调，不是真网络逐字流；没有 Web 附图、历史入口、rename/delete/usage。 |
| `/community` 社区浏览与筛选 | `L(community)` → `/pages/community/index?id=...` | `community/detail/comments/like/comment` | 已接完整商品内容、显式点赞及幂等评论，评论按稳定游标续页；原生截图与模拟测试通过。帖子收藏、举报/审核、官方收录未迁移；未执行真实互动写入。 |
| 已保存商品分享社区 | 商品通用详情的分享按钮 | `G(community-post,{product_id})` | 后端已确认读可访问 products、按用户+product 查重、返回 post_id/created；客户端产品 ID 提取及真实回读仍待验。不是任意图文帖发布或评论能力。 |
| 社区内容官方收录/纠错审核 | 无 | 旧 Web Community、Portal CommunityModeration/CorrectionReviewPanel | 管理权限功能未迁移；不能从社区阅读页推导审核功能存在。 |

## 6. 活动与券：员工管理能力不可按客户读页面计为迁移

Web 活动页主要依赖 `voucher.manage`，券页依赖 `voucher.manage` 或 `voucher.redeem`；应区分普通员工、可管理人员和客户参与者。

| 功能与现有 Web 路由/组件 | 小程序路径 | 当前 API / 旧来源 | 实际状态与已知缺口 |
| --- | --- | --- | --- |
| `/me/activities` 活动列表 | `L(activities)` | `G(activities,...)` | 只读；菜单有入口，不代表创建/编辑/删除/活动开关已实现。 |
| `/me/activities/:id` 活动详情、报名/申请数据 | `D(activities,id)` | `G(activity-detail,{kind,id,view:'detail'})`；旧 Web `activities`、`RPC list_activity_applications` | 当前通用内容/字段展示；申请者详情、字段回答、私密截图读取、风险检查和审核工作流不等价。 |
| 活动创建/编辑/删除、文案润色、海报分享 | 无 | Web ActivityEditDialog/ActivityShareDialog；`polish-activity-description`、activities、activity-posters | 缺少操作；没有原生海报生成/保存/分享、活动表单设计/发布接口处理器。 |
| 到店/参与/发布截图确认、发券联动 | 活动详情仅有“查看操作支持情况” | Web PublishConfirmDialog 更新 activity_applications；截图 Storage | 缺少操作。当前明确提示未开放原生报名/签到写入；这不等于活动已经闭环。 |
| `/me/vouchers` 券列表与券详情 | `L(vouchers)` → `D(vouchers,id)` | `G(vouchers,...)`、`G(voucher-detail,{kind,id,view:'detail'})` | 只读。Web 是员工券管理/核销入口，不应把“我的券包”标题当作客户持券业务已经接通。 |
| 券新建/编辑/删除、领取人列表与手动发券 | 无 | Web VoucherEditDialog/VoucherDetailDialog；vouchers，`list_voucher_claims_with_pii`、`voucher-claim-create`、`delete_voucher_safe` | 缺少操作；不得未经权限审计迁移包含 PII 的列表。 |
| `/me/vouchers/redeem/:code` 扫码查券及确认核销 | 无原生核销页/扫码核销按钮 | Web `get_claim_for_redeem` + `voucher-redeem {code}` | 缺少操作。小程序券详情支持提示不等于已实现真实核销。 |
| `/me/vouchers/share/:claimId` 券海报、分享链接、下载 | 无 | Web voucher_claims/vouchers + Canvas 海报 | 缺少操作；不能用普通复制文案替代可核验的券分享。 |

## 7. 个人信息、两种“角色”与权限后台

| 功能与来源 | 小程序路径 | 当前 API / 来源 | 实际状态与缺口 |
| --- | --- | --- | --- |
| 头像、姓名、门店、角色只读；Web Me、Flutter Profile | `/pages/mine/index`、`D(profile)` | `G(profile,{})` + session.shop | 部分只读已接。详情仅姓名/门店；mine 有头像/经验文本。Web 邮箱、完整岗位/角色、统计/等级并未等价呈现。 |
| 昵称修改、相册头像、AI 头像；Web Me/AvatarPicker | 无原生编辑控件 | 原 Web profiles 更新、avatars Storage、`generate-avatar` | 缺少操作。Flutter 明确资料由 PC ERP 维护；是否保留 Web 自助编辑需另定权限，不能先假定。 |
| 员工账号角色、权限分配与停用；Portal RolePermissionManager | 只展示角色文字，无原生管理页 | session.permissions/ERP scope；旧 Web `role.manage` 管理页 | 缺少管理操作。mine 目前只识别 role 字符串或 `.name`/staff.position；后端若只回 role_code，不能保证显示具体角色名。所有人固定“员工”角标也不是角色验证证据。 |
| 总部在已授权门店间切换 | mine 的总部 picker | `session.selectShop(id)`；校验总部与已授权 shops | 客户端已接；不含普通员工任意选店。preview 固定非总部，未覆盖多店/权限变化验收。 |
| 设置、帮助、密码、安全设备/版本 | `D(settings)` | 当前仍是 `G(profile,{kind:'settings',...})` | 只读固定说明；没有密码、安全设备、通知偏好、版本更新等设置操作。返回我的可退出不等于设置页完成。 |
| 营销人物角色（非员工权限角色） | 没有原生管理入口 | Web CharacterPicker/CreateDialog/Dialog/IdentityVerifyDialog；marketing_characters、`generate-character-board`、认证相关 Edge | 缺少新增/编辑/删除、照片参考、人物板、真人认证/回跳等操作。视频自动角色不等于人物资产管理已迁移。 |
| 退出登录/退出预览 | `/pages/mine/index` 退出按钮 | 正式 `session.signOut()`；预览 `leavePreview()` | 客户端已接。退出预览仅切回正式适配器，不是注销全部既有真实凭据的同义操作；需分别验收。 |

### 权限后台边界

`/portal` 及别名 `/admin/users` 是现有权限后台，不是每个普通员工都拥有的功能。当前小程序没有对应管理页面；保留 PC/ERP 边界，但不得计为“已原生迁移”。已识别原 Portal 的 20 个面板：

| 分组 | 原有面板与权限 | 小程序状态 / API |
| --- | --- | --- |
| 人员 | users、audit（user.read）、roles（role.manage） | 未迁移；没有相应原生管理调用，详细写入契约未盘点，不猜测。 |
| 门店运营 | shops（shop.write）、schedule（schedule.write）、shifts（shift.write） | 未迁移管理操作；员工只读月历不替代这些面板。 |
| 知识 | sop、qa（shop.kb.write）；official、brand_kb（knowledge.official.write） | 未迁移内容维护/分类/品牌库/导入；知识阅读不替代内容管理。 |
| 社区与通知 | community（community.moderate）、corrections（correction.review）、notifications（role.manage） | 未迁移审核、纠错处理、通知管理写入。 |
| 活动审核 | activity_review、xhs_risk（voucher.manage） | 未迁移；员工活动只读页不替代审核。 |
| 系统 | ai、marketing_presets、deploy、sms_test、backup（settings.ai） | 未迁移，不在小程序暴露密钥/部署/备份写入；需要独立管理范围决策。 |

## 8. 营销视频、素材与分发

最新 Web `MyMarketing.tsx` 主入口只展示“BOOMER 帮你拍一条”、素材库和内容分发。小程序沿用统一智能视频，不把历史 AI 图片/文案路由重新塞回菜单。

| 功能与现有 Web/Flutter 来源 | 小程序路径 | 当前 API | 实际状态与已知缺口 |
| --- | --- | --- | --- |
| `/me/marketing` 当前统一创作入口 | `/pages/marketing/index` | 下列真实任务链 | 实际已接（客户端）；不是独立 AI 图片/文案创作入口。Web 今日/近 30 日产出统计、最近素材缩略图等未等价迁移。 |
| 分品类挑真实素材、准备脚本、后台恢复 | 同上“智能视频” | `E(surprise-script-job,{action,...})`，action 为 current/start/poll | 客户端已接。start 传 shop_id、exclude_asset_ids、photoreal、content_scope、replace_current:false；按服务端 job_id 恢复，不伪造本地任务完成。 |
| 分镜手改、连续口播、修改意见对话 | 同上脚本区 | surprise-script-job 的 save/save_draft/chat/apply_conversation/clear_conversation | 客户端已接。逐段对白同步连续口播/字幕，画面同步 visual_beats；应用对话、换参考图前先确认当前稿。脚本规则/事实核验仍由服务端决定。 |
| 真实参考图池、挑选/保存 | 同上参考图区 | `G(marketing-assets,{kind:'photo',page,page_size:20})` + `E(surprise-script-job,{action:'update_assets',job_id,asset_urls})` | 本轮补齐原生“加载更多”，从 page=0 起消费 items/page/has_more，按 ID 去重，失败保留列表/选择，隔离换店/切 tab/关闭选图后的迟到响应。已读取现有 update_assets：校验 job.shop_id + kind=photo，但不校验宽高；最多取 8 张手选图，另保留已有门头。客户端因此限制手选 8 张，提交前 getImageInfo 确认高>宽，信息失败明确阻止，不跳过；仅限已授权图库/已恢复参考图。不改生成提示词。未接相册新图上传、批量入库、自动打标/分类；仍未真机验收。 |
| 确认当前脚本并生成 15 秒视频 | 同上 | 先 save，后 `E(surprise-marketing-video,{script_job_id,shop_id,style,realism:'photoreal',model:'doubao-seedance-2-0-260128',resolution:'1080p',preview:false})` | 客户端已接真实队列。没有因点击/入队就宣称成片；本轮未提交付费任务。 |
| 当前视频状态、封面状态、历史导演任务恢复 | 同上任务区 | `poll-marketing-video {job_id}`；历史 director 用 `director-poll-job {job_id}` | 客户端已接读取；分段 ready_to_stitch 明确尚非完整成片。原 Web 的浏览器拼接/上传在小程序无对应实现；是否后端自动完成须具体任务验证。 |
| 结束当前脚本/视频任务 | 同上 | surprise-script-job 的 discard / dismiss | 客户端已接，不等于取消底层正在计费的生成队列，也不等于删除素材。不能混淆语义。 |
| `/me/marketing/library`；Flutter MarketingLibraryScreen | `/pages/marketing/index` 的素材库 | `G(marketing-assets,{page,page_size:20})` | 本轮补齐原生“加载更多”，消费真实 items/page/has_more，ID 去重；请求失败保留已加载条目并重试同页，换店/切 tab/离开页面或刷新后旧页不能覆盖新结果。门店筛选仍由共享 action 注入 shop_id、后端 pickShop/RLS 校验，不自行拼 user_id。Flutter/Web 的类型/本人筛选、标签/分类、批量删除等未全部迁移，分页真机/真实员工验收未跑。 |
| 原视频、图片、独立封面、已保存文案 | `/pages/asset/index?id=...` | `G(marketing-detail,{id})`；`api.saveMedia(url,kind)`，kind 为 video/image；`api.copy(text)` | 客户端已接；原生 video、独立 cover、复制/相册保存等待 native 成功。保存前重查详情/授权，不把预览缩图当原件。 |
| 原文件来源拒绝/缺失提示 | 同上；列表也消费 assetView | 后端 `row.source_error/cover_error`；本地 `mediaSource` | 已映射 provider_url_not_persisted→原文件尚未持久化；storage_not_accessible→当前账号无权读取；storage_missing→云端原文件缺失。Round7 再补 signed_url_expired→原文件签名过期、source_path_mismatch→原文件存储路径与授权素材不一致；原文件错误优先于泛化标签并阻断原件下载。cover_error=signed_url_expired 单独显示封面签名过期、屏蔽残留封面 URL 并仅阻止封面下载；未知错误均不可领取。白名单未放宽；合法同项目签名地址继续支持。 |
| 签名地址、临时 provider URL、封面/文案字段 | 同上 | raw row 包 item；Round7 主流程说明：优先本人短签，失败仅复用该授权行本项目精确相同 bucket/path 的未过期原件 URL；output_source 为 fresh_signed/stored_signed/stored_public；独立封面读取 meta.poster_url / meta.cover_url 并消费 cover_error；有效 meta.video_copy 优先，否则 meta.publish_copy | 服务端拒绝未持久化 provider 地址，不借 service_role 扩权。空 video_copy 不遮蔽真实 publish_copy，不编造文案。缺镜像修复、重做封面/文案等原生操作，签名到期/权限拒绝及合法旧 URL 复用仍需真实身份验收。 |
| `/me/marketing/dispatch/workbench` 视频分发 | 素材详情“提交门店发布任务” | `dispatch-account-list {shop_id}`；`dispatch-job-create {kind:'video',asset_id,account_ids,title,body,tags,per_platform:{},schedule_at:null}` | 客户端已接选择已有在线账号/手改发布文案/入队；无账号扫码绑定、图文多图分发、每平台独立配置或定时输入。入队不代表平台发布成功。 |
| `/me/marketing/dispatch/job/:jobId` 发布任务状态/重试/取消 | `/pages/asset/index?jobId=...` 或当前素材发布后 | `dispatch-job-status {job_id}`、`dispatch-job-retry {target_id}`、`dispatch-job-cancel {job_id}` | 客户端已接按目标状态、失败重试、未派单取消；任务页确有实现，但尚无完整历史列表入口恢复全部 jobId。 |
| `/me/marketing/dispatch` 工作台/历史/账号 | 无完整原生分发中心 | Web social_publish_jobs/social_publish_targets；dispatch-account-list/account-revoke；扫码 dispatch-account-login | 缺少历史分页、账号扫码登录/失效续绑/撤销、发布全局管理。不能用素材详情一个发布按钮算全分发中心。 |
| `/me/marketing/video` 旧高级创作：时长、模型、分镜静帧、人物选择 | 无单独高级原生页 | Web generate-marketing-video-script、storyboard-marketing-video、render-marketing-video 等 | 缺少同等高级配置；现原生只走已批准统一 15 秒流程，不自动复制全部旧入口。 |
| `/me/marketing/photo`、`/me/marketing/copy` 旧生成页 | 无独立创作入口 | 原 Web ai-image-chat、generate-marketing-copy | 有意不恢复旧入口。素材库查看历史图片/文案，不代表新增这两类独立创作工具。 |

发布旧别名 `/me/marketing/social-accounts`、`/me/marketing/publish-history`、`/me/marketing/publish/:assetId` 仍在 Web App.tsx 路由注册；前两者未有完整小程序等价页，第三者部分对应素材详情的视频发布操作。

## 9. 路由完整性与 Flutter 限制

- 上述矩阵覆盖 App.tsx 中的员工主路由、独立员工页、营销路由与别名，以及 `/portal`、邀请、密码重置、真人认证回调。`/verify-callback` 依赖人物认证，目前无原生等价闭环。
- `/u`、`/u/result`、`/u/community`、`/u/about`、`/u/activity/:shareToken`、`/u/claim/:shareToken`、`/u/c/:short`、`/q` 为公开客户路由，不属于员工小程序的已迁移证据；它们与员工分享/发券的接口依赖仍需联动验收，但本轮不替换客户入口。
- MySchedule.tsx、MyKb.tsx 等文件存在不代表已经在 App.tsx 独立挂载路由；排班实际员工入口还包括 Me 内嵌 SchedulePanel。Flutter 的 `/me/schedule`、`/me/quiz` 是应用内部路由分流键，不应误报为现有 Web 同路径已注册。
- Flutter boomer_shell 对知识、排班、SOP、考试、运营、素材领取等已有原生 screen/repository；对部分顾客问答、考勤等仍可回退 `_openWebWorkbench`，并依赖 EMPLOYEE_WEB_URL、浏览器确认/重新登录。**这种 Web 回退不能作为小程序原生实现证据**。
- Flutter 营销原生主体是素材库/原件领取，并非完整视频生成和分发后台；小程序新增真实任务接线也不自动证明其所有旧 Web 能力齐备。

## 10. “我的”17 个菜单逐项已知缺口

下表列出当前 mine 源码的全部二级菜单，不以菜单数量当作交付数量。

| 菜单 | 实际目标 | 正式能力与缺口 | preview 的实际表现/缺口 |
| --- | --- | --- | --- |
| 我的排班 | `/pages/schedule/index` | 原生月历只读；无排班编辑/同事分组同等能力 | 只有今天一条示例班次，其他月份不代表真实无排班。 |
| 每日任务 | `L(tasks)` | 后端 tasks 不返回 items，正式列表未闭合；领取 RPC 存在，无一键领全部 | 一条合成任务；详情可读，领取落到 unavailable，不会真实加经验。 |
| 门店 OKR | `L(objectives)` | 列表/详情、编辑后端均已读证实；权限回读/4000字上限待对齐 | 合成 OKR/KR；保存不支持，不能展示为已完成。 |
| 签到记录 | `L(check-ins)` | 已确认 profile 非历史列表，无签到写入操作 | profile 没有 items，触发列表格式错误，不是真正空历史。 |
| 我的知识库 | `L(my-library)` | 读取；没有完整学习归档/日任务/批量管理 | articles 复用样例，不代表真实收藏关系。 |
| 我的收藏 | `L(favorites)` | 与 my-library 共 action；取消收藏/分类筛选等依真实契约 | 与“我的知识库”复用同一示例集合，不能证明两者过滤差异。 |
| 识物记录 | `L(history)` | scan-history 已接读取；无完整编辑/删除/本机笔记迁移 | 固定空列表，不能验云保存后出现记录。 |
| 知识测验记录 | `L(quiz-history)` | 读取已接，真实评分保存回读尚未 E2E | 固定空列表；预览交卷也不会生成真实历史。 |
| 门店 SOP | `L(sop)` | 列表错接 knowledge，需对齐 learning/type；无新增/编辑/删除/AI维护 | knowledge 分支复用通用文章，掩盖正式列表源不匹配。 |
| 门店问答 | `L(qa)` | 列表错接 knowledge，需对齐 learning/type；无 QA维护 | 同样复用通用文章，掩盖真实 QA 语义差异。 |
| BOOMER 圈 | `L(community)` | 浏览；部分已保存商品分享处理器；无完整点赞/评论/审核 | 有一条合成帖子；分享写入不支持；详情按 id 回退可读，不证明评论等能力。 |
| 我的活动 | `L(activities)` | 列表/详情只读；无员工活动管理/申请审核/确认发布闭环 | 有示例列表，但没有 activity-detail 分支，详情会 unavailable。 |
| 我的券包 | `L(vouchers)` | 券信息只读；无创建/发放/扫码核销/分享海报 | 固定空；voucher-detail、核销与分享均不可验。 |
| 营销工作台 | `/pages/marketing/index` | 视频主链已接，图库上传/续页/账号管理/历史等欠缺 | 所有 invoke 都 unavailable，因此不能预览真实脚本/任务链；marketing-assets 固定空。 |
| AI 助手 | `/pages/assistant/index` | 原生文字会话；网络目前缓冲解析，附图/会话管理缺失 | assistant unavailable，不是可交互的示例 AI 对话。 |
| 个人资料 | `D(profile)` | 只读姓名/门店；无昵称头像等编辑 | 仅合成人员/门店；没有真实账号字段、岗位/权限组合。 |
| 设置与帮助 | `D(settings)` | profile + 固定帮助文案；没有设置写入 | 同样只读合成资料/固定说明，不能验真实设置。 |

mine 顶部另有：头像/姓名/岗位/门店/total_exp 文本，总部授权店切换，以及退出。preview 固定 isHeadquarters:false、shops 单店、经验为示例值，**没有**总部 picker、多角色/岗位、停用/休息/无排班、权限到期/撤销等覆盖。退出预览能检验本地路由与 flag 切换，不能检验真实账号注销和后端令牌失效。

## 11. preview 全局已知缺口

1. 仅 develop 版允许显式 opt-in，带清晰示例标签；不会在真实 API 失败后偷偷用样例填充。示例正常显示不能替代真实登录和授权验证。
2. 工作台是合成班次、示例任务和文章，不包含完整真实 dashboard DTO；业绩明确 complete:false，不编造销售金额和排名。
3. knowledge/learning 复用同一 articles，不按 training/sop/qa/source 提供完整语义差异；knowledge-detail 对未知 id 回退第一篇示例，故不能验证“错误 ID / 已删除 / 无权访问”的详情行为。
4. quiz-start/submit 是开发题与开发回执，persisted:false；可验证 UI，不是考试评分/成绩入库证据。quiz-history 固定空。
5. 通知已读仅修改适配器内存，不是 notification_reads 落库/跨端同步；并无完整真实通知分类、同事私聊或 realtime。
6. tasks/objectives/community/activities 提供少量示例；task-claim、objective-update、community-post、knowledge-favorite、knowledge-save 等写入未模拟成功，而是 unavailable。
7. vouchers/scan-history/marketing-assets/conversation-list/conversation-messages 固定空；activity-detail/voucher-detail/marketing-detail/conversation-send 没有可验证的示例分支。
8. recognize 返回显式“识物结果示例”，不是根据照片推理；recognition-save 不支持，不能用预览证明图片上传/SQL 幂等保存。
9. assistant、全部 invoke、saveMedia 均 unavailable，不能验 SSE、视频生成、封面、发布账号、付费队列、系统相册成功；copy 是原生剪贴板操作，成功仅证明复制，不证明云端内容真实性。
10. 不覆盖真机相机逐拍行为、相册授权/拒绝、媒体域名和重定向、签名到期、provider 持久化、原格式/原文件校验、长视频下载与系统相册限制。

## 12. 待核验清单与收尾要求

| 优先项 | 必须得到的证据；本轮不执行 |
| --- | --- |
| 真员工登录与续租 | OTP + ERP own fresh scope，跨 30 秒/60 秒入口继续可用；停用/换店/撤销权限后旧响应不可展示。 |
| 识物保存闭环 | 多角度识别 → 原格式图片写入 → 稳定 request_id 重试 → 相同产品 id → scan-history/个人知识显示；核对 ai_analysis 根字段及来源。 |
| 图库来源错误 | 原三项及 Round7 新增 signed_url_expired/source_path_mismatch、封面过期/未知码兜底单测已补；仍需真实账号/签名到期、拒绝与原件领取验收，不放宽白名单。 |
| 通用内容 DTO | 修复已证实 tasks/check-ins 缺 items、SOP/QA 源、q/type/category_id 参数、snapshot/时间/通过状态等归一化；复核刚新增业务卡解析。 |
| 原生写入按钮 | knowledge-favorite 只限 official，task-claim 复用 RPC，objective-update 受 okr.write，community-post 有 product 查重：契约已读，仍需合法/非法账号真实保存回读。 |
| 社交与消息 | 明确 AI 会话与员工 direct_messages 的产品边界，补缺而不混算。 |
| 活动/券 | 分清管理、报名、发布截图、审核、发券、核销与分享，逐项补齐权限和原生操作，而非一个只读列表计为全迁移。 |
| 智能视频 | 已确认脚本/参考图与实际提交一致；后台恢复正确；完整成片/封面/文案可领取；发布目标有真实平台回执。禁止凭排队或片段完成报发布成功。 |
| 素材管理 | 素材库和参考选图客户端续页已补；真实多页/换店验收待跑。筛选、上传、标签/删除等差异保留；签名续期与失效原因需真实身份核验，不为了对齐旧菜单恢复独立 AI 图片/文案入口。 |
| 资料与角色 | 明确哪些信息由 ERP 维护、哪些允许本人改；员工权限角色与营销人物角色分别验收。 |
| 交付口径 | 原生路由/编译、示例可看、单测通过、后端部署、SQL 通过、真员工 E2E、真机验收、正式发布分别记录，不能互相代替。 |

本组 recognize/assistant/marketing/asset 页面 review 的本轮验证：`node --test tests/creative-pages.test.cjs tests/native-contract.test.cjs` **68/68 通过**（66 个本组测试、2 个 native-contract），覆盖分页真实 DTO/失败保留/迟到隔离/保留共享 401 处理、参考图竖图前置校验、Round7 source/cover 错误映射与下载阻断及既有回归。Round7 部署号 `1ad1c8fd`、source `81a0215b` 来自主流程通知，本轮没有部署或数据库操作。该记录不覆盖其他员工页，不代表整份矩阵、真实登录 E2E 或真机验收完成。
