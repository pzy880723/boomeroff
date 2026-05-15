## 目标

当店员经验跨过一个等级阈值时，全局弹出一个升级庆祝弹窗，展示：新等级 / 新称号 / 本次升级获得的经验数（delta）。

## 方案

使用 Realtime 订阅 `user_experience` 表，监听当前用户的 `total_exp` 变化；在客户端用 `getLevelInfo` 比较旧/新等级，等级提高时弹窗。`localStorage` 兜底持久化"上次看到的经验值"，避免页面刷新丢失基线，也避免同一次升级被多次触发。

## 改动

### 1. 数据库迁移（一次性）

让 `user_experience` 进入 realtime publication（其它表已用类似模式）：

```sql
ALTER TABLE public.user_experience REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_experience;
```

不修改 RLS（已有 `auth.uid() = user_id` SELECT 策略，realtime 会按 RLS 过滤）。

### 2. 新组件 `src/components/system/LevelUpWatcher.tsx`

挂在 `MainLayout` 顶层（用户已登录区域）。逻辑：

- 启动时：
  - 从 `user_experience` 拉一次当前 `total_exp`
  - 读 `localStorage` 里 `level_up_baseline_exp_<userId>`；若不存在则写入当前值（首次运行不弹窗）
- 订阅 realtime postgres_changes：`schema=public, table=user_experience, filter=user_id=eq.<uid>, event=UPDATE`
- 收到新 `total_exp` 时：
  - 读取基线 `prev`，计算 `prevLevel = getLevelInfo(prev).level`、`newLevel = getLevelInfo(new).level`
  - 若 `newLevel > prevLevel`：打开 Dialog，传入 `{ newLevel, newTitle, gainedExp = new - prev }`
  - 无论是否升级，更新基线为新值（避免重复触发）
- 弹窗 UI：`Dialog` + 简洁庆祝样式
  - 标题"等级提升 🎉"
  - 中央大号 `Lv.{newLevel}` + 称号
  - 一行"本次获得 +{gainedExp} 经验"
  - 一个"知道了"按钮（关闭弹窗）
  - 主色用 `bg-primary`、动画用现有 `animate-fade-in`，不引入新依赖
- 全中文文案，符合"店员"口径

### 3. 在 `src/components/layout/MainLayout.tsx` 挂载 `<LevelUpWatcher />`

仅在用户已登录时渲染（沿用 layout 现有判断）。

## 不做的事

- 不改经验加分逻辑（已有 triggers/RPC 都没动）
- 不动浮窗里的等级卡（仅做"事件触发的庆祝弹窗"补充）
- 不做音效/烟花特效（保持轻量；用纯 Tailwind 动画即可）

## 验证

- 手动给测试账号 `add_experience` 跨过一个阈值（如从 14 → 16，跨过 Lv.2 阈值 15），应弹窗显示「Lv.2 入坑学徒」+「本次获得 +N 经验」
- 刷新页面后不再重复弹同一次升级
- 同一次会话连续升两级（一次 delta 跨过两档），仍按"达到的最终等级"显示一次弹窗