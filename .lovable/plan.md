## 目标
还原"明天"卡片：只把左侧日期列那一小块加深色背景做提醒，其他部分（卡片本体、右侧休息徽章、A班/B班同事行）全部恢复成和其他日期一模一样的浅色样式。

## 改动范围
仅一个文件：`src/components/me/MyScheduleList.tsx`

## 具体调整

1. **撤回上一次给 `<Card>` 加的深色样式**
   - 移除 `bg-foreground text-background border-foreground shadow-lg ring-1 ring-foreground/10`。
   - 卡片回到默认（有班次时默认背景，没班次时 `bg-muted/30`），和 6/14、后天那两张完全一致。

2. **撤回所有内部文字反色**
   - 日期数字、星期、班次名、"休息"徽章、A/B/C 班同事行、"门店当日无排班" → 全部恢复成原来的 `text-foreground` / `text-muted-foreground` / `bg-secondary`，不再根据 `isTomorrow` 切换颜色。

3. **保留并强化左侧"明天"色块**
   - 把左侧日期列（`w-14` 那个 div）单独包一层深色背景：圆角 + `bg-foreground text-background` + 内边距，视觉上就是用户截图里红框那一块深色票券。
   - 内部"明天"小字 + `6/15` + `周一` 都用浅色（`text-background` / `text-background/70`）。
   - 仅 `isTomorrow` 时套用这层深色样式；其他日期左侧列保持原来的纯文字。

4. **"明天"二字的位置**
   - 放在该深色块顶部（粗体大字），下面是 `6/15` 和 `周一`，呼应截图。

## 不改动
- 仪表盘 SchedulePanel、ShopScheduleList、数据查询、其他日期视觉，全部保持现状。

## 验收
- `/me` → 我的排班：只有"明天"那张卡的左侧日期列是深色票券，卡片其余部分和 6/14、后天完全一致。
