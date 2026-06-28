## 问题

申请卡片底部 `flex items-center justify-between` 把「领取/核销时间」和右侧四个按钮(发布链接 / 复制券链接 / 查看券 / 查看发布)塞在同一行。手机宽度下按钮组占满,时间被压缩成 1 字宽,变成竖排的"领\\取\\:\\2\\0\\2\\6…",非常难看。

「主页截图」一行也用了 `flex gap-2`,标签和内容并排,窄屏下没问题但和时间挤在一起观感凌乱。

## 改造方案(只动 `src/pages/ActivityDetail.tsx` 第 309-413 行的卡片渲染)

### 1. 把时间和按钮拆成上下两行

```tsx
<div className="pt-1 space-y-1.5">
  <p className="text-[11px] text-muted-foreground">
    领取 {fmtDt(app.created_at)}
    {app.voucher_claim?.redeemed_at && ` · 核销 ${fmtDt(app.voucher_claim.redeemed_at)}`}
  </p>
  <div className="flex flex-wrap gap-1.5">
    {/* 发布链接 / 复制券链接 / 查看券 / 查看发布 按钮 */}
  </div>
</div>
```

按钮组改成 **左对齐 + flex-wrap**,在窄屏自然换行,不再争夺水平空间。

### 2. 顶部 meta 行轻微优化

姓名 + 电话 + 已发布/待确认 + 状态徽章保持一行,但电话用 `tabular-nums`,徽章 `ml-auto` 让状态紧贴右侧。

### 3. 表单字段排版改成上下结构

`form_fields` 渲染从 `flex gap-2`(标签:值横排)改成上下两行:

```tsx
<div className="flex flex-col gap-0.5">
  <span className="text-[11px] text-muted-foreground">{f.label}</span>
  <span className="text-xs break-all">…</span>
</div>
```

这样「主页截图 / 查看截图」「主页名称 / 长字符串」都能用整行宽度展示,不再被压缩。

### 4. 「查看截图」按钮升级为 chip 样式

`px-2 py-0.5 rounded-md border border-primary/40 text-primary text-[11px] inline-flex items-center gap-1`,移除 `truncate`,加 `ImageIcon`,点击区域更大,手指更好点。

## 涉及文件

- `src/pages/ActivityDetail.tsx` — 仅调整申请卡片(`filtered.map((app) => …)`)内部 JSX 与 className,不动数据、不动按钮回调。

## 预期效果

手机视图下卡片自上而下:**姓名行 → 表单字段(每行整宽)→ 领取时间行 → 操作按钮行(自动换行)**,信息一目了然,不再出现竖排单字时间。
