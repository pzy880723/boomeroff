# 原生员工社区互动设计与 TDD 计划

状态：2026-10-16，已按本地 Round10 契约完成客户端与 TDD；主流程已确认 Figma 4:2、注册路由并接旧列表入口。真实员工写入/真机验收尚未执行，不等同完整业务验收。本 worker 不执行 Git 操作，不修改后端。

## 目标与边界

- 最小端到端：员工打开可见帖子，读取本人真实点赞状态及计数，设置点赞目标值，分页读评论，提交文字评论并确认持久化。原生页面不是 Portal 审核工具，不新增权限、不直查表、不使用特权凭据。
- 本轮 ownership 仅 `miniprogram/pages/community/*`、`tests/community-pages.test.cjs` 与本文。旧 `pages/detail/*`、`pages/list/*` 只读；主流程负责 shared/API/session、preview、app.json 注册、旧列表入口和 Figma。
- 单页路径 `/pages/community/index?id=<postId>`，id 指帖子而非商品。文件为该目录 `index.js/.json/.wxml/.wxss` 及纯 DTO 展示/校验/微秒稳定排序 `model.js`，不引入通用框架。身份隔离只读复用 `list/model.scope`（含 session.revision）。
- 不新增信息流、任意图文发帖、图片评论、评论编辑/删除、审核、官方收录、通知或核销。旧商品详情的 `community-post {product_id}` 分享保持原样，不能拿它发送评论。

## 已读依据

- `docs/DESIGN.md/PLAN.md/GO_MINI_API_CONTRACT.md`、现有 `app.wxss`、`shared/page.js/api.js/session.js`、旧 detail/list 页面和 `tests/race-guards.test.cjs`；与主流程 `DM_NATIVE_PLAN.md` 保持身份隔离和真实回执原则一致。
- Web `src/pages/Community.tsx` 的点赞/取消点赞写 community_likes，评论写 community_comments；上轮只读审计确认普通员工操作与 community.moderate/官方收录分离。迁移不照搬 Web 的乐观计数和发送前清空输入。
- 初版计划曾等待完整互动契约；当前已读主流程追加的 GO_MINI_API_CONTRACT.md Round10 community-* 节，精确映射见下表。测试采用其原始 DTO，不将手造 normalized 数据当作后端验收证据。

## 原生 UI 设计

1. **框架**：微信原生导航栏“BOOMER 圈”，保留返回；不增一级 Tab。沿用灰底 `#F5F6F8`、白卡、正文 `#202125`、辅助字 `#737780`、品牌红 `#EB0029`；约 36rpx 横向内边距、28rpx 卡片圆角、22rpx 卡片间距，正文 30–32rpx，触控区域不小于 88rpx。优先复用 `.page/.card/.row/.muted/.error/.empty/.button/.button-secondary`，局部样式只在 community 目录。
2. **帖子区**：作者/服务端时间、分类、标题、原图、正文，按真实 DTO 可用字段展示；无字段不补故事、作者或时间。图片 `widthFix`，长中文/链接换行，正文与评论用可复制原生 text，不执行 HTML，不加 web-view。
3. **互动区**：白卡内显示“点赞 / 已点赞”及服务端点赞数、评论数。已赞用浅红底/红字，未赞白底边框；文案同时表达状态，不只靠颜色。本人状态或计数未知时显示“状态未确认 / --”并禁用点赞，不默认未赞或计数 0；加载中显示“正在确认”，不先改变状态或加减计数。
4. **评论区**：标题“评论”及服务端总数；评论行含允许公开的作者、服务端时间、完整正文和细分隔线。按后端稳定排序展示；尾部显式“加载更多评论”，加载中禁重复点击，失败就地重试。续页保留已加载内容与阅读位置，不跳回页首；评论总数不等于已加载条数。
5. **输入区**：底部白色输入栏，原生 textarea + 红色“发送评论”；计数器、maxlength 和校验严格采用契约真实上限及计数规则。支持键盘避让、安全区和长草稿，正文底部预留空间，不遮最后一条评论；发送中禁编辑/重复发送，原稿保持可见。
6. **状态**：首次加载显示加载卡；评论确认为空才显示“还没有评论”。帖子读取失败可重试；已删除/无权访问显示统一不可用态并隐藏旧正文、评论、计数和编辑器，不泄露存在性。普通评论分页或写失败保留有效帖子和草稿，不清空整页。显式开发预览持续带示例标签，绝不自动 fallback 或显示真实发布成功。

## 数据、写入与生命周期

- 所有业务通过 `definePage` 注入的 `this.api.action` 和 `this.run`；不自行 wx.request、不读 token、不拼 user_id 或门店授权。主流程 adapter 负责契约适配，服务端每次读取/写入都重验当前员工、fresh ERP scope 和目标帖子可见性。
- 首次进入只合并一次详情/首批评论加载；onShow 返回前台重验可见性。无需新增轮询或租约 timer，续租复用共享 API。详情无可见性确认时不可互动，列表缓存或路由传入 id 不是写权限证明。
- 点赞一次点击只产生一个明确目标值，例如从已确认未赞设为 true。single-flight；失败/超时重试保留原目标，绝不重新取反。成功只采用回执或重新读取的真实本人状态和计数；缺字段、状态不符、HTTP 200 但未确认均不可假成功。刷新与写入交叠时，旧读回包不能覆盖更新后的状态。
- 评论 trim/空白和长度按契约校验，不擅自截断；长度不合法时零网络写入。首次发送为该逻辑评论生成一次兼容微信的 request_id，绑定身份、帖子和精确发送正文；重试复用同一 ID 与正文，不能自动生成新 ID。格式、生成方式和服务端保存窗口须先确认，不假设可用 crypto.randomUUID。
- 只有服务端提供可关联该请求、帖子和正文的明确持久化评论回执，或契约明确的回读对账证据，才合并正式评论并清空该次原稿；仅 HTTP 成功或无内容的 ok 回执不足。按服务端评论 ID 去重，不创建“已发送”的本地临时评论，不手动增加总数。
- 明确写入失败保留原稿；网络超时/回执缺失属于结果未知，提示“尚未确认，原稿已保留”，保留待核验请求并允许同 ID 重试。未决请求不得换正文复用同 ID；先按幂等契约核验/重放定型，再提交新稿。确定未写入后编辑正文则成为新逻辑请求。回执失败/权限拒绝都不清稿；身份改变例外，必须清除旧身份草稿。
- 评论分页按契约 page 或 cursor 前进，以评论 ID 去重；只有成功才更新续页位置，失败重试原位置，has_more 取后端，不按当前页条数猜。刷新使旧续页失效；评论提交、刷新、分页交叠按各请求序号及写入代次隔离，不能丢掉刚确认的评论或重复显示它。
- 每次异步操作捕获 `session.revision()`、userId/shopId/scopeVersion、postId、页面/可见 epoch 与对应请求序号；任一变化均丢弃迟到成功、失败及 finally，不能解锁新请求或登出新员工。相同账号重新登录也要隔离，不能只比较 userId。
- onHide/onUnload 立即使可见请求失效，隐藏页不发新请求、不应用回包；卸载遵守 `_gone`，不再 setData。已发写入不假定撤销，返回后重新核对，不自动重发。仅同一页面实例/同一身份保留草稿及待核验 request_id，不落本机持久缓存，不承诺跨卸载或跨设备草稿恢复。
- 当前有效请求的 401 交共享 run 处理；旧 revision 的 401 不影响新会话。403/404 撤销当前帖子可交互状态；后台权限变化不能继续靠旧 UI 写入。

## Round10 已确认契约

| 能力 | 本地准确契约与当前实现 |
| --- | --- |
| 帖子详情 | `community-detail {id}` → `{post,liked,likes_count,comments_count}`；展示故事/描述、年代/产地/材质/工艺/尺寸/品相、卖点/tips、鉴赏/养护/稀有度/收藏参考/市场参考/入手理由及 author/mine/时间。缺计数或 liked 不猜零/false，不开放互动 |
| 评论分页 | `community-comments {post_id,cursor?,page_size:20}` → `{post_id,order:'asc',items,has_more,next_cursor}`；cursor 原样传递，旧→新，`(created_at,id)` 同微秒稳定排序，按 ID 合并；失败保留条目/游标 |
| 设置点赞 | `community-like {post_id,liked:boolean}` → `{post_id,liked,likes_count,comments_count}`；目标值重试不取反，回执帖子/目标值/非负整数计数都须匹配；不乐观计数，不读旧帖子冗余计数 |
| 发表评论 | `community-comment {post_id,request_id,content}`；content trim 后 1..1000 UTF-16，ID 为 8..64 字母数字下划线/连字符。同用户+key 原子幂等；同 key 改 post/content 为 409。回执 `{comment,replay,liked,likes_count,comments_count}` 不含 request_id：核对持久化评论 UUID、post_id、正文、mine=true、author.user_id=当前员工及完整时间/cursor，再清稿 |
| 权限/集成 | 每个 action（含 replay）先验现有 RLS + is_public=true + is_guest=false，不可见 404 post_not_found；服务端重验 fresh ERP scope。本 worker 不传 user_id/shop_id，不直查表。主流程负责 adapter/preview/入口/路由，示例 id=example-community 可读，点赞/评论写入不伪造成功 |

本轮没有修改上述契约或新增权限。评论未知结果锁定原稿/原 key 供人工重试；明确 400 拒绝后可改稿，同稿重试仍用原 key，改正文才新建逻辑请求。点赞与评论写入串行；读请求携带写入代次，旧详情不能回滚已确认计数。

## 接契约后的 TDD 顺序

每阶段均先在 `tests/community-pages.test.cjs` 用准确 DTO 写测试并观察行为失败，再只改 ownership 内实现转绿；wx/传输边界可 mock，状态转换及真实 page 逻辑不得被 mock 替代。

| 顺序 | 先写的失败用例 | 最小实现与验证 |
| --- | --- | --- |
| 1. 可见帖子 | 原始 DTO 展示；无 id、详情缺字段、404/403；加载/错误/真实空评论；不能以缓存或 URL 授权 | 创建原生 community index 四文件，definePage 接真实读取；不可见时零互动请求，无 HTML/H5 |
| 2. 点赞 | 本人 true/false 与真实计数；未知状态禁用；连点 single-flight；失败与超时重试目标不变；不完整回执不改状态 | 接 set-like 契约，不做 toggle 或乐观计数；成功回执/回读必须匹配目标；延迟旧详情不能回滚写入 |
| 3. 评论分页 | 首批/后续真实 DTO、重复 ID/同时间戳、末页、空页但 has_more；失败保留条目/游标；刷新后旧页失效 | 独立评论加载状态与局部重试，稳定合并，不用列表长度推算总数，不丢阅读位置 |
| 4. 评论提交 | 空白、上限、上限+1及 emoji 计数；确认前不清稿；失败/无效回执保稿；连点只发一次；同 ID 重放返回同一评论；同 ID 不同稿不发 | 请求 ID 绑定原稿；准确持久化确认才清稿/合并；发评与续页/刷新交叠无重复、无丢失，不虚增总数 |
| 5. 身份/生命周期 | A→B、同账号重登 revision、换店/scope、换 postId、hide/unload；迟到读写成功/失败/finally；旧401不登出新员工 | 各请求代次隔离、失权隐藏旧数据、身份变化清旧草稿；隐藏页零新请求，卸载后零 setData |
| 6. 集成/视觉 | WXML 所有动态条件带 {{}}、表达式用 raw &&；预览明确标注且不冒充持久化；旧商品分享仍调原 action | 主流程接 shared/preview/app.json/入口；保留旧 detail/list 不改；检查长文、空态、局部失败、键盘、安全区与长列表 |

本轮已执行以下命令，验证记录见末尾：

```sh
node --test tests/community-pages.test.cjs
node --test tests/*.test.cjs
npm run check
```

主流程另跑 DevTools 官方 WXML/WXSS 编译并截图核对 Figma；最后用真实授权员工验证点赞跨端一致、评论重试只持久化一条、分页可达、撤销可见性后写入拒绝，以及无权限账号零扩权。单测、预览、编译和真实员工验收分开记录。

## 本轮 TDD 与验证记录

- [x] 已观察初始 24 项红测试，再实现页面；首批评论重试按钮曾误收 tap event 为 append 参数，新增行为测试观察红后改独立 retryComments 处理器；400 同稿重试 key 曾变化，新增测试观察红后修复。最后补旧输入控件事件晚于同账号重登录的红测试，确认清稿后不能再写回旧文字。
- [x] `tests/community-pages.test.cjs` 31/31 通过；覆盖原始 DTO/完整故事、真实点赞、分页/失败保留、1000 UTF-16、同 key/新稿、无 request_id echo 的真回执校验、假回执、读写交叠、身份/revision/换帖/隐藏/卸载、旧401与当前401、显式 preview。
- [x] 主流程接社区入口后，最近一次 `node --test --test-reporter=spec tests/*.test.cjs` 284/284 通过；`npm run check` 16 路由静态检查通过。主流程并行新增测试，故总数为该次运行快照，不宣称其他功能均已验收。
- [x] 使用已安装 DevTools 官方 wcc/wcsc，只向 stdout 编译本 community WXML/WXSS，两者成功；动态条件带 mustache、表达式用 raw &&。未改 shared、旧 list/detail、app 配置，也未执行 Git 操作。
- [ ] 主流程截图核对 Figma、键盘/安全区与长文长列表；本 worker 不冒称已看过新页运行截图。
- [ ] 真实授权员工点赞跨端一致、评论幂等持久化/重放、撤销可见性后拒绝、真机键盘/滚动验收；本轮没有发送真实社区写请求或修改数据库。
