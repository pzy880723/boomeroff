## 问题定位

`SchedulePanel` 之所以一个同事都不显示，是因为获取「同店同事排班」的查询只在用户的 `staff_profiles.shop_id`（默认门店）存在时才触发：

```ts
defaultSid ? supabase.from('shift_schedules')...eq('shop_id', defaultSid)... 
           : Promise.resolve({ data: [] })
```

当前账号的 `staff_profiles` 里 **没有绑定 shop_id**（实际行数 0），所以 `allRows = []`，`peersByDate` 全空，30 张票根都不会渲染同事行。

但数据库里 5/18 上海中信泰富店其实有 3 个同事在班、5/19 同店也有同事，应该显示。

## 修复方案（仅改前端，单文件）

文件：`src/components/me/SchedulePanel.tsx`

### 1. 不再依赖默认门店来取同事

把"取同店排班"改成基于用户实际排班里出现过的所有门店：

- 先取 `mine`（本人 30 天排班）+ `defaultSid`（如果有的话）
- 汇总成 `shopIds = unique([defaultSid, ...mine.map(m => m.shop_id)].filter(Boolean))`
- 用 `shift_schedules.select(...).in('shop_id', shopIds).gte/.lte(date)` 一次拉回所有相关同事排班

这样：
- 用户绑定了门店 → 行为不变
- 用户没绑门店但有排班 → 按"那天我在哪家店"反查同事
- 用户那天休息且没有任何排班 → 该日仍空（符合预期，无门店锚点）

### 2. 同事行的展示规则保持不变

- 排除自己
- A → B → C → 其它 顺序
- 每个班次一行：`A 班 · 张三、李四`
- 票根右侧 body 底部展示，虚线分隔

### 3. 默认门店名展示兜底

如果 `defaultSid` 为空，header 不再尝试显示默认门店（本来就没用到，保持现状）。

## 不动的部分

- 数据库 / RLS / hooks 都不动
- 票根左侧"今天/明天/后天"大字 + 日期、暗色 stub 配色保持
- 仅 `SchedulePanel.tsx` 一处改动