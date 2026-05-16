## 目标

两件事：

A) **小精灵问候弹窗重做**：去掉冷冰冰的矩形卡片，改成"大头小精灵悬浮 + 嘴边引出的气泡说话"的拟人陪伴感。

B) **抽屉里的仪表盘越来越慢**：定位到根因（重复请求 + 重型查询并发），分阶段优化。

---

## A. 重做 SpiritGreetingDialog（拟人化）

### 现状问题（截图印证）
- 一个深色描边圆角矩形把头像和文字包在一起，气泡感为零，像系统弹窗。
- 头像缩在矩形左上、size=96，被压扁；文字挤在右侧、被框边夹住。
- 用 `Dialog` 的 `DialogContent`，默认带白底/边框/阴影/关闭叉，整体太"对话框"。

### 新方案
重写 `src/components/spirit/SpiritGreetingDialog.tsx`：

- 不再用 `DialogContent` 的默认卡片样式。底层用 Radix `Dialog.Root` + 自定义全屏 `Dialog.Overlay`（半透明遮罩）+ 自由布局 `Dialog.Content`（**无边框、无背景、无内边距**）。
- 内容垂直堆叠在屏幕中部：
  1. **大号小精灵**：size = 180~200，居中浮起（沿用 `SpiritMascot state="hover"`），下方有柔光地面阴影（径向渐变）。
  2. **手绘风格气泡 SVG**：紧贴在小精灵下方，**气泡尾巴朝上**指向小精灵嘴部位置（约头像底部偏左 35% 处）。气泡用 SVG `<path>` 画出云朵/圆角对话云的轮廓 + 一个三角小尾巴，描边色 `hsl(var(--accent))`、填充 `hsl(28 18% 16% / 0.96)`、轻微 drop-shadow。
  3. 气泡内文案（小精灵口吻，沿用上一稿不锁定方位）：
     > 嗨～我是中古小精灵 🌱
     > 我会一直在屏幕上陪着你～
     > 想聊聊天、问排班、让我帮你打打气，
     > **点我就行啦！**
     > （我还能被你拖到顺手的位置哦）
  4. 气泡下方 24px 间距，居中一个胶囊按钮 `好的，知道啦`（accent 渐变 + hover 微亮）。
- 入场动画：mascot 从下方淡入上浮 (`translateY(20px)→0`)，气泡延迟 200ms `scale(0.6) opacity-0 → scale(1) opacity-1`，按钮延迟 400ms 淡入。出场反向。
- 点遮罩或按钮都可关闭，写入 `sessionStorage[spirit_greeted_session]=1`。
- 不再保留默认的右上关闭叉（气泡云本身就是非正式 UI，叉破坏氛围）；按 ESC 仍可关。
- 移动端 440 宽自适应：mascot/气泡宽度 `min(86vw, 320px)`，文字自动换行，按钮 `w-[200px]`。

### 技术细节

```text
SpiritGreetingDialog
├─ Overlay  fixed inset-0 bg-black/55 backdrop-blur-sm
└─ Content  fixed inset-0 flex flex-col items-center justify-center gap-0 p-6
    ├─ <SpiritMascot size=200> + ground-glow
    ├─ <BubbleSvg> w-[min(86vw,320px)]
    │   tail 朝上、对齐 mascot 嘴部 (≈中线偏左 6%)
    │   内嵌 <foreignObject> 或绝对定位 div 放文字
    └─ <button> 好的，知道啦
```

---

## B. 抽屉仪表盘加载越来越慢——根因 + 修复

### 根因（已逐文件核查）

1. **重复请求**：`FloatingDashboard` 只为了那个红点徽标，就调用了 `useNotifications()` 和 `useTasks()`；抽屉打开后 `DashboardInner` 里**再分别调一次**。两个 hook 都不是 Provider 共享，是各自独立 state，所以**所有查询都跑了两遍**，并且 `useTasks` 还开了**两条 realtime channel**（`exp-pending-${user}-${uuid}`，uuid 每次都不同）。

2. **`useDashboardData` 重型并发**：单次加载 **15+ 并发 Supabase 查询**（profile / shift_schedules / shop_shifts / user_experience / check_ins / sop / qa / daily / 4×count / scanRows / community_posts / 管理员 pendingPosts），随后再串行查同事 profiles + social profiles。命中 RLS 后 Postgres 端会被这一波并发压住。

3. **`useDashboardData` 依赖不稳定导致重复触发**：`load = useCallback(..., [user, can])`，`can` 是 `useCallback([perms])`，每次 `perms` 引用变都会重生成 → `load` 变 → `useEffect` 再跑一次完整加载。

4. **每次打开抽屉都全量重拉**：`DashboardInner` 走 lazy import，但**首屏即触发** `useDashboardData(true)`，无任何缓存/失效策略；用户开-关-开多次，每次都 15 路并发。

5. **每个 Tab 用的数据不一样**，但当前一次性把所有 Tab 数据都拉完了。比如用户只看"今日"，却也拉了"任务/消息/排班/管理员待审"全部数据。

### 修复（分四步，逐步合入）

**B1. 共享 hook，消灭重复请求**
- 把 `useNotifications` 和 `useTasks` 包成 Provider：
  - `src/hooks/useNotifications.tsx`（改造为 `NotificationsProvider` + `useNotifications()`）
  - `src/hooks/useTasks.tsx`（改造为 `TasksProvider` + `useTasks()`）
- 在 `MainLayout` 外层挂 `<NotificationsProvider><TasksProvider>...`，让浮窗和抽屉共享同一份数据 + 同一条 realtime channel。
- 预期效果：抽屉打开时不再重复触发 5+ 查询、不再多开 channel。

**B2. 稳定 `load` 依赖**
- `useDashboardData` 内：把 `isAdmin` 计算放进 `load` 里通过 `can.current` 或读取 `permissions.has(...)` 而不是依赖 `can`；`useCallback([user])` 即可。
- 或者：把 `can('correction.review') || can('user.create')` 的结果用 `useMemo([permissions])` 提前算成布尔，`load` 依赖该布尔而非 `can` 函数引用。

**B3. 加载缓存 + 节流**
- 在 `useDashboardData` 模块作用域加一个 `cacheRef` Map（key=user.id, value={data, ts}）：
  - 打开抽屉时先 `setData(cache)` 立即显示，再后台 `load()` 刷新。
  - 60 秒内重复打开不再触发完整 load，仅显示缓存。
- 暴露 `refresh()` 给用户主动下拉刷新（已有，TasksPanel 领奖后会 `data.refresh()` — 保留）。

**B4. 按 Tab 懒加载（最有效）**
- 把 `useDashboardData` 拆成 4 个小 hook（或 1 个带选项的 hook）：
  - `useDashToday(enabled)`：profile / todayShift / weekShifts / colleagues / exp / checkin / learning / stats — 默认开启（今日 Tab）。
  - `useDashTasks(enabled)`：已经在 `useTasks` Provider 里。
  - `useDashMessages(enabled)`：已经在 `useNotifications` Provider 里。
  - `useDashSchedule(enabled)`：weekShifts 复用 today；这个 tab 内的 30 天列表保持原 `SchedulePanel` 自己拉。
- 仅在用户切到对应 Tab 时把 `enabled` 置 true。
- 这样首屏只跑 ~6 个查询而不是 15+，速度可见提升。

### 验证
- 打开仪表盘 Tab：打开 Network 面板，确认请求数从 30+ 降到 ≤ 10（首次）/ 0~1（60s 内再次打开命中缓存）。
- `useTasks` realtime channel 在整个 session 只有 1 条。
- 切换 Tab 时才发起对应数据请求。
- 抽屉关闭/再打开应"秒开"。

---

## 范围与不动的部分
- 不改后端、不改 SQL、不改 RLS、不改 edge function。
- 不改抽屉外观、底部 Tab、对话面板。
- B 步骤先做 B1+B2+B3（受益最大、风险最低），B4 视效果再追加（如果你想先看 B1-B3 效果再决定是否拆 hook，我可以分两次提交）。

---

## 交付步骤

1. 重写 `SpiritGreetingDialog.tsx`（A 全部）。
2. 把 `useNotifications` / `useTasks` 改 Provider 并在 `MainLayout` 挂载（B1）。
3. `useDashboardData` 稳定依赖 + 60s 缓存（B2 + B3）。
4. （可选）按 Tab 拆 hook 懒触发（B4）。
5. 在预览里刷新验证：Network 面板请求数、抽屉开启耗时、问候弹窗观感。
