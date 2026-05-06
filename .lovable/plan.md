## 目标
重新设计 `OfficialDetail.tsx` 中的「深度阅读」卡片：让 Markdown 正文展开后排版更易读；将展开/收起按钮放到卡片下边缘正中央。

## 改动文件
仅 `src/pages/OfficialDetail.tsx`，第 393-412 行（深度阅读卡片）。

## 视觉设计

### 折叠态
```text
┌──────────────────────────────┐
│ 📖 深度阅读                   │
│  长文正文预览（max-h ~ 9rem）│
│  …渐隐遮罩…                   │
├────────[ 展开 ▼ 1234字 ]──────┤  ← 居中骑边按钮
└──────────────────────────────┘
```

### 展开态
```text
┌──────────────────────────────┐
│ 📖 深度阅读                   │
│                               │
│  完整 Markdown 正文           │
│  （优化排版：见下）            │
│                               │
├────────[ 收起 ▲ ]─────────────┤
└──────────────────────────────┘
```

## 排版优化（Tailwind prose 调整）
- 容器：`px-5 py-5`，整体增加 `max-w-none` + 行高 `leading-7`，正文字号 `text-[15px]`。
- 标题层级：
  - `prose-h1:text-lg prose-h1:font-semibold prose-h1:mt-5 prose-h1:mb-2 prose-h1:pb-1.5 prose-h1:border-b prose-h1:border-border`
  - `prose-h2:text-base prose-h2:font-semibold prose-h2:mt-5 prose-h2:mb-2 prose-h2:text-foreground`
  - `prose-h3:text-sm prose-h3:font-semibold prose-h3:mt-4 prose-h3:mb-1.5 prose-h3:text-muted-foreground prose-h3:uppercase prose-h3:tracking-wide`
- 段落间距：`prose-p:my-3 prose-p:leading-7`
- 列表：`prose-ul:my-3 prose-ul:pl-5 prose-li:my-1 prose-li:leading-7 prose-ol:pl-5`
- 强调 / 链接：`prose-strong:text-foreground prose-strong:font-semibold prose-a:text-primary prose-a:underline-offset-2`
- 引用块：`prose-blockquote:border-l-2 prose-blockquote:border-primary/40 prose-blockquote:bg-muted/40 prose-blockquote:py-1 prose-blockquote:px-3 prose-blockquote:not-italic prose-blockquote:text-foreground/90 prose-blockquote:rounded-r`
- 代码：`prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none`
- 分隔线：`prose-hr:my-6 prose-hr:border-border`
- 图片：`prose-img:rounded-lg prose-img:my-4`

## 按钮位置（卡片下边缘居中）
- 卡片改为 `relative pb-7`（给底部按钮留空间）。
- 移除右上角原按钮。
- 标题区只保留：`<BookOpen className="w-4 h-4" /> 深度阅读 · {item.body.length}字`。
- 在卡片底部新增：
  ```tsx
  <button className="absolute left-1/2 -translate-x-1/2 -bottom-3.5 inline-flex items-center gap-1 h-7 px-3 rounded-full border border-border bg-card text-xs text-muted-foreground hover:text-foreground hover:bg-accent shadow-sm" />
  ```
  内容：折叠态 `展开全文 ▾`，展开态 `收起 ▴`。
- 折叠态高度从 `max-h-40` 调到 `max-h-44`，渐隐遮罩保留。

## 不在范围
- 不动其他卡片样式、不动小贴士/卖点/AI 聊一聊。
- 不改数据结构、不改 ReactMarkdown 渲染器。

