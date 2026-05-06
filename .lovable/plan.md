## 目标

保留默认折叠交互，只在排版上做克制的改进 —— 让标题和正文有清晰差异，章节有呼吸感，价格更显眼。**不引入卡片化、不加图标、不加导航。**

## 改动点（只改 OfficialDetail.tsx 那一段 prose 样式）

### 1. 标题层级拉开

- `h2`：`text-base font-semibold text-foreground`，左侧加 `border-l-2 border-primary/60 pl-2.5`，作为章节起点的视觉锚点
- `h2` 上下间距加大：`mt-6 mb-2.5`，章节之间断开更明显
- `h3`（如有）：`text-sm font-medium text-foreground`，去掉当前的"灰色 muted"样式（之前太弱看不出是标题）

### 2. 正文更易读

- 正文字号保持 `text-[15px]`，行高从 `leading-7` 提到 `leading-[1.85]`（中文长段更舒服）
- 段落 `my-3` → `my-3.5`
- 段落首行缩进**不加**（移动端长行缩进反而碎），改为段间距处理

### 3. 价格自动加粗

在渲染前用一次正则把价格金额包成 `**...**`：
```ts
body.replace(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:元|人民币|日元|円|RMB)|\d+\s*-\s*\d+\s*元)/g, '**$1**')
```
然后让 `prose-strong` 用 `text-primary font-semibold`，价格立刻跳出来。

### 4. 列表项小调整

- `prose-ul` 圆点改成 `marker:text-primary/60`
- `prose-li` 行高 `leading-[1.85]` 跟正文一致

### 5. 折叠交互保留，只微调

- 折叠高度从 `max-h-44`（176px）→ `max-h-52`（208px），多露出第一段一两行，让用户先尝到内容再决定要不要展开
- 渐变蒙层颜色用 `from-card`（已经是了）保持不变
- "展开/收起"按钮文案和位置不动

## 改动文件

- 编辑：`src/pages/OfficialDetail.tsx` —— 只改 `深度阅读` 那个 `<Card>` 内的 className 和加一行价格预处理；保留折叠逻辑

不新建组件、不改其他页面、不动数据。