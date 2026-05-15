## 在原计划基础上,新增/调整以下内容

### 1. 修复右上角重复 X
当前 `Sheet` 内 `SheetContent` 自带一个 X 关闭按钮,我又额外加了一个 `<button>...<X /></button>`,导致重复。
- 删除 hero 区里的自定义 X 按钮
- 用自定义 `SheetContent` 变体或直接覆写,把右上角默认 X **整体隐藏**(后面改成底部"收起"按钮)

### 2. 全屏显示
- 抽屉从 `h-[88vh]` 改为 `h-screen w-screen rounded-none border-none inset-0`
- 顶部 hero 加 `pt-[env(safe-area-inset-top)]`,底部加 `pb-[env(safe-area-inset-bottom)]`
- 内容区可滚动,底部"收起"按钮 fixed 不动

### 3. 每日打气标语 (Daily Motivational Quote)
**实现方式**:本地静态数组 + 按日期取模,无需后端,完全离线。
```ts
// src/lib/dailyQuote.ts
const QUOTES = [
  '今天也是为顾客带来惊喜的一天 ✨',
  '每一件中古都有故事,你就是讲故事的人 📖',
  '慢一点没关系,准确比快更重要 🎯',
  '认真对待每一次识物,你的眼力会越来越准 🔍',
  // ... 共 60 句,覆盖两个月不重复
];
export function quoteOfDay(): string {
  const epoch = Math.floor(Date.parse(todayShanghai()) / 86400000);
  return QUOTES[epoch % QUOTES.length];
}
```
- 显示位置:hero 区"早上好,XX"下方,白底半透明卡片 + `Sparkles` 图标
- 字号 `text-sm font-medium`,带轻微 `animate-fade-in`

### 4. 自动打开逻辑
**触发条件**:每天首次进入应用(任意路由)自动 1 次。
```ts
// FloatingDashboard 内
const KEY = 'dashboard_last_auto_open';
useEffect(() => {
  if (!user) return;
  const today = todayShanghai();
  const last = localStorage.getItem(KEY);
  if (last !== today) {
    const t = setTimeout(() => {
      setOpen(true);
      localStorage.setItem(KEY, today);
    }, 600); // 等数据加载 + 浮标动画就位再弹
    return () => clearTimeout(t);
  }
}, [user]);
```
- **不阻断**:用户手动 setOpen(false) 后当天不再自动弹
- 登出再登录:仍按"今天已弹过"判断(localStorage 不清),避免烦人

### 5. 关闭动画:抽屉 → 浮标(FLIP 动画)
**思路**:关闭时不直接 unmount,先用 transform 把整个 sheet 缩到浮标位置,再隐藏。

实现:
- 自定义 `<DashboardFullscreen>`(不再用 Radix Sheet),用 `framer-motion` 不行就用 CSS:
  - 打开:`scale(0) → scale(1)`,`transform-origin` 设到浮标坐标
  - 关闭:反向 0.35s `cubic-bezier(0.4, 0, 0.2, 1)`
- 浮标位置实时传给抽屉用作 transform-origin:
```css
transform-origin: ${pos.x + 22}px ${pos.y + 22}px;
```
- 关闭过程中浮标保持隐藏,动画结束后再显示(避免视觉双重)
- 用 tailwind keyframe 新增 `dashboard-zoom-in / dashboard-zoom-out`,加进 tailwind.config.ts

### 6. 底部"收起"按钮
- 位置:`fixed bottom-0` 半透明渐变蒙版上方,居中
- 样式:`Button variant="ghost"` + `ChevronDown` 图标 + "收起仪表盘"文字
- 高度 `h-12`,带 `pb-[env(safe-area-inset-bottom)]`
- 同步:用户也可以滑动屏幕,下拉超过 80px 自动触发收起(可选,加分项)

### 7. 顶部不再放 X,改放"仪表盘"标题
- hero 顶部居中:`仪表盘` 大字 + 副标题日期
- 删除右上 X(自定义 + Radix 默认 X 全删)

---

## 文件改动差异(基于上一个 plan 增量)

### 新增
- `src/lib/dailyQuote.ts` — 60 句打气标语 + `quoteOfDay()`
- `src/components/dashboard/DashboardFullscreen.tsx` — 替代 Radix Sheet,自带 zoom 动画 + transform-origin

### 修改
- `src/components/dashboard/FloatingDashboard.tsx`:
  - 自动打开 useEffect (按日期 localStorage)
  - 用 `DashboardFullscreen` 替代 `Sheet`
  - 传浮标当前坐标做 transform-origin
- `src/components/dashboard/cards/HeroSection.tsx`(从 FloatingDashboard 拆出):
  - 标题"仪表盘"
  - 打气标语卡
  - 删除自定义 X
- `tailwind.config.ts` — 加 `dashboard-zoom-in / dashboard-zoom-out` keyframes
- 底部新增 `<DashboardFooterClose />` 收起按钮

### 不变
- 通知系统数据库迁移、4 张卡片结构、边缘吸附浮标 — 维持上一份 plan 不动

---

## 动画核心代码片段

```tsx
// DashboardFullscreen.tsx
<div
  className={cn(
    'fixed inset-0 z-50 bg-background',
    open ? 'animate-dashboard-zoom-in' : 'animate-dashboard-zoom-out pointer-events-none'
  )}
  style={{
    transformOrigin: `${capsuleX + 22}px ${capsuleY + 22}px`,
  }}
  onAnimationEnd={() => { if (!open) onUnmount(); }}
>
  ...
</div>
```

```ts
// tailwind.config.ts keyframes
'dashboard-zoom-in': {
  '0%': { transform: 'scale(0)', opacity: '0', borderRadius: '50%' },
  '100%': { transform: 'scale(1)', opacity: '1', borderRadius: '0' },
},
'dashboard-zoom-out': {
  '0%': { transform: 'scale(1)', opacity: '1', borderRadius: '0' },
  '100%': { transform: 'scale(0)', opacity: '0', borderRadius: '50%' },
},
```

---

## 实现顺序(在原 7 步基础上)

1-7:原计划不变(数据库 + 4 张卡 + 边缘吸附浮标 + 通知系统)
8. 写 `dailyQuote.ts`
9. 写 `DashboardFullscreen` 全屏 + zoom 动画组件,替换 Sheet
10. hero 区 + 底部"收起"按钮 + 删除重复 X
11. 自动打开(按日 localStorage)
12. 更新 `mem://features/floating-dashboard`:加全屏 + 自动打开 + zoom 动画 + 每日标语
