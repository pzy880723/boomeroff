## 修改范围

只改 `src/components/me/SchedulePanel.tsx`，不动数据库、不动 hook、不动暗色票根配色。

## 票根左侧（stub）改版

只改前 3 天票根（index 0/1/2）：

- 大字（最突出）：`今天` / `明天` / `后天`
- 下面小字：日期 `5/18` + 周几 `周一`
- 删除原来的 `TODAY / NEXT / UPCOMING` 英文

展开后的第 4~30 天保持原样（`周X` + 日期）。

## 票根右侧（body）改版（所有 30 天票根都改）

每张票根右侧改为多行结构：

- 第一行：班次徽章 `A/B/C` + 时间 `09:00–18:00`（休息日则显示 `休息`）
- 第二行：门店名 `上海中信泰富店`
- 第三行（新增，**所有票根**都显示）：当天同店一起上班的同事姓名，按班次分组：
  - `A 班 · 李帆`
  - `B 班 · 悦悦、Lifan_`
  - `C 班 · …`

排除自己；A/B/C 按字典序排；每个班次同组无人则不显示该行；如果当天该门店完全无人或未绑定门店，则不显示同事行（休息日空白即可）。

## 数据来源

`allRows`（同店 30 天内所有人排班）+ `peerNameMap` 已经在 hook 里，按 `work_date` 过滤即可。

`PeerStrip` 旧组件删除（其内容已并入每张票根的同事行）。

## 技术细节

- `TicketRow` 新增入参：
  - `peersByCode: { code: string; names: string[] }[]`（已按 A→B→C→其它 排序、去重姓名、排除自己）
- `SchedulePanel` 主组件统一计算 `Map<date, peersByCode>`，传给所有 `TicketRow`。
- 票根从固定 `h-20` 改为 `min-h-20 h-auto`，让同事行能撑开。
- 同事行样式：`text-[11px] text-muted-foreground`；班次字母小高亮（A=accent、B=accent、C=destructive）。
- 不动 `ShiftBadge` 内部样式、不动展开按钮、不动 hook 查询、不动暗色配色 token。