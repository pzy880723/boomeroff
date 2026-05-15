## 仪表盘 v3 高级版 — 重新排版

主要诉求:
1. 整体更"高级"(克制留白 / 层次分明 / 不堆砌色块)
2. 打气标语放大成视觉主角
3. 排班醒目化(从一行小字升级成大色块 Hero 卡)
4. 卡片不变,只重排版与视觉权重

---

### 一、整体风格基调

- 背景从"hero 渐变 + 灰底"改为 **纯净米白 / 暗色单色底**,所有"高级感"靠卡片之间的呼吸 + 字体层级
- 字体层级清晰:超大 display 标题 > 中号正文 > 小号注释,**只用 3 档字号**,避免视觉噪音
- 颜色克制:主色仅用于「打气标语」「打卡按钮」「未读红点」三处,其它一律灰阶
- 卡片统一 `rounded-2xl border-border/50 bg-card`,**去掉所有渐变 hero**,靠投影 + 边距分层
- 卡片内不再用彩色小图标方块(琥珀色/绿色背景块),改为统一 `text-muted-foreground` 单色线性图标

---

### 二、新版结构(从上到下)

```text
┌─────────────────────────────────────┐
│  仪表盘 (display 24px)              │  ← 顶栏:左标题 + 右日期+问候
│  5/15 周五 · 下午好,Joe              │
├─────────────────────────────────────┤
│                                     │
│   "今天也是为顾客带来惊喜的一天 ✨"   │  ← 打气卡 Hero
│   (text-2xl font-display 20-24px)   │      字号放大 2 倍
│                                     │      浅色背景渐变 + 大留白
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ [E班 色块] 早班 09:00–14:00     │ │  ← 排班 Hero 卡 (新增最显眼)
│ │ 同班同事 · ●●● +2              │ │      色块用 shift.color
│ └─────────────────────────────────┘ │      高 ~80px
├─────────────────────────────────────┤
│ ⚡ 今日运营            ↑ 12%        │
│ [大号一键打卡 / 已打卡状态]          │  ← 数字三联区改为更大字号
│ 本周识物 24 / 收藏 3 / 发帖 1        │     带 sparkline 在底部
│ ▁▂▃▅▇▆▃                            │
├─────────────────────────────────────┤
│ 📢 系统通知   3未读  · 全部已读      │  ← 通知区(去掉今日班次行,
│ ● 公告标题 1                       │     已合并到顶部排班卡)
│   公告内容预览…                     │
├─────────────────────────────────────┤
│ 📚 今日学习                         │
│ [SOP / Q&A / 中古小知识 横向轮播]    │
├─────────────────────────────────────┤
│ ✅ 待办与动态                       │
│ ...                                 │
└─────────────────────────────────────┘
        [收起仪表盘 ⌄]   ← 底部固定
```

---

### 三、关键改造点

#### 1. 顶栏(替换原 hero 渐变区)
- 去掉 `bg-gradient-to-br from-primary/15`
- 仅保留:`px-5 pt-5 pb-3` + 左侧 "仪表盘" 大标题 + 右侧小字"5/15 周五 · 下午好,Joe"
- 不再放图标方块

#### 2. 打气标语 Hero(放大 2 倍)
- 独立成区,不再嵌在 hero 内
- `text-xl font-display font-semibold leading-snug`(原 text-sm,字号约提升 2 倍)
- 卡片样式:`rounded-2xl bg-gradient-to-br from-primary/8 via-primary/4 to-transparent border-primary/15 px-6 py-7`
- `Sparkles` 图标放大到 w-6 h-6,放右上角而非左侧
- 整张卡可点击 → 不跳转,仅做视觉锚点

#### 3. **排班 Hero 卡(新增,最醒目)**
- 紧接打气卡下方,独立大卡
- 左侧 56×56 圆角色块(用 `data.todayShift.color` 作背景,白字显示班次代号 `E`,字号 `text-2xl font-bold`)
- 右侧上下两行:
  - 上:`早班` (`text-base font-semibold`) + `09:00–14:00` (`text-sm tabular-nums text-muted-foreground`)
  - 下:同班同事头像堆叠(最多 4 个 -ml-2)+ 文字 "+2 同事在岗"
- 休息日:整张卡变浅灰背景 + 大字"今日休息 🌿 好好放松"
- 点击 → 跳转 `/me`(排班 tab)

#### 4. 通知卡精简
- 移除原本嵌在通知卡里的"今日班次提醒"行(已升级为独立 Hero)
- 标题栏更克制,未读数字徽章统一使用主色而非 destructive
- 通知列表项左侧蓝点改为 1px 左侧色条(更高级)

#### 5. 今日运营卡
- 一键打卡按钮:从橙色渐变改为 `bg-foreground text-background h-12 rounded-xl`(纯黑/纯白,极简)
- 数字三联:字号从 `text-base` 提升到 `text-2xl font-display`,数字下方小字 `text-[10px] uppercase tracking-wider text-muted-foreground`
- sparkline 从蓝色柱状改为 1px 灰线 + 末点高亮主色(更线性高级)
- 趋势 badge:从 `Badge variant=default` 改为纯文字 `↑ 12%`,主色 / 灰色

#### 6. 学习卡 & 待办卡
- 标题图标方块去掉(改为单色线性图标 + 文字)
- 卡片间距从 `space-y-3` 调整到 `space-y-4`(更呼吸)

#### 7. 字体
- 在 hero 标题、打气标语、数字三处使用 `font-display`(项目已有 SC display 字体)
- 其它正文 `font-sans`

---

### 四、文件改动

**修改:**
- `src/components/dashboard/FloatingDashboard.tsx`
  - 重写 `DashboardFullscreen` 顶栏(去渐变,纯标题)
  - 新增 `QuoteHero` 子组件(放大版打气标语)
  - 新增 `ShiftHeroCard` 子组件(排班大卡 + 同事头像)
  - 重写 `TodayOpsCard`(数字放大,按钮极简化,sparkline 线性化)
  - 精简 `NotificationCard`(移除内嵌班次行)
  - 调整 `LearningCard` / `TodoActivityCard` 标题视觉

**不变:**
- 数据库 / `useDashboardData` / `useNotifications` / 通知系统逻辑
- 浮标本体 + 边缘吸附 + 自动打开 + zoom 动画
- `dailyQuote.ts` 内容
- `tailwind.config.ts` keyframes

---

### 五、技术细节

```tsx
// 排班 Hero 卡 — 关键样式
<Card className="p-4 flex items-center gap-4 border-border/50">
  <div
    className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-md shrink-0"
    style={{ backgroundColor: shift.color || 'hsl(var(--primary))' }}
  >
    {shift.code}
  </div>
  <div className="flex-1 min-w-0">
    <div className="flex items-baseline gap-2">
      <span className="text-base font-semibold">{shift.name}</span>
      <span className="text-sm text-muted-foreground tabular-nums">
        {formatShiftTime(shift.start_time, shift.end_time)}
      </span>
    </div>
    {colleagues.length > 0 && (
      <div className="flex items-center gap-2 mt-1.5">
        <div className="flex -space-x-2">
          {colleagues.slice(0, 4).map(c => (
            <Avatar key={c.user_id} className="w-6 h-6 border-2 border-background">
              <AvatarImage src={c.avatar_url || undefined} />
              <AvatarFallback className="text-[9px]">{c.display_name[0]}</AvatarFallback>
            </Avatar>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{colleagues.length} 位同事在岗</span>
      </div>
    )}
  </div>
  <ChevronRight className="w-4 h-4 text-muted-foreground" />
</Card>
```

```tsx
// 打气 Hero — 字号放大
<div className="rounded-2xl bg-gradient-to-br from-primary/[0.08] via-primary/[0.04] to-transparent border border-primary/15 px-6 py-7 relative overflow-hidden">
  <Sparkles className="absolute top-4 right-4 w-5 h-5 text-primary/60" />
  <p className="text-xl font-display font-semibold leading-snug text-foreground pr-8">
    {quote}
  </p>
</div>
```

预计净改动 +120 / -80 行,集中在 `FloatingDashboard.tsx` 一个文件内。
