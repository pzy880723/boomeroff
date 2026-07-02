## 资讯列表:公众号风格大卡

把「资讯」tab 每一条改为独立大卡片,顺序:类型/时间 → banner → 标题 → 导语 → 作者 + 未读点。同时给通知加一段 AI 生成的「导语」字段。

### 1. 数据层:新增 `summary` 字段
- migration:`ALTER TABLE public.notifications ADD COLUMN summary text;`(无默认、可空,老数据回退到从 body 截取)
- 无 RLS/GRANT 变更(现有策略覆盖)。
- 更新 `src/hooks/useNotifications.tsx`:
  - `NotificationItem` 增加 `summary: string | null` 和 `created_by: string | null`
  - `.select(... , summary, created_by)`
- 新增作者信息:在 `useNotifications` 拉完 `notifications` 后,批量查一次 `profiles`(`user_id in (…)` → `display_name, avatar_url`),挂到每条 item 的 `author: { name, avatar } | null`。

### 2. Edge function:让 AI 出「导语」
- `supabase/functions/compose-notification/index.ts` 的 JSON schema 增加 `summary`:
  ```json
  { "need_more", "reply", "title", "summary", "body", "type" }
  ```
- prompt 中说明:`summary` = 面向店员的 20-40 字导语,一句话说清"这条讲的是什么、跟你有什么关系",不重复标题、不使用感叹号堆砌。
- 兼容旧返回:前端解析时 `summary` 缺失就置空。

### 3. 撰稿弹窗:新增 summary 状态 & 独立输入框
- `Notifications.tsx` 新增 `summary` state,和 title/body/type 一起进入:
  - `resetCompose`、`saveCurrentDraft`(带上)、`loadDraft`(带上)、`applyVersion`(增加 summary)、`versions` 数组结构(增加 summary)
  - `sendToAI` 收到 `d.summary` 时 `setSummary(d.summary)`
- 预览 tab 顶部结构改为 3 行:
  1) 分类 Select + 类型 Select + 「草稿」标记
  2) 标题输入框(现已有,保留)
  3) **新增**「导语」输入框:`Textarea rows=2 max=80 placeholder="一句话导语(公众号卡片摘要)"`
- 发布 `publish()`:`insert({ …, summary: summary.trim() || null })`
- 草稿箱 `NotificationDraft` 类型加 `summary`,`notificationDrafts.ts` 一并保存/回读。

### 4. 列表卡片:公众号大卡样式(仅 news tab)
现有资讯卡是「未读点 + 类型 + 时间 + 标题 + 图 + 摘要」,改为独立整卡:

```text
┌─────────────────────────────────┐
│                                 │  ← 16:6 大 banner(资讯必配;无图时占位色块)
│           BANNER                │
├─────────────────────────────────┤
│ [公告] 11-30 · 3小时前          │  ← 类型徽章 + 时间(灰)
│                                 │
│ 门店冬促全员培训通知             │  ← 标题 text-base font-bold 2 行截断
│                                 │
│ 明天早上 9 点全员到 3F 培训室…  │  ← 导语 text-sm text-muted 2 行截断
│                                 │
│ 👤 王小明 · 运营组         🔴  │  ← 头像+姓名(左)   未读红点(右)
└─────────────────────────────────┘
```

细节:
- 无外层小 Card;改用 `rounded-xl overflow-hidden bg-card border shadow-sm`。
- Banner: `w-full aspect-[16/6] object-cover`;无 image_url 时用 muted 底 + 大 ImageIcon 占位;banner 不再仅 news tab 显示,news 恒显。
- Meta 行:类型徽章 + `·` + 相对时间(3小时前 / 昨天 / MM-DD)。写个小工具 `formatRelativeCn(iso)`。
- 标题:`text-base font-bold leading-snug line-clamp-2 mt-2`。
- 导语:优先取 `n.summary`,否则回退到从 body 剥离 markdown 后前 60 字;`text-sm text-muted-foreground line-clamp-2 mt-1.5`。
- 作者行:`mt-3 pt-3 border-t border-border/50 flex items-center justify-between`;左侧头像(w-6 h-6 rounded-full)+ 姓名(text-xs),无作者时显示"官方"+ 系统 logo;右侧未读时显示 `w-2 h-2 rounded-full bg-primary`。
- 整卡点击 → 现有 `openDetail(n)`。
- `notice` tab 保留现有紧凑样式;`news` tab 使用新大卡组件。抽出 `<NewsBigCard>` 局部子组件,只在渲染 news 时使用,减小 diff。

### 5. 详情页
- `NotificationDetailSheet` 顶部保持 banner + 标题;标题下增加一段 summary(如果有),字号中等、颜色 muted-foreground,再展示正文,让详情页也贴合公众号阅读体验。(仅显示,不允许编辑。)

### 技术细节
- 文件:
  - migration:新增 `add_notification_summary`
  - `supabase/functions/compose-notification/index.ts`
  - `src/hooks/useNotifications.tsx`
  - `src/pages/Notifications.tsx`(卡片渲染、撰稿状态与 UI、publish payload)
  - `src/lib/notificationDrafts.ts`(草稿加 summary)
  - `src/components/notifications/NotificationDetailSheet.tsx`(展示 summary)
- 无新增依赖;`formatRelativeCn` 就地实现。
- 老数据无 summary 不会崩:前端 fallback 到 body 摘要;列表既有条目当有 image_url 就正常显示,否则用占位。
