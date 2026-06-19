# 修复活动海报报名入口"网络繁忙"

## 根因

`src/pages/public/PublicActivity.tsx` 违反 React Hooks 规则：

- 第 51–60 行：`useState` 系列
- 第 62 行：`useEffect` 拉取活动数据
- **第 110–125 行：`if (loading) return ...` / `if (error || !activity) return ...` 提前返回**
- **第 138 行：`useMemo(agreementText)` —— 在提前返回之后**

首次渲染处于 loading，命中早返回，跳过 `useMemo`；数据回来后重新渲染走到 `useMemo`，导致 Hooks 数量/顺序变化，React 抛 "Rendered more hooks than during the previous render"。该异常被 `PublicErrorBoundary` 捕获，渲染兜底文案 **"网络繁忙,请稍后再试"**，看上去就像"报名入口进不去"。

实际网络请求（`activity-public` edge function）是成功的，只是页面渲染崩了。

## 修复方案

把 `useMemo(agreementText, [activity, v])` 移到所有早返回之前，并对 `activity` 为空时做兜底（返回空串），保证每次渲染 Hooks 顺序完全一致。

```text
useState × N
useEffect (fetch)
const v = activity?.voucher
const agreementText = useMemo(() => {
  if (!activity) return '';
  ...原逻辑...
}, [activity, v]);

if (loading) return <Loader/>
if (error || !activity) return <活动暂时无法打开/>

// 渲染主体
```

`fmt` 等纯函数不是 hook，可继续保留在条件分支后。`fields / notStarted / ended` 也不是 hook，无需移动。

## 涉及文件

- `src/pages/public/PublicActivity.tsx` —— 仅调整 `useMemo` 位置 + 内部加 `if (!activity) return ''` 兜底。

## 验证

1. 打开任一活动海报二维码 / `/p/activity/:shareToken`，应看到完整报名表单，而不是"网络繁忙"。
2. 浏览器 console 不再出现 "Rendered more hooks than during the previous render"。
3. 填表提交，能正常跳到 `/u/c/:shortCode` 领券页。
