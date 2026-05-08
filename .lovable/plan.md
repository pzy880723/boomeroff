## 问题
`KnowledgeRichEditDialog`（编辑词条）的「取消/保存」底栏在小屏（如 390×585）下没有真正贴底，反而出现在表单中段。

## 原因
`src/components/library/KnowledgeRichEditDialog.tsx` 中：

```text
DialogContent  (max-h-[90vh] flex flex-col)
├── DialogHeader
├── div.flex-1.overflow-y-auto         ← 表单滚动区
└── div.sticky.bottom-0                ← 「取消/保存」底栏
```

问题点：
1. 中间滚动区缺 `min-h-0`，在 flex 列布局里 `flex-1` 默认 `min-height: auto`，子元素一旦比父高，滚动区就被内容撑开，把后面的底栏推出 90vh 之外。
2. 底栏写了 `sticky bottom-0`，但它的祖先里没有真正可滚动的容器（DialogContent 本身不滚动），sticky 退化成 static，于是被「挤到」滚动区下方某处显示。

## 方案（仅改 KnowledgeRichEditDialog.tsx）

1. 给中间滚动区加 `min-h-0`，让它在 flex 容器里能正确收缩并触发自身的 `overflow-y-auto`。
2. 底栏不用 sticky，改为正常 flex 子项 + `shrink-0`，自然贴在 DialogContent 底部（因为中间区已会滚动）。
3. 顺便确认 DialogContent 的 `max-h-[90vh] flex flex-col gap-0` 不变；若有兼容问题再追加 `h-[min(90vh,calc(100dvh-2rem))]` 兜底。

具体改动（≈ 3 行）：

```diff
- <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-3">
+ <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 space-y-3">
  ...
- <div className="sticky bottom-0 shrink-0 bg-background border-t px-6 py-3 flex gap-2">
+ <div className="shrink-0 bg-background border-t px-6 py-3 flex gap-2">
```

## 不动的部分
- 「删除此词条」仍放在表单最底（不固定，需滚到底）— 这条上次已确认，不变。
- 弹窗结构、字段顺序、保存逻辑都不动。
