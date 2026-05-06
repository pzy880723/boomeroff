## 改动文件
`src/pages/MyLibrary.tsx` 顶部「今日测试任务」卡片重排版。

## 新布局（单行 header + 可展开推荐列表）

```text
┌────────────────────────────────────────────────────────┐
│ ✨ 今日测试任务  ▓▓▓▓▓░░░ 0/11   [开始测试]  ▾       │
└────────────────────────────────────────────────────────┘
   ↑ 默认折叠：今日推荐列表/百分比文案 全部隐藏
```

- 把卡片压成单行 header，去掉原来 `border-b` 分隔 + `p-4 space-y-3` 的大块内容区。
- 标题右侧并排一条细进度条（`Progress h-1.5 w-20`），紧接 `0/11` 徽标，再接「开始测试」按钮和折叠箭头。
- 「已掌握 0%」大数字、`Progress h-2` 大条、推荐 N 条说明、`<ul>` 推荐列表 → 统一塞进折叠区，默认 `expanded = false`。
- 点击 header 任意空白或箭头切换展开；点「开始测试」按钮直接进入测试，不触发展开。
- `todayDone` 状态依旧在折叠区里展示「全部知识已掌握」。
- 空数据态（`totalCount === 0`）保留单行提示，不显示进度条/按钮。

## 技术细节

- 新增 `const [taskExpanded, setTaskExpanded] = useState(false);`
- 新增 `ChevronDown` 图标（已 import lucide）。
- 进度条改用 `Progress value={percent} className="h-1.5 w-16 sm:w-24"`，放在 header flex 容器里。
- header 用 `<button>` 包裹整体以保证可点击切换；「开始测试」按钮 `onClick` 加 `e.stopPropagation()`。
- 折叠区用条件渲染 `{taskExpanded && (...)}`，不需要动画库即可，加个 `border-t` 视觉分隔。
