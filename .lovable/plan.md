## 活动详情页重设计（只改 `src/pages/ActivityDetail.tsx`）

不动任何数据逻辑、edge function、路由。整体贴合现有「中古」暖米/咖啡色调，去掉生硬的浅色渐变 hero 块，按列表页的卡片质感组织。

### 新结构（从上到下）

```text
PageHeader: 活动名称  ← 返回

[Card 1 - 信息卡]
  ● 进行中   [需审核 / 免审核]            ← 状态圆点 + outline 徽章
  活动名称 (text-xl, font-semibold)
  活动描述 (muted, line-clamp-3)
  ─────────────
  活动时间   2026-06-11 ~ 2026-07-11      ← label/value 两列, text-xs
  创建时间   2026-06-11 15:30
  分享链接   /a/xxxx          [复制]      ← 行内 ghost 按钮

[Card 2 - 统计]
  12          8          2                ← text-2xl tabular-nums, foreground 色
  已申请    已通过    已拒绝
  (免审核模式：已领取 / 已核销 两列)

[Tabs 或单列表 - 申请/领取]
  每条: 姓名 · 电话               徽章
        时间 + 字段折叠
        [拒绝] [通过]  (仅 pending)

──────── 页面最底部 ────────
[  修改活动  ]   ← variant="outline", 全宽
[  删除活动  ]   ← variant="ghost" + text-destructive, 全宽
```

### 视觉规范

- 卡片统一 `Card` 默认（白底 + 细边 + 轻 shadow），**移除** `bg-gradient-to-br from-primary/15` 渐变块。
- 顶部状态行：圆点 + `text-xs text-muted-foreground`，去掉 `bg-background/80 backdrop-blur` 漂浮 chip。
- 模式徽章用 `Badge variant="outline"`，统一文案「需审核 / 免审核」(对齐 `ActivitiesMine`)。
- 统计数字 `text-2xl font-semibold tabular-nums text-foreground`；**不再用 emerald/rose**（与暖米咖啡主色不搭）。
- 列表条目沿用 `ActivitiesMine` 的 `Card p-3 space-y-2` 节奏。
- 底部操作 `pt-4 space-y-2`，两个按钮各一行；修改用 outline，删除用 ghost + `text-destructive`。

### 行为保持不变

- 修改 → `ActivityEditDialog`
- 删除 → 现有 `AlertDialog` 确认
- 复制分享链接 → 挪到信息卡分享链接行
- 审核流（approve/reject/SMS 提示）、表单字段渲染、图片签名 URL 全部保留
- 免审核模式继续显示领取列表 + 核销状态

### 不在范围

不改 `ActivitiesMine.tsx`、`ActivityEditDialog.tsx`、edge function、数据库、路由。
