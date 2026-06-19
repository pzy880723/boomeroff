## 1. 公开报名页 `PublicActivity.tsx`

**A. 活动详情查看完整入口**
- 移除当前 `line-clamp-3`,保留摘要展示;在描述下方加一个小按钮「查看完整活动详情」。
- 点击弹出 `Dialog`:标题「活动详情」,内容为完整 `activity.description`(`whitespace-pre-wrap`,可滚动,最大高度 70vh),底部一个按钮「我知道了」关闭弹窗。
- 协议弹窗已存在,不变。

**B. 协议文案修正**(`agreementText` useMemo 内,"违约与争议处理"段)
- 旧:`...停用相关优惠券,并不退还已享受的活动权益。`
- 新:`...停用相关优惠券,并退还活动所享受的优惠活动权益。`

## 2. 活动详情页 `ActivityDetail.tsx` — 已领取列表升级

**A. 数据实时同步**
- 现在 `load()` 只在 mount 跑一次,导致已领取/已核销数字和列表不刷新。
- 加 Supabase realtime 订阅:`activity_applications`(filter `activity_id=eq.${id}`) + `voucher_claims`(filter 通过 `activity_id` 关联,或监听全部 voucher_claims 后做本地过滤);任一 INSERT/UPDATE/DELETE 都触发 `load()` 重取。
- 同时页面顶部加一个「刷新」图标按钮兜底手动刷新。

**B. 搜索框**
- 在「领取列表」标题行右侧加一个 `Input`(图标 Search),placeholder「搜索姓名 / 电话 / 账号名称」。
- 客户端过滤:命中 `applicant_name` / `applicant_phone` / 任一 `form_data[*]` 字符串值(包含小红书账号、抖音号等表单字段)。

**C. 发布确认入口(每条记录后)**
- 每条领取记录右下角新增按钮「发布确认」(管理领取人是否已发布对应内容)。
- 点击打开新建组件 `PublishConfirmDialog`:
    - 顶部展示领取人姓名/电话/已填写的"账号"字段。
    - 展示该用户上传的主页截图(从 `form_data` 中类型为 `image` 的字段渲染,通过 `voucher-screenshots` createSignedUrl 打开大图)。
    - 一个 `Textarea` 备注(可选)+ 两个主操作按钮:「已确认发布 ✓」/「未发布 / 撤销确认」。
    - 当前状态(已确认 / 未确认)以 Badge 形式显示在列表卡片上。
- 列表卡片新增小 Badge:「已确认发布」(绿) / 「待确认」(灰)。

**D. 同一手机号仅能领取一次**
- 后端 `activity-apply` 已经支持同手机号返回 `already: true`,无需改。
- 在协议第三条"同一自然人、同一手机号在本活动中仅可领取一次"已存在,无需改。

## 3. 数据库迁移

新增两列到 `public.activity_applications`:
- `publish_confirmed boolean NOT NULL DEFAULT false`
- `publish_confirmed_at timestamptz`
- `publish_confirmed_by uuid`(可空,记录操作的管理员)
- `publish_confirm_note text`(可空)

更新现有 RLS:活动 owner(`activities.owner_id` 或建立时的用户)有权 update 这些字段;现有 update policy 若已允许 owner,无需新增,只补 grant。

## 4. 文件清单

**编辑**
- `src/pages/public/PublicActivity.tsx` — 详情弹窗 + 协议文案
- `src/pages/ActivityDetail.tsx` — 实时订阅 + 搜索 + 发布确认按钮 + Badge
- `supabase/migrations/<new>.sql` — activity_applications 加 4 列

**新建**
- `src/components/voucher/PublishConfirmDialog.tsx` — 发布确认弹窗

## 技术要点

- 实时订阅清理:useEffect 返回 `supabase.removeChannel(channel)`。
- 搜索状态用 `useState<string>('')`,渲染前 `useMemo` 过滤。
- 截图签名 URL 复用 `ActivityDetail` 现有 `voucher-screenshots` createSignedUrl 模式。
- 发布确认更新:`supabase.from('activity_applications').update({ publish_confirmed, publish_confirmed_at: now, publish_confirm_note }).eq('id', appId)`,成功后 `load()`。
