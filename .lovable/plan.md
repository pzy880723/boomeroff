## 首页顶部区域微调

在 `src/pages/Home.tsx` 做三处调整，只动展示层。

### 1. 姓名右侧显示日期
把 header 下方的问候行改成三段布局：

```text
[你好，陆哥  周四 · 11/13]                [快速打卡]
```

- 在 `你好，{name}` 后面加一小段灰色文字：`周X · M/D`（`Asia/Shanghai` 时区，`Intl.DateTimeFormat('zh-CN', { weekday:'short', month:'numeric', day:'numeric' })`）。
- 姓名与日期同一行，姓名超长时先截断姓名，日期保持可见。

### 2. 问候语单行显示
把 `encouragement` 那段 `<p>` 从多行改成单行：
- 去掉 `leading-relaxed`，加 `truncate whitespace-nowrap overflow-hidden`。
- `<Sparkles />` 图标保留在开头。
- 文案本身不改（由 `daily_encouragement` / edge function 生成），仅通过 `truncate` 保证不换行；过长的部分尾部省略。

### 3. Banner 下方始终显示"我的排班"
当前逻辑：`nextShift` 为空时整卡隐藏。改为始终渲染 `SectionCard`：

- 有 `nextShift`：保持现状（日期 + 班次 Badge）。
- 无 `nextShift`：显示占位文案「近期暂无排班」+ 右侧「去查看」跳 `/me`。
- 卡片位置保持在 Banner 之下、活动条幅之上，不动其他区块。

### 不改动
- 打卡按钮、Banner、活动、AppGrid、OKR、Feed Tabs 都不动。
- 不改数据获取逻辑，只在 `nextShift` 分支加空态 UI。
