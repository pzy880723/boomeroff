## 智能仪表盘方案

### 一、整体形态

```text
┌──────────────────────────┐         ┌────────┐
│   仪表盘抽屉(展开态)      │  ◀─收起▶│ 🟠 早A │ ← 浮动小胶囊
│                          │         └────────┘
│  Hero: 你好,XX · 今日XX  │              ↕ 可拖动到任意位置
│  ┌─────────┬────────┐    │              ↕ localStorage 记忆
│  │ 排班    │ 打卡   │    │
│  ├─────────┼────────┤    │
│  │ 学习    │ 我的   │    │
│  ├─────────┴────────┤    │
│  │ 待办 / 社交       │    │
│  └──────────────────┘    │
└──────────────────────────┘
```

**两种状态**:
- **胶囊态(默认)**: 圆形头像 + 右侧"早A/中B/晚C/休"小标签 + 未读红点。位于屏幕右下,可拖动到屏幕任意位置(限制在安全区内,自动避开底部 Tab Bar)。
- **展开态**: 点击胶囊弹出底部抽屉(Sheet from bottom,占屏 88vh,可下滑关闭)。

**全局挂载**: 在 `MainLayout` 内挂载 `<FloatingDashboard />`,只对已登录用户显示;`/u`(游客)和 `/portal`(后台)不显示。

### 二、抽屉内容布局(高级感)

按视觉优先级从上到下:

**1. Hero 问候条(顶部)**
- 左侧:头像(48px) + "下午好,XX"(根据时间段)
- 右侧:今日日期 + 农历(可选简化为星期)
- 背景:基于今日班次的渐变色(早班暖橙、中班青绿、晚班深蓝、休息中性灰)

**2. 排班卡(最大、置顶,占 2 列)**
- **今日班次大字**:`早班 A · 09:00–14:00` 或 `今日休息`
- **下一班**: `明日 中班 B · 14:00–21:00`
- **同班同事头像组**: 横向 4-5 个圆形头像,超出折叠
- **本周排班迷你条**: 7 格小方块(A/B/C/休)横向展示
- 点击整卡跳转 `/me`(SchedulePanel)

**3. 打卡 + 等级(合并卡,占 2 列分两半)**
- 左半:`今日已打卡 ✓` 或 `点击打卡` 按钮 + 连续 N 天 🔥
- 右半:等级徽章 Lv.5 + 经验进度环 + "距 Lv.6 还差 120 exp"

**4. 学习卡片(横向滑动 carousel)**
- 卡片 1:今日 SOP 速览(从 shop_kb_entries type=sop 随机 1 条)
- 卡片 2:今日 Q&A(type=qa 随机 1 条)
- 卡片 3:每日中古小知识(daily_knowledge 当日)
- 每张卡片右上角"展开"图标,点击进对应详情页

**5. 我的数据(2×2 数字卡)**
- 本周识图 N 次(对比上周 ↑12%)
- 本周收藏 N 个
- 本周发布 N 条
- 7 日识图迷你折线图(sparkline)

**6. 待办与社交(按角色区分)**
- **管理员**: 待审纠错 N · 待审分享 N · 待审新成员 N(每项一个紧凑行,带角标)
- **普通店员**: 中古圈最新 3 条同事动态缩略(头像+一句+图);"昨日全店共识图 N 件"

### 三、浮动胶囊交互细节

- **形态**: 圆角 9999、阴影 elegant、宽 88px 高 44px、含 32px 圆头像 + 班次小标签;无班次显示"📋"图标。
- **拖动**: HTML5 pointer events,记录 left/top 到 `localStorage.dashboard_pos`。拖动时 80% 透明度;松手贴合屏幕边缘 12px 边距 clamp。
- **点击 vs 拖动**: 移动距离 < 5px 视为点击 → 展开;否则视为拖动结束。
- **未读红点**: 当存在 待办>0 / 当日未打卡 / 有新班次变更 时显示。
- **避让**: 自动避开 BottomTabBar(高 64px)和 iOS 安全区。
- **进入动画**: 首次登录从右下滑入 + scale 弹性。

### 四、技术实现

**新增文件**:
- `src/components/dashboard/FloatingDashboard.tsx` — 胶囊 + 抽屉容器,管理拖拽与开合状态
- `src/components/dashboard/DashboardCapsule.tsx` — 胶囊视觉
- `src/components/dashboard/panels/ScheduleHeroCard.tsx` — 排班大卡
- `src/components/dashboard/panels/CheckInLevelCard.tsx` — 打卡+等级合并
- `src/components/dashboard/panels/LearningCarousel.tsx` — 学习轮播
- `src/components/dashboard/panels/MyStatsCard.tsx` — 我的数据
- `src/components/dashboard/panels/TodoSocialCard.tsx` — 待办/社交(角色分流)
- `src/hooks/useDashboardData.ts` — 一次并行拉取所有数据(React Query 缓存 60s)

**修改文件**:
- `src/components/layout/MainLayout.tsx` — 挂载 `<FloatingDashboard />`(仅登录用户)
- `mem://index.md` + 新建 `mem://features/floating-dashboard` 记忆

**复用**:
- 排班数据复用 `MyScheduleList` 的取数逻辑(shift_schedules + shop_shifts join)
- 打卡用现成 `perform_check_in` RPC + `user_experience` 表
- 等级用 `src/lib/level.ts`
- 学习卡用 shop_kb_entries / daily_knowledge
- 数据卡复用 Me 页 stats 查询

**样式**:
- 全部使用 design tokens(bg-card / text-foreground / shadow-elegant / 渐变 var(--gradient-primary))
- 抽屉用 `Sheet` from `@/components/ui/sheet` side="bottom"
- 拖拽用原生 pointer events,无新依赖

**性能**:
- 抽屉内组件全部 React.lazy + Suspense,胶囊关闭时不渲染面板内容
- useDashboardData 用 Promise.all 并行 6 个轻查询,~200ms 内完成
- 拖拽位置存 localStorage,不写库

**无需数据库迁移**: 所有数据来自现有表。

### 五、不在本次范围

- 不新增 /home 路由(用全局浮窗)
- 不改动现有 Scan/Me 页面布局
- 不做 Web 推送/桌面提醒
- 游客版 /u 不展示