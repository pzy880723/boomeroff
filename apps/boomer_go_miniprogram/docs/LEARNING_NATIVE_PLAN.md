# 原生学习闭环

范围：learn/list/detail/quiz 及 list/model.js、独立学习测试。沿用已批准的红白原生卡片；不改登录、shared、后台、其他业务或 Git。不新增批量任务、删除或权限。

## 已核实契约

只读 GO 固定 ref `d6c94826445617aa5d41a8f053e107244d0d159d` 的 `supabase/functions/go-mini-api/index.ts`：

- 528–535：`my-library {page,page_size}` 按本人 user_favorites 分页，返回 id/source_type/source_id/snapshot/created_at、quiz_kind=favorite、quiz_available、passed。没有搜索、掌握筛选、全量计数或 passed_at/last_attempt_at；不将缺失时间补成现在。
- 335–340：`quiz-history {page,page_size}` 是本人结果行，id 不是内容 ID；阅读使用 item_kind=official/knowledge/favorite 与 item_id。passed_at、last_attempt_at 分开呈现，不从分数推导通过。
- 169–216：`knowledge-detail {kind,id}` 解析真实题源；favorite 的 id 是收藏行 ID。源不可读时 quiz_available=false。详情是最终出题资格，不能相信列表的 blanket true。
- 282–332：quiz-start 返回私有 quiz_token 和 index/stem/options；quiz-submit 使用同 token/原 answers，服务器评分，返回 correct 布尔数组、correct_answers 索引数组及 persisted。只在 persisted===true 时称已保存。固定 ref 对 persisted 缺失作默认 true，主流程已另行追踪服务端重放修正，本页不补猜。
- 同 ref `docs/GO_MINI_API_CONTRACT.md` 答题段确认 submitted/kind/id/replay/submitted_at 等回执字段。缺少结果级逐题历史读取接口，不能声称重新进入历史可恢复旧题答案。

## 最小交互

1. 学习“测验”和我的知识库/收藏显示全部、待掌握、已掌握筛选；搜索和计数明确只覆盖已加载内容。保留服务端 has_more，即使筛选后本页为空也可继续加载；未知状态不归入待掌握或已掌握。
2. 历史行显示服务器分数、通过时间/最近作答时间；已知且合法 item_kind/item_id 才能进入对应阅读。未知或畸形来源明确不可阅读/重测，不拿结果 id 猜内容。
3. 阅读页仅 quiz_available===true 且 quiz_kind 与内容类型一致时展示单篇测验入口。返回页面重新读取；收藏/历史 onShow 重新取得服务器归档，不本地标通过。
4. 提交锁定原答卷，单飞，同凭据重试。结果只显示服务端评分；提交后合法 correct/correct_answers 数组映射题干、本人选择、服务端正确选项，不编造解释。缺少数组提示无逐题回顾，不影响有效评分回执。
5. 所有学习读请求按页面请求序号、身份/门店/revision、可见生命周期隔离。隐藏或卸载回包不可填充页面；身份变化清理旧题和私有 token。分页失败保留已加载内容、重试原页，不混接刷新前页。

## TDD / 验收

先独立测试 RED，再最小实现：真实收藏 DTO/已加载筛选和续页、未知状态、不同员工、真实历史来源路由/畸形拒绝、晚到与失败分页、详情不可考/错误来源、提交后数组回顾/缺失数组/未保存/重复提交、隐藏与换身份提交、onShow 云端归档刷新。随后 focused、全套、静态路由与官方 WXML/WXSS 编译，停写供主流程 GUI。

证据边界：仅源码、合成 DTO 单测和本地编译；不调用真实员工出题/提交，不宣称真实学习 E2E 或全功能迁移完成。

## 执行检查点

- 工作者首批观察22项RED、3项既有GREEN；最终focused38、与员工页合计113、当时全套625通过。主流程补preview2项和GUI重复时间1项，均观察RED到GREEN；最终完整628通过、19路由与官方20WXML/21WXSS编译通过。
- 独立主审查15冻结文件未见确认新增P1/P2，独立113项通过；小差异learning＋preview51项通过。复核者未执行GUI、全套或真实员工操作。
- 主流程实际合成GUI完成筛选、阅读、单篇练习、明确未保存的结果回顾、历史和原题源阅读。历史时间重复已在截图发现、模板修正并复截图确认。示例收藏归档不因示例交卷改变。
- Round18后端首次持久化事实与重放修复已固定源码核验；原生继续严格persisted true才称已保存。真实员工保存及归档刷新仍待专用AppID/员工端到端验收。

## 本轮结果与预览交接

- RED：首批 25 项中 22 项因缺少筛选、来源路由、可见生命周期和回顾等失败；随后评分计数、畸形来源、换身份评分单飞等新增用例分别先红后绿。最终学习 focused **38/38**，完整 suite **625/625**，19 路由静态检查、官方 **20 WXML / 21 WXSS** 编译通过。
- 旧 employee-pages 测试仅修正两类学习 DTO：单题评分从百分数改为有效 count 并保留 server passed=false 断言；历史通用导航 fixture 补真实 item_kind/item_id，断言读取内容 ID 而非结果行 ID。
- 当前 shared preview 的收藏仍是旧 articles 复用，不为演示放宽来源校验。shared/preview.js 由主流程独立调整，本 worker 未编辑。

主流程最小合成 fixture（无生产调用/磁盘写入，保持既有 knowledge 示例 ID，不为未知详情 fallback）：

1. `my-library` 返回 page/page_size/has_more；至少两条不同收藏 UUID，source_type/source_id/snapshot.name/summary、quiz_kind=favorite、quiz_available、passed=false/true。明确示例和 persisted=false；没有真实 passed_at/last_attempt_at 就省略。
2. 这两个收藏 UUID 的 `knowledge-detail {kind:favorite,id}` 返回完全相同 id、kind=favorite、title/body、quiz_kind=favorite、quiz_available，raw.favorite 包同一收藏 id/source_type/source_id，raw.source_available=true、raw.source 为原示例文章。source_id 可引用既有 official 示例 ID，但不把该文章 ID 当收藏 ID；孤儿示例 source_available=false/quiz_available=false。
3. `quiz-history` 使用独立结果 UUID，item_kind=favorite、item_id=上述收藏 UUID，score 为 0..total 整数、total 为对应合成题数，passed_at 为明确合成 ISO/null、last_attempt_at 为合成 ISO；page/page_size/has_more。无需虚构历史逐题读取接口。
4. quiz-start 保持连续 index=0..N-1 的题目和私有 token；quiz-submit score/total 必须匹配该 token 的题数、passed 为布尔、persisted=false。若返回 kind/id/submitted，须精确绑定该 token/原提交；correct:boolean[N] 与 correct_answers:0..3[N] 可供示例提交后回顾，缺失则页面明确无完整回顾。全程保留“合成示例、未保存真实记录”标识。

剩余边界：缺少收藏全量统计/服务端掌握筛选、收藏的作答时间字段和旧测验逐题恢复接口；本轮不臆造。正式员工闭环、真机与 GUI 验收由主流程另验。文件已冻结供集成审查，无 Git 操作。
