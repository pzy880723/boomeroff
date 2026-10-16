# 初版验证记录

日期：2026-10-16，Asia/Shanghai。交付对象为 BOOMER GO 员工微信原生小程序初版，非公开发布、非完整功能平替验收。

## 最新检查点：OKR 原始内容和精确详情

- 修复详情只从第一页找 ID 的断点：按已部署的零起点分页合同读取，严格核对门店、页号、page_size、has_more 与目标 ID；隐藏、卸载、身份或 revision 改变后停止后续读取，不捏造详情接口。
- 关键结果保留原 JSON、未知字段和未修改的部分进度；兼容固定 Web 的 name/text/title、字符串、done/completed 与数值 progress 读取语义。显式切换才修改对应完成字段，数值完成更新为 100；只改行动不重写 KR。关键行动与后端统一为 4000 字符，运行时超限保留草稿不截断。
- 保存是单飞，发送前冻结实际变更字段；更新返回字段与独立精确详情回读均一致后才显示已核对。未知保存不自动重发，刷新先确认弃稿。首次 onLoad/onShow 共享在途读取；保存期间隐藏再返回，旧请求结束后只读当前有效上下文，不采用旧回执、不自动重发写入。
- TDD 首轮 24 RED 后修复；刷新补测 2 RED、父流程发现的首显重复读取/隐藏恢复/数值与布尔完成同步补测 6 RED 后修复。专用 OKR 最终 56/56。父流程纠正旧测试夹具为真实分页和更新 DTO，并补开发预览合同（1 RED 后通过）及结构化 OKR 不显示“缺少正文”占位（1 RED 后通过）。最后独立全套 1017/1017，0失败/跳过/取消；23原生路由静态检查通过。官方编译 24 WXML、25 WXSS 退出0、stderr为空。
- 独立审查者运行 OKR 56项及相关合跑147项，未确认新增 P1/P2。固定 Web 读取采用 truthy legacy done/completed，保留该兼容性，不借本次修复重写旧数据判定。接口没有 CAS、分页快照或稳定请求回执，仍不能保证多人并发不覆盖，不把字段回包称为这些保证。
- 主流程在实际 DevTools 沿“我的 → 门店 OKR → 示例详情”打开内容，查看完整目标、KR、原行动、4000限制说明与禁用预览保存，随后滚动检查编辑区。evidence/native-objective-detail/editor及phone裁切为真实工具截图，没有生成式美化；全部是明确标注的合成只读预览，没有真实员工写入。
- 排班管理另有两张可编辑 Figma 状态，已实际渲染核对并修正按钮高度；不是已实现的原生管理页。R28 固定后台源码已读取并复算哈希，原Edge8项在Node转译隔离环境复跑通过；独立 SQL 审查发现3个P2，已直接交给Lovable继续R29，入口尚未接通。详见 SCHEDULE_MANAGER_STAGE1_AUDIT.md。真实员工、专用 AppID、真机和发布缺口仍保留。

## 最新检查点：无今日门店的本人月历

- 主流程最终新跑960/960，失败／跳过／取消均0；23路由检查及官方24WXML／25WXSS编译通过，stderr为空。自有75＋主流程真实transport组合3＝78项；独立78及相关238通过，未见新增确认P1/P2。
- 已复现无今日选店时mine在零请求阶段被拒绝的P2。仅该路径改用既有caller-token NULL-shop只读RPC；选店mine和同事BFF不变。auth:user核对uid、读前后严格fresh及每阶段revision保护；本人投影、损坏行报错、闰月范围、旧回包/401隔离已测。不猜home、不显示同事能力，不新增写权或服务端修改。
- 首轮工作者64RED／5已有GREEN，后补损坏记录4RED→GREEN；主流程3个实际createTransport集成测试均先RED再GREEN，覆盖Bearer/GET/POST/固定NULL参数、两次fresh、管理者原始回包剔除同事、后置失鲜和身份不符。唯一旧测试更新是此前错误要求无店本人读取失败的断言；同事禁用仍保留。
- 实际DevTools查看本人整月、明确休息、无标记说明和切换下个月，截图native-personal-schedule-month/next-month及phone为真实工具/确定裁切。GUI仍是有店的显式合成预览；无店生产路径由源码与模拟测试验证，未冒充真实员工或无店现场验收。
- 对既有RPC的匿名POST仅用公开client key，返回401/42501、无排班行；没有查询真实员工、发送OTP或写排班。这只证明匿名被拒，不证明本人真实查询或RPC线上字节一致。
- 排班管理设计另存SCHEDULE_MANAGEMENT_DESIGN.md，单日维护、班次/禁排日、原子换班、周清空及AI排班完整目标未删减；尚无生产管理页面/后台契约。R27主店方案仍待人工决策，未批准部署。真实员工、AppID与真机验收继续保留。

## 最新检查点：工作台班次与门店绑定

- 主流程新跑882/882，失败／跳过／取消均0；23路由静态检查和官方24WXML／25WXSS编译通过，stderr为空。工作者26RED→GREEN及后补1RED→GREEN，最终新增28项；独立28／组合141及未落盘边界mock10通过，未见新增确认P1/P2。
- 班次使用本人当天唯一排班行及已授权的真实门店名称，不再把顶部浏览店名贴到班次上。班次定义按精确店、显式全局、唯一旧无shop_id定义依次匹配；重复/缺失/无效时间只提示，不猜时间或落入弱匹配。
- 服务器明确的当日休息、无记录、冲突、日期/人员/店范围异常分开；不由无排班推断休息。今日任务与业绩仍独立加载，没有新增请求或修改授权、ERP业绩范围和后台。
- 实际DevTools重新编译，工作台班次卡显示示例门店及10:00–18:00，五Tab和合成数据标签保留。native-workbench-shift-shop及phone为真实工具截图/确定裁切；休息/冲突/跨店场景是自动化模拟证据，未冒充真实员工现场。
- R27内容门店仅完成只读源码审计和直接Lovable方案沟通，未批准或部署。当前staff_profiles.shop_id自助写策略不足以证明主店权威，ERP镜像也未见canonical home；拒绝客户端猜店。详见CONTENT_CONTEXT_AUDIT.md，原生完整迁移仍未完成。

## 最新检查点：显式重考与过期答卷

- 主流程最终新跑854/854，失败／跳过／取消均0；23原生路由检查通过。官方24WXML／25WXSS编译退出0、stderr为空；最终补丁只改JS与测试，未更改已编译模板。
- 已确认通过或未通过的答卷可显式确认“再练一次”；只有首次精确410/quiz_expired、此前没有未知提交才允许显式重新开始。新凭据和完整题目通过验证后原子替换旧状态，不force重建题库，不清除历史成绩。
- 网络／500／畸形／未保存回执后继续保留原token和答案；随后410也不视为原事务永不提交的证明。固定0018使用事务now()，本轮未修改后台SQL或声称解决其全部并发时序。
- 首批35项RED后实现；追加初始请求竞态和401边界也先复现再修。最终重考53项、preview15项；主流程preview新增1项RED→GREEN，独立最终53／学习组合222通过、未见新增P1/P2。独立复核发现新题错误绕过401策略的P2，现仅在原上下文仍有效时进入共享run silent处理；旧身份／revision/requestRevision不误注销。
- 连续复练只接受同helper、stamp、当前条目/index和已完成状态；不重复计数、不自动下一条。隐藏、卸载、modal晚回调、旧新卷响应不能覆盖当前答卷。
- 实际DevTools合成走查：连续练习→阅读→B答对→结果→再练一次→明确确认→新卷已答0→A答错→回清单。清单仍为本机今日已练1条、本轮1/2，未翻倍也未推进。截图native-quiz-retake-result/confirm/new/failed-result/count为本地ignored真实工具证据，result-phone为确定裁切，无AI美化。
- Preview每次start使用独立示例token，评分按原token绑定来源、persisted始终false；未写真实成绩、员工资料或调用真实AI。未知交卷遇真正401仍沿共享退出策略，卸载清除页内token；不承诺跨重新登录／关闭微信恢复答卷。
- 当前完整功能对照统一为CURRENT_FEATURE_PARITY.md；休息/未排班的内容门店上下文、排班写管理等仍未完成。专用AppID、真实员工、真机与发布仍是独立验收项。

## 最新检查点：原生 SOP/QA 分类管理

- 主流程停写后新跑800/800，零失败／跳过／取消；23原生路由检查，官方24WXML／25WXSS编译退出0、stderr为空，五Tab不变。原独立AI交付zip解压至无父环境目录，760项和22路由也独立通过；该旧包不包含本轮分类代码，新包另行生成验证。
- 单个原生二级页读取当前店／共享分类，独立现有shop.kb.category能力控制本店新增／名称／数字排序／删除，不复用词条／AI权限。共享只读，不新增角色或跨店权，不自动分类创建或拖拽重编号。
- 首批页面21失败、两个后补边界失败后修正；分类页初26项。独立复现成功回执恢复后loading不结束P2，两条测试RED→GREEN修复；首次明确中止4个测试及跨资源conflict锁1个测试RED→GREEN，详情500补强直接GREEN、不冒称新RED。最终分类36项，另4个共享／preview测试，主流程共享3RED→GREEN、35组合项通过。
- UUID/CAS／本人店type资源RAM隔离、六对首发中止保稿／完整重读门禁、跨刷新隐藏保留版本冲突、历史unknown原payload/status/精确回读已测。身份变化和旧callback不会解锁或覆盖新页。没有真员工保存或删除；unknown不保证关闭微信后恢复。
- 实际DevTools走查查看分类入口、本店与共享卡片、inline editor，真实键入中文本地草稿“开店核对（合成草稿）”和-2，取消后查看共享只读。预览保存／删除disabled，无write/status请求。native-kb-category-list/input/shared及phone裁切为本地ignored证据。五Tab也重新截图，仍为标注合成数据，不是业务验收。
- 后台R25固定b3def8e98b2202e22cd379481374783014e5745c，R26固定813c12840f12a904fd07e6bc3a8bb08359b01090，get_project均finished；kbcat/index/0021/handler tests固定读回一致、0022及SQLtest哈希复算匹配。独立审查确认删除先检查后锁的P2，R26改为先锁所有引用、后续语句复查再删。权限／回执／CAS不变。
- Lovable报告0021/0022迁移已应用、R25 Edge部署，R26不重部署未变化Edge；SQL68强制回滚、Deno110（另function quiz_test）和Vitest5通过。独立R25实际handler7组及离线6断言通过，但旧race须R26修复；最终复核另记。主流程未执行特权SQL、真实双会话、业务写入、付费AI或手机验收，不把报告冒充本机运行。
- 最终独立复核：分类36／新增API4／真实handler转译7、三种删除竞态离线模型及两条原loading复现均通过，未见新增确认P1/P2。0022只有后置范围复查，未改ACL/RLS；原默认service-role EXECUTE不是本轮新增授权。主流程四个新action匿名请求均401/unauthorized，仅证明可达和拒绝，不证明真实员工操作或线上bundle字节一致。
- 专用员工小程序AppID／主体类目／合法域名隐私配置／真实员工和手机验收仍缺，未发布体验版或替换既有iOS／客户小程序。其余角色管理／业务迁移缺口继续记录，不能把分类管理完成称为全功能迁移完成。
- 本轮feature fcd4537671162739a62fe986cdcda5b8d0e88a13仅19个Mini路径，已非强推并ls-remote回读同SHA；正常index为空，Flutter分支未切换。feature压缩包独立解压后800项／23路由再次通过且不读取父环境。交付说明提交只改文档，不改变上述代码验证，最终重打包字节摘要在交付回报中另记。

## 最新检查点：原生 SOP/QA AI 草拟

- 主流程停写后新跑760/760，零失败／跳过／取消；22路由检查、官方23WXML／24WXSS编译退出0且stderr为空。五Tab和原手工保存／权限边界不变。
- AI面板默认折叠，标题作为主题、说明最多2000码点；显式生成完整候选，再独立modal采用，仅改RAM，之后仍需保存确认／回执／回读。分类仅现有ID或NULL、不自动创建；保留原okr-highlight并展示，模型不得新增该业务标记。生成不锁手改，但编辑／hint变化使候选过期；scope/revision/epoch/resource/base/edit/hint/seq及确认回调隔离已测。
- AI首批24RED→GREEN，source_id按实际text/null及安全错误修复后28项；原CRUD38保留。主流程共享层3RED→GREEN25项，生成前续租追加2RED→GREEN26项，避免以半程租约开始付费生成。独立客户端91及续租26通过，未见新增确认P1/P2；未知／失权不自动重发或显示provider原文。
- 实际DevTools查看折叠／展开面板、预览禁用生成，并键入中文标题、23字自然语言hint、多行Markdown正文及标签。native-kb-ai-collapsed／ai-open／ai-input／manual-input和phone裁切在evidence，补齐上轮输入缺口。候选生成／采用竞态仍为VM测试，没有真实AI、知识保存或删除；预览不请求付费生成或制造成功候选。
- R23固定ad2e6e81新增INVOKER上下文RPC，保留caller RLS、当前店／共享copy和现有写权限。Lovable报0020已应用、SQL23组强制回滚及Edge部署；主流程未重跑SQL。旧kb_documents仍按档案店RLS，调店／HQ可无本店参考，不fallback service；旧特权入口／match_kb未全局修复。
- 独立复现R23三个RPC等待不受总deadline约束的P2；R24最终e564fc300f51aa072e73da7c2d1b32203603a1c5已get_project确认finished、读回/hash。统一handler45s覆盖3RPC和provider headers/body，合法writing_request与不可信reference_data分层。独立20ms原复现约22/24/22ms退出，provider0/1/2；实际TS转译16组＋补充25组通过，0 unhandled rejection／自建timer残留，P2闭合。
- Lovable报R24 Deno104＋quiz Vitest5及重新部署，无新SQL或SQL重跑；这不是主流程真实AI/特权SQL执行。主流程在线kb-draft匿名请求401，只证明可达及拒绝。源码hash不等于线上bundle；handler有界退出不保证底层忽略abort的请求／计费取消，也不是从点击起45秒的整条网络保证。真实模型质量／员工和手机验收仍缺。
- 本轮feature840afd5e50d6bab4f6324a645694d6806d73733d仅15个小程序路径，非强推并ls-remote读回同SHA。正常index未暂存，Flutter分支未切换；ignored截图和本机配置不进源码。文档交付提交不改变上述代码验证结果，仍未发布微信。

## 最新检查点：本店 SOP 与问答维护

- 主流程在停写后新跑728/728，零失败／跳过／取消；22原生路由检查通过。官方wcc编译23WXML、wcsc编译24WXSS，退出0且stderr为空。五Tab保持工作台／学习／识物／消息／我的，无H5替代。
- 新增store-kb列表／阅读和store-kb-edit页；工作台、学习及我的SOP/QA入口指向原生维护流程。现有shop.kb.write权限决定新增／编辑／删除，共享NULL条目永远只读。不写分类、不允许改门店／type／creator／排序，完整保留Markdown源文和标签（含okr-highlight），正文可空，超长明确阻止而非截断。
- 首批页面24失败和后补边界4失败经修复；主流程API两项、路由／preview两项均观察RED→GREEN。实际GUI发现两页28处wx:if缺动态绑定导致错误框／加载／阅读同时出现：已加RED回归并修正，实际截图复查关闭。官方编译本身不能发现这种语义错误。
- 最终页面focused38项、全部728项通过；独立复核38项及后台真实源码纯mock11+25项通过，未发现新增可确认P1/P2。独立复核未重跑全套／官方编译／SQL或GUI。
- 仅从未未知的首次请求允许精确七对明确事务失败释放槽位并保稿，必须重新读取；version_conflict内部锁跨刷新／隐藏保留，仅明确adopt且成功读回才清除。历史unknown、request_id_conflict、401/403、500、transport以及成功回执后的回读失败不释放，不换key、不自动重发。原请求保存在user/shop/type/resource隔离App RAM，不声称关闭微信后恢复。
- 实际DevTools沿工作台SOP入口查看列表、本店正文／粗体／列表／表格、原生新增编辑控件和禁用保存／删除、共享只读以及QA切换。截图native-kb-list／read／editor／shared-readonly／qa-list在evidence，均为明确标注合成数据；phone是确定性裁切。编辑输入值未取得实际截图，不冒充GUI输入验收；正文编辑、草稿保留及写状态由VM测试覆盖，仍需真实手机验收。没有真实SOP新增、修改、删除或AI调用。
- 后台固定ref37e0466774995fac4ead86325d223b641a57dbe1经get_project确认finished，实际读回kb.ts／index.ts／0019并复算UTF8哈希，与报告和独立复核一致。读RPC为INVOKER保留RLS，write/status为窄SECDEF，fresh／当前工作店／已有动作权限全检；分类FOR SHARE、同actor/request锁、receipt-before-CAS及删除后状态恢复已源审。Lovable报告0019已应用、Edge已部署、Deno87+quiz5与SQL60强制回滚通过；主流程未执行特权SQL、真并发或下载线上bundle，不将报告冒充独立运行。
- 主流程向在线kb-write发无身份请求返回401 unauthorized，仅证明可达与匿名拒绝。店员当天无有效工作店时新接口403，未加单店兜底或跨店权限。AI草稿、分类管理、其他角色功能及真实账号／设备验收仍是剩余迁移工作，未发布微信。
- 本轮feature提交8f852817e40cbc05fe824ffa09670a432a6f5e10仅26个小程序路径，已非强推至codex/go-mini-workbench并ls-remote读回同SHA；正常index为空，当前Flutter分支未切换。截图保持本地ignored，不把开发工具画面或本机配置放入源码分支。交付文档后续提交不改变本轮代码验证结果。

## 最新检查点：连续练习

- 主流程在页面停写及午夜恢复修复后新跑686/686，零失败／跳过／取消；20原生路由检查、官方21WXML／22WXSS编译通过，stderr为空。五Tab未变。
- 新原生连续练习页从本人最新最多300收藏中取最旧五条未掌握，再剔除本机当日已练。普通favorite及连续模式均只在有效保存回执后记练过，不因通过与否改变计数，不本地提升掌握状态；不设置服务器日限额。
- 本机存储按user/shop/上海日隔离，仅version/date/收藏ID，不存题目、答案、token、成绩或快照。revision／身份／店／跨日清RAM队列；storage失败显示内存保留提醒，不声称持久保存。Preview完全RAM-only。
- Helper19项、app/route及preview均观察红绿。页面首批25RED／2已过，最终33项；独立review175项通过并复现午夜未知重试P2。已用3项新增红绿修复：首次仍验队列，原未知答卷在同身份/revision可重试同token/answers；旧stamp不计新日／不next。实际session自己的跨日失效规则未放宽。
- 实际DevTools用两条明确合成待练内容完成总览→阅读第一条→作答→明确未保存的结果→显式第二条阅读→返回清单→确认跳过→确认退出。计数始终保留一条，跳过不计完成且下一轮仍可开始。截图native-practice-overview／read-first／first-result／read-second／resumed／skipped／exited在evidence；phone为确定性裁切，无生成式美化。五条整组和跳转栈边界为源码/单测证据，GUI只走了两条。
- 后端最终a8e36ee6已finished并读回/hash；主流程实际函数复现/修复回放确认深层答案不再透传，浅层摘要不变。Lovable报Deno73与Edge部署，无新DB/RLS/权限。独立R20实际源码mock10项及截断边界、R21实际sanitizer/handler45组合＋4边界通过，两项深层P2已闭合。客户端午夜补丁独立复现确认闭合、相关178项通过、未见新增P1/P2；这些不冒充独立Deno73／全套686或真机执行。
- 新后台practice-library无身份请求401，只证明可达与匿名拒绝；没有真实员工测验、持久进度或云归档E2E，也没有Mini公开发布。下一缺口当前店SOP/QA维护已单独源码审计，见OPERATIONS_KB_AUDIT.md，尚未新增写权限或CRUD。
- 连续练习feature提交d3b995a1a38bbf65a160956b43e942ccdf15b34f仅27个小程序路径，已非强推到codex/go-mini-workbench并ls-remote读回同SHA。当前Flutter分支不变、正常index为空、独立index与工作区小程序源一致。没有把其他原生修改带入，亦未解决旧main/Lovable分叉或将小程序称为正式发布。

## 最新检查点：原生学习闭环

- 主流程在页面停写、预览对齐和 GUI 小修后重新运行完整 Node 测试：628/628，零失败／跳过／取消；19 路由检查、官方20 WXML／21 WXSS编译通过，stderr为空。此前587／625等计数保留为历史检查点。
- 本人收藏增加全部／待掌握／已掌握，计数和搜索明确仅覆盖已加载条目，筛选空页不吞续页。历史按真实 item_kind/item_id 打开源内容，分开显示通过时间与最近作答，不以结果行ID猜内容。
- 原生阅读按真实 quiz_available／quiz_kind 显示测验入口。交卷保持原 token／答卷单飞重试，校验题数、整数分值范围及提供的绑定；服务端passed不由客户端推算，persisted严格true才说保存。逐题回顾只使用提交后返回的correct／correct_answers，不虚构解析或历史旧题。
- 学习工作者先观察首批22 RED／3已通过，再实现；新增边界分别红绿。主流程补两项preview红绿及一项历史时间重复模板红绿。合成收藏UUID与结果UUID独立，提交始终persisted:false、不改变示例归档，旧文章ID不变、未知详情仍报错。
- 实际官方DevTools已走“学习→测验→待掌握→阅读→单篇练习→选择B→交卷→明确未保存真实记录的结果和提交后回顾→测验记录→原收藏阅读”。截图 native-learning-library／pending／read／result／history-final／history-source，均在evidence。发现历史footer重复时间，修复后AX与截图确认只显示一次。截图未作生成式美化；phone文件为同一截图的确定性裁切。
- 这些是合成示例界面，不是一次真实员工考试，也不证明云端归档更新。全量收藏统计、服务端掌握筛选、批量日测任务和每次历史旧题恢复仍未完成。
- Round18 独立固定源码复核确认 persisted 重放P2闭合、未见新增P1/P2；内存归一化测试及20种畸形值组合通过。未独立执行SQL或双会话并发，不以Lovable运行代替独立证据。
- 原生学习15文件独立主审查未见确认新增P1/P2，独立学习38＋员工75合计113通过；主流程后补footer／preview小差异复核51通过。复核者未独立执行GUI／全量／官方编译；上述628与实际截图为主流程执行。

## 最新检查点：原生登录与上传契约对齐

- 主流程完整 Node 回归 587/587，零失败／跳过／取消；19 原生路由检查通过。官方 wcc 编译 20 WXML、wcsc 编译 21 WXSS，退出 0 且 stderr 为空。此为本轮新运行结果，不以旧计数代替。
- 原生登录保持验证码默认，新增现有手机号／用户名／邮箱密码登录。候选 token 先 GET Auth user 验证精确 subject，再安装凭据、执行原 ERP 同步；不增加员工或跨店权限。原始密码不落盘，页面隐藏／退出／模式切换清理秘密，scope 失败仅续同步。共享 14 项和页面 18 项测试覆盖；独立只读审查未确认新增 P1/P2。
- 实际 DevTools 已查看 OTP／密码页、忘记密码原生说明、空账号本地校验；截图为 native-login-otp、native-login-password-current、native-login-forgot-help、native-login-local-validation，均在 evidence。未提交真实密码或短信。密码掩码有源码和 VM 断言，未得到含输入圆点的实际截图，因此不冒充该项 GUI 验收。误命名的帮助弹窗截图已改名。
- 上传适配器已对齐真实 Round16 嵌套 commit、可省略 status 字段、独立 preview、核验时间及冻结指纹。新增源验证错误对仅允许释放从未未知的首次明确事务失败；恢复的未知请求始终保留原 key。
- Round17 最终 ref d6c94826445617aa5d41a8f053e107244d0d159d 已 get_project 核对；主流程读取 evidence.ts／0017 并独立复算 SHA256，详见契约。Lovable 报 0017 应用、Edge 部署及 Deno59／SQL11 回滚组通过；这不是主流程独立 SQL 执行或部署包字节验证。
- 客户端严格 object_current：false 归一 object_changed 且无 eligible receipt；缺失／非布尔拒绝；保留原路径、不自动重传。新增用例先 RED 后 GREEN。独立复核 helper22＋上传页30，共 52/52，无确认新增 P1/P2，未验证真实 Storage。
- 源码审计另确认旧 quiz 重放缺失 persisted 可导致假保存。Round18 最终 ref 42984c7ae027a2086ecd93fc05bfdcf35122d1fa 已 get_project 核对完成；主流程读取0018／quiz.ts／index并独立复算三文件哈希。新增内部 nullable result_persisted 保存首次事务事实，历史未知不回填；Edge仅严格true。Lovable报迁移／Edge部署、PGlite红绿、新SQL5和R15／R17各11组在线合成事务全部强制回滚；主流程未执行特权SQL。实际无身份 quiz-submit／upload-status均401，只证明可达与拒绝匿名；原生仍以严格true确认保存。
- Round17独立固定源码复核确认两条P2均闭合、未见新增P1/P2；11内存测试和额外16个畸形flag不签名场景通过。原AGENTS仅增加本次边界说明，未被当作执行指令。数据库与真实Storage未由复核者执行。
- 专用员工 AppID、真实员工／真机、实际上传、学习保存回读及其余功能平替仍有缺口；未公开发布小程序，也未替换 iOS App。

## 最新检查点：原生活动和申请

- 主流程在最终页面停写后独立运行全套 Node 测试：502/502，0 失败／跳过／取消。活动根页 45 项，申请编辑页 39 项；旧员工页 75 项，保留既有业务预期并增加原生活动路由。
- 静态检查为 19 个原生路由，五个 Tab 不变；官方 wcc 全部 20 WXML、wcsc 全部 21 WXSS 编译退出 0、stderr 为空。无 web-view／H5 跳转或服务端密钥标记。
- 新增活动根页与脱敏申请列表，权限与基本信息独立加载；获权才读申请，三种发布筛选不混同审核状态，游标／身份／隐藏生命周期隔离。申请编辑包含严格活动关系、原路径保留、显式移除引用、备注／链接校验、CAS 保稿、精确回执和六字段回读。尚不提供新图上传。
- 主流程实际在官方 DevTools 沿“我的 → 我的活动 → 活动详情”打开原生页面，查看脱敏申请，切换“已确认”空状态及“待确认”结果，再进入申请详情。原生输入示例草稿后点击不可用图片，实际看到错误提示、草稿和原引用仍在；查看只读答案／手机号尾号和禁用保存按钮。所有记录均为明确标注的合成示例，未读真实申请或执行真实写入。
- 实际截图在 `evidence/` 与 `/private/tmp/go-mini-native-evidence-20261016/`：native-activity-detail、native-activity-applications、native-activity-confirmed-empty、native-application-detail、native-application-draft-error、native-application-readonly。phone 后缀为同一截图的确定性裁切，未用生成式美化。
- 独立审查发现并已在客户端修复重复证据路径导致回读永不一致的问题：新意图去重保序；历史 App RAM payload／UUID 不改写，对账仅采用规范化视图。复核者独立跑 36 项申请测试确认该 P2 闭合；路径顺序变化仍拒绝。后台 0015 源码核验后启用六组精确首次 abort 错误对：只释放从未未知的首次明确失败，保留草稿并撤销提交授权；重新读取后才能新建意图。历史未知操作不因此释放，永不自动重发或换 key。
- 后台 Round15 固定 ref `2c1566fecb7a78c02924cb3f349a2340d84f9a5d` 已读取并复算源码哈希。Lovable 报迁移 0014 已应用、Edge 部署成功、7 Deno／9 SQL 回滚组及既有回归通过。主流程未重跑特权 SQL，源码哈希不是线上 bundle 字节验收。
- 独立后台源码审查确认两个 P2：活动重绑后的首次提交／旧回执缺少活动上下文绑定；声明 reserved／未知类型字段时可能穿透内部 JSON。已直接协调 Lovable 增加 0015 迁移、必填 activity_id、删除旧签名及 SQL／Edge 双层安全投影。主流程读取固定 ref `171330bf87cfa05885edb89d28ce2cc6a8b3b5ec` 并独立复算三个源码哈希，均匹配报告；独立复核确认两项 P2 闭合，未确认新增 P1/P2。原投影输入已由复核者在内存执行实际 Edge 函数复跑，不再返回内部对象；没有独立重跑数据库 SQL。
- Lovable 报告 0015 已应用／Edge 部署成功、新签名权限核验、Deno 8／SQL 合成回滚 11 组及既有回归通过。主流程以公开项目 key、不带员工身份请求新 activity-capabilities，收到 401 unauthorized；这只证明匿名拒绝与网络可达，不证明真实员工可用、迁移或线上 bundle 字节相等。SQL 没有先对旧库跑红，不能将本轮描述成 SQL 全过程 TDD。
- 最终独立客户端复核另跑申请页 39/39，通过；确认六组精确错误对、首次明确失败恢复及历史 unknown 单调保留均闭合，未发现新增 P1/P2。该独立结果不冒充复核者重跑全量或官方编译。
- 活动补丁 `38dd2c662364da8ae5672c92647a31397fda675f` 仅 30 个小程序路径文件，已非强推到原仓库 `codex/go-mini-workbench` 并用 ls-remote 核对同 SHA。仍用独立 index／commit-tree／比较旧值更新 ref；工作分支保持 codex/boomer-go-native，正常暂存区为空。没有混入 Flutter/iOS 改动或修复原 main/Lovable 历史分叉。后续文档提交不改变上述 502 项测试的运行代码。
- 专用员工 AppID、真实员工／真机、Stage2 上传和其他剩余功能平替仍未完成；本轮没有腾讯云 Web 发布。

## 前一检查点：券核销和排班

- 主流程在两组页面修复停写后重新运行 `npm test`：414/414，通过，0 失败／跳过／取消。券页 48 项、排班升级 68 项，旧员工页 74 项未降低预期。
- `npm run check`：17 个原生路由通过；官方 wcc 编译全部 18 WXML、wcsc 编译全部 19 WXSS，退出 0、stderr 为空。没有 H5 或服务端密钥标记。
- 新原生券页：安全八位券码／批准域名解析；扫码只查券；门店与服务端能力核验；独立规则和脱敏领取人；二次确认、精确核销回执与写后详情回读。未知结果不自动重发、不换 key。最小 App RAM 在同账号／同店重新授权后恢复核对依据，不落磁盘、不保存 PII。已修复卸载／403 丢失原 key 和首次明确 abort 永久锁住下一券这两项审查问题；最终独立复核确认闭合，48/48 通过，未见确认新增 P1/P2。
- 新排班使用已有 RPC 的只读 DTO，保留整月及选日、区分休息和未同步、本人实际调店、获权同店分组及冲突。旧 DTO 显式身份冲突会整包拒绝，同店 conflict 必须关联同日合法人员行；不增加排班写权限。最终独立复核确认 legacy P2 闭合及 conflict 关联已补，68/68 通过，未见确认新增 P1/P2。
- 实际 DevTools 已沿“我的 → 门店优惠券 → 扫码核销”进入原生页面，查询只读 DEMO1234，看到金额、规则、脱敏信息及禁用核销状态；曾输入不完整码会明确报错，不触发操作。没有扫描真实顾客券或真实核销。
- 实际 DevTools 已看到 31 日月历、明确休息日无工时、选择无记录日显示“无记录不等于休息”。当前示例账号没有同事权限，按钮不出现；有权限的同店视图目前仅经过合成 VM 测试，未冒充实际员工 GUI 验收。
- 截图临时原件位于 `/private/tmp/go-mini-native-evidence-20261016/`：native-voucher-query.png、native-schedule-v2-month.png、native-schedule-v2-rest.png、native-schedule-v2-empty.png；均为实际工具截图，无生成式修改。
- Round13 固定 ref `a4b3eb9f99aa13d0672a20df5e9be0718ddcea47`：主流程读取迁移、BFF、voucher.ts、契约与测试脚本，独立后台源码复核无确认新增 P1/P2。Lovable 报告迁移 0013 已应用／Edge 已部署、Deno 券 6、DM 12、media 9、shop 5、社区 scope 1、Web 15、quiz 4 均通过，12 组合成 SQL 强制回滚；主流程未重跑 SQL，不是两会话并发或真员工核销。
- 主流程本轮匿名请求新 voucher action 收到 `401 unauthorized`。此前 `bc78c1...` 和 `27129b...` 两条所谓部署指纹无法复算，已由 Lovable 明确撤回，不再作为有效证据。主流程对固定 ref 原文独立复算：Round13 index.ts `330cfa9c...`；Round14 index.ts `20fe3e81...`、schedule.ts `b1a00f3a...`，均与后续可复算报告一致。完整哈希见契约；没有下载线上函数源码比对，不能声称 bundle 字节已对齐，也不直接认定部署错误。
- Round14 固定 ref `5a4cdf6da4bd3d61279bc78d40141b8c8bd52aeb` 已读取 schedule.ts、index.ts handler、原 RPC migration 和契约：mine 调 RPC 的店参数为 NULL 后仅投影本人；shop 先传精确选店，原 SQL 的 work/rest 均先收窄再生成冲突；can_view_shop 严格 true。独立源码复核无确认新增 P1/P2。Lovable 回报已部署，无迁移／GRANT／RLS 变更；Deno 排班 8、券 6、DM 12、media 9、shop 5、社区 1、Web 15、quiz 4 及类型检查均通过，5 组只读合成 SQL 强制回滚、无残留。SQL 未由主流程重跑，不能从匿名 401 或该报告推导真实员工 E2E。
- 旧 Web 的核销、全店 PII RPC、manage RLS 和截图桶路径风险未在本轮全局修复；旧腾讯 Web 附件兼容适配也仍未上线。专用 AppID、合法域名和真实身份／设备验收仍是独立门槛。

## 前一检查点：同事消息和社区

- 主流程重新运行 `npm test`：292/292 通过，失败、跳过均为 0；其中 DM 45、社区 31、原文件聊天媒体 9 项。旧的 199 项为首批基线，不是当前总数。
- `npm run check`：16 个原生路由通过。官方 DevTools `wcc` 编译全部 17 个 WXML、`wcsc` 编译全部 18 个 WXSS，退出码均为 0、stderr 为空；包含自定义 Tab 和全局样式。
- 相同用户重新登录时营销创作仍保留旧身份状态的回归已修：creative scope 包含 session revision；迟到相册/脚本状态不能落到新登录。
- DM 通知／会话／联系人、before/after 聊天分页、精确已读、消息状态回读、幂等发送、原文件附件上传与原生打开均有客户端实现。会话分页用 Round12 snapshot_id；空槽不让分页漂移，过期保留已加载内容，显式刷新才重建集合。
- 社区详情不再丢商品故事/卖点等字段；评论稳定游标、确认回执后清稿、显式点赞目标、身份/隐藏生命周期隔离已接。独立源码复核与 31 项本地模拟测试未发现可确认的剩余 P1/P2。
- 在官方开发者工具实际查看联系人分组、长气泡、发送失败保留 `draft-test`、完整商品故事与评论底部安全区。均为显式合成示例；没有发送真实消息、上传真实附件或发表真实社区互动。

### 后台和跨端边界

- GO backend Round9/10/11/12 沿用同一项目、用户 JWT 与现有 RLS。迁移 0008/0009/0010/0011/0012 的精确契约见 GO_MINI_API_CONTRACT.md；未复制或另建第二套数据库。
- Round12 固定源码 `7a3081199b99cbee95c0ea72d2ca5ffa785ba9ea`，部署 fingerprint `654c25d0b360171cccea65628d785b49c3ad6f92572dd2fd9f7fa08e672f49b5`。主流程读取两份 SQL 与 dm.ts；独立复核未发现新增 P1/P2。Lovable 报告实际回滚 SQL 覆盖晚提交等价、同微秒、删除空槽、他人快照、过期、空集、伪造 ID 无正文泄漏和账号级联；不是主流程真实员工测试。
- 新附件消息只存不可变绑定路径，读时由本人签 1 小时；接收者只能读取确实发给自己的对应原件。历史 5 年链接没有被撤销，旧直接写入路径的风险未全局消除。
- Lovable 新跑 DM 12、媒体 9、选店 5、社区 scope 1 项及 Web/API 类型检查通过；Round11 SQL 未在这次回归重跑，不能将报告拼成一次全链路验收。未有覆盖所有社区 action 的独立后端单测，不声称全库测试完成。
- 测验开发依赖缺失已在 GO 项目收尾：固定 ref `bf15cf46535457e7e9de43e09d19b52abdaadc24` 的 package.json / package-lock.json 新增精确 devDependencies `@electric-sql/pglite@0.5.10`、`vitest@2.1.9` 和 `test:go-mini-quiz`，运行时依赖不改、Vite 仍 5.4.19。主流程读取固定 ref 核对版本；Lovable 在项目内运行 4/4 通过、Web 15/15 及类型检查通过。依赖安装用了 `--legacy-peer-deps`；没有独立执行全新 checkout 的完整安装，不将项目内通过冒充干净环境验收。
- 旧 Web 的三文件附件兼容适配固定 ref `c11c6c28d72e7ffe03a0b3173d33eac000c9e2db`；主流程将 helper 和测试复制到独立临时目录，实际重跑 15/15 通过。终止错误不因新消息反复换签；过期文件本次只换签，成功后用户再次点击原生链接打开，不预开空白窗口。
- 该固定 ref 的独立源码复核确认两条既有 P2 已闭合，未发现新增 P1/P2；源码与模拟测试不替代实际浏览器附件往返。
- **腾讯 GO 网页尚未部署上述兼容适配。** 只读确认 `ai.boomeroff.com` root `/var/www/ai-boomeroff` 指向 release `337b2aa3`，公网 200 且产物与 release 一致。`/home/ubuntu/ai-boomeroff-source` 的旧构建产物不同，未证明对应当前线上源码；未从该旧树构建覆盖生产，也未改压缩 JS。新原生 DM 正式开放之前必须完成同版本源码核验、隔离候选与双端测试。

## 首批本地源码与测试（历史基线）

- Node 原生测试：199/199 通过，失败 0、跳过 0。覆盖身份恢复/OTP、门店范围、过期租约、旧响应、同账号重登、并发识物保存、原生页面、测验、媒体与部署保护。
- `node tools/check.cjs`：14 个原生路由、JS 语法、JSON 配置、无 H5/web-view 与服务端密钥标记检查通过。
- 独立复核曾发现身份并发、空门店查询、旧响应覆盖、旧 401 注销新会话、保存幂等键竞争和发布回滚风险；修复后未报告残留 P1/P2。部署保护的共同 flock 只约束遵守同一协议的发布者，不声称能原子阻止不合作的外部部署。
- 发布脚本本地模拟 3/3 通过，包含外部 release 保留与回滚激活失败。模拟跳过真实主机锁获取，不证明其他发布者遵守锁。

复跑：

```sh
npm test
npm run check
```

## 官方开发者工具中的实际观察

- 在独立 `touristappid` 项目内编译并打开五个原生 Tab：工作台、学习、识物、消息、我的。
- 检查原生月历、知识详情、测验作答/结果、成长签到和个人资料表单。资料只允许昵称/头像编辑；ERP 姓名、手机号、门店和角色只读。
- 开发预览明确显示合成数据；预览测验结果标记“未保存真实测验记录”，不冒充成绩入库。
- 相机是原生 camera/takePhoto 路径，不是 chooseMedia 每张确认流程。模拟器未提供真实取景，未验证连续实拍、iPhone 相册权限或保存。
- 从开发者工具发往真实 `go-mini-api` 的无身份请求返回 401，证明网络能到达与匿名被拒，不证明员工登录成功。
- 游客模式会提示“工具未检查合法域名”。即便项目 urlCheck 开启，也不能替代专用 AppID 的正式域名校验。
- 截图保存在 `evidence/`，均为真实工具截图，无生成式美化。截图不作为登录、付费视频、真实业绩或业务写入成功的证据。

## GO 后端

- 已直接与 GO Lovable 项目协调，新增部署 `go-mini-api` 和相关受限迁移；当前契约快照 commit：`0fbc3474e059e1622fc26df7cbccea196c712309`，source fingerprint 前缀 `fea5a2de`。
- 契约详见 GO_MINI_API_CONTRACT.md；本目录未复制一套独立 GO 数据库，不应据此重新部署覆盖原项目。
- 已读取后端源码及部分 SQL 授权定义。Lovable 回报的事务回滚 SQL 验证涵盖本人/跨账号、过期/撤销/停用范围、重复签到、识物幂等、测验篡改/重复提交等；主流程未以真实员工在客户端重跑完整业务链。
- 新测验答案保留服务端、原子冻结首个结果；不代表旧系统所有直接表写入均已防作弊。旧个人签到/资料和部分旧测验写入权限仍有历史风险，不在本轮声称全局修复。
- 识物保存标记 client_submitted 来源，不把客户端识物内容自动提升为官方知识。

## 腾讯云

- 新增只读 `/api/public/go/leaderboard`，从既有 `youzan-points-identity-20261016` 基线构建，保留并行发布的积分修复。
- 第二候选 release：`/var/www/boomer-erp/releases/go-mini-leaderboard-20261016b`。构建前 GO bridge 104 项测试通过，生产构建通过；第一次候选因生产基线变化未晋升。
- 已检查生产链接/PM2 主进程、保留 worker 环境，停止临时候选进程。
- 公网新接口匿名返回 401 `missing_token`；现有 `/login` 返回 200。一次冷请求约 10 秒，后续约 0.084 秒，不能据此保证整体瞬时加载。
- 订单缺员工销售归属时，后端返回 complete:false、空榜和原因；不伪造个人业绩，不用于考核。
- 后续加固的共同 flock 发布脚本已复制到主机，但没有再次执行生产晋升；不得把本地模拟当作加固版已在生产完整演练。

## Git 与发布边界

- 已只读核对 Lovable 的 GitHub 连接确为 `pzy880723/boomeroff`、main。
- 原同步 UI 报密钥保护拦截和双边历史分叉。未绕过保护、未恢复会覆盖 278 条 Lovable 提交的旧保存、未强推或断开项目。
- 干净小程序源码单独存入 `codex/go-mini-workbench`；它不修复原 main/Lovable 的历史同步问题，也不代表 Lovable 当前后端代码已全部进入 GitHub main。
- 本地原生 Flutter/iOS 及其他已有修改没有被暂存、撤销或混入新提交。
- 后续原生补丁 `5aec64a1f69489fa66b9172f9b39b12a2d0447c2` 仅 32 个小程序路径文件，已推送同一仓库的 `codex/go-mini-workbench` 并用 ls-remote 验证一致；不覆盖 GitHub main，也不表示 Lovable 的后台源码同步冲突已解决。真实工具截图保留在本地 evidence（被 Git 忽略），不是生成图。
- 券核销／排班补丁 `102950afc89a4260acc19a0f6bd3321c1ae9b2f9` 仅 27 个小程序路径文件，非强推成功，ls-remote 与该 SHA 一致。采用独立 index、commit-tree 和比较旧值更新小程序分支；当前 Flutter 工作分支未切换，用户正常暂存区前后均为空，没有将其他原生改动加入提交。后续文档收尾提交不改变已通过 414 项测试的生产 JS/WXML/WXSS。

## Stage2 客户端检查点

- 申请编辑器新增原格式凭证选择、本地预览、真实 UploadTask 进度、固定意图指纹校验、未知结果只读核对及同请求显式恢复。传输完成与服务端核验、发布记录保存是三个不同状态。
- 主流程重新运行完整 Node 测试：550/550，零失败／跳过／取消；其中共享上传 18 项、申请页 68 项。19 路由静态检查通过；官方 wcc／wcsc 分别编译 20 WXML／21 WXSS 成功，stderr 为空。该计数不证明真实 Storage 服务行为。
- 独立审查发现的“已选图遇到 CAS 冲突后锁死编辑器”P2 已按红绿测试修复：明确移除未发送／ready／终态引用不依赖上传写权限，但仍需当前身份、新鲜管理权限与可见页面。未知结果不能直接抹除；载入最新仍有明确确认步骤。
- 实际 GUI 走查：工作台 → 我的 → 我的活动 → 活动详情 → 发布确认；示例显示脱敏申请、原路径保留、禁用原图上传、只读答案与禁用保存。新截图 `evidence/native-application-upload-disabled-phone.png` 和 `native-application-upload-help-phone.png` 来自真实开发者工具，没有生成式美化。
- GUI 没有启用生产上传，也没有证明真实选图／进度／状态核对成功。这些状态目前由 VM／模拟适配器回归覆盖，需真实员工、专用 AppID 和测试环境验收。
- GO Lovable 后台任务 `umsg_01m50nwzmwewa8f3w8rc2wy9sd` 约 05:15 因平台 credit check-in 暂停，主流程在原编辑器点击 Continue 后恢复同一任务，没有修改持续额度偏好、重启任务或要求用户转述。后台实现尚未完成，客户端暂未与其最终固定源码对齐，不宣称迁移已应用或部署已完成。
- mini-only 客户端提交 `b6e33e092cf0f5c95c40a718aec733ef731ab55a` 非强推成功，ls-remote 已读回同 SHA，18 个变更路径均位于小程序目录。正常 index 仍为空；没有混入 Flutter/iOS 修改。其源码归档 `/private/tmp/BOOMER-GO-wechat-upload-client-20261016.zip` 通过完整 unzip 检查，SHA256 为 `2fc003ca1e4a7fac66f837948366112fe599bf811d21a6a389f0a207b973ed45`。归档是客户端检查点，不是后台部署包或正式体验版。

## 尚未完成的验收

1. 专用员工小程序 AppID、主体、服务类目、request/download 域名及微信隐私声明配置；不复用客户小程序身份。
2. 真员工 OTP 登录、ERP 续租、本人门店、总部切店及撤权后的实际端到端验证。
3. 真机连拍/识物完整故事、云保存回读、考试保存与历史、相册原件领取和付费视频任务恢复。
4. 剩余旧员工功能原生迁移：活动/券深度操作、角色专属管理写入、排班管理等，见 FEATURE_PARITY.md。同事私信/社区已新增客户端实现，但真实双员工与跨端附件仍未验收。
5. 有员工销售归属后再验真实龙虎榜。月度业绩和退款净额目前不伪造。

以上未完成项不能由游客预览、测试通过、后台部署或设计稿替代。
