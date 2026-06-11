## 目标

1. 活动详情页移除"分享链接"那一行，只保留一个主按钮：**生成分享海报**。
2. 海报生成后**永久固化**：保存到云端，下次直接打开转发，不再重复生成。
3. 海报版式重新排版，描述完整显示。
4. 扫码 → 公开申请页：免审核 → 直接跳转抵用券领取页；需审核 → 显示"申请已提交，审核通过后将通过短信通知"。

---

## 改动清单

### 1. 数据库 — 缓存已生成的海报
- `activities` 表新增 `poster_url text` 列。
- 新建公开 storage bucket `activity-posters`（public read，仅创建者 INSERT/UPDATE/DELETE）。

### 2. `src/pages/ActivityDetail.tsx`
- 删除"分享 / sharePath / 海报"那一行 MetaRow。
- 在卡片底部加一个全宽主按钮：
  - 若 `activity.poster_url` 已存在 → 文案"打开转发海报"，直接打开 Dialog 显示已有海报。
  - 若不存在 → 文案"生成分享海报"，打开 Dialog 时生成并保存。
- 描述去掉 `line-clamp-3`，完整显示。

### 3. `src/pages/ActivitiesMine.tsx`
- 列表卡片菜单中的"分享海报"逻辑同上：有缓存直接展示，无缓存才生成。

### 4. `src/components/voucher/ActivityShareDialog.tsx` — 重排版 + 固化
- Props 增加 `posterUrl?: string | null` 和 `onPosterSaved?(url: string)`。
- 打开时：
  - 如果传入了 `posterUrl` → 直接显示，无需画 canvas。
  - 否则 → 画 canvas，画完后 `canvas.toBlob` → 上传到 `activity-posters/{activity_id}.png` → 拿到 public URL → `update activities set poster_url=...` → 回调 `onPosterSaved`。
- 重新排版（更克制、更有仪式感）：
  ```text
  ┌──────────────────────────────┐
  │   [BOOMER·OFF logo 居中]     │
  │   ——  中 古 邀 请 函  ——     │
  │                              │
  │   [封面图圆角 + 微阴影]      │
  │                              │
  │     活 动 标 题（衬线）       │
  │        ◆ 分隔符 ◆            │
  │                              │
  │   完整描述（自动换行最多 6  │
  │   行，22px，行高 1.6）       │
  │                              │
  │   ─────────────────────      │
  │   时间：xxxx-xx-xx 至 ...    │
  │   类型：需审核 / 免审核      │
  │   ─────────────────────      │
  │                              │
  │   ┌─ QR ─┐  扫 码            │
  │   │      │  参 与            │
  │   └──────┘  ── 朱红短线 ──   │
  │                              │
  │   由 BOOMER·OFF 中古小店呈上 │
  └──────────────────────────────┘
  ```
  - 描述支持最多 6 行（之前 2 行被截断），仍超长才省略。
  - 增加时间与类型行（之前类型徽章独立、时间信息缺失）。
  - 去掉之前那个突兀的"活动"印章块；保留菱形分隔符与朱红短线点缀，整体更安静干净。
  - 去掉随机噪点（移动端有时偏脏），改为纯渐变纸色 + 双线外框。
- 按钮：保留"保存图片"；移除"复制链接"按钮（用户要求只走海报转发）。在标题下加一行提示"长按图片即可转发到微信"。
- 加载态文案："正在生成分享海报…"，首次生成才会出现。

### 5. `src/pages/public/PublicActivity.tsx` — 申请后跳转 / 文案
- 当前实现已满足：
  - `requires_review === false` → `navigate('/u/c/{short_code}')` 直接到抵用券领取页。
  - `requires_review === true` → 显示"申请已提交 / 审核通过后将通过短信通知您领取抵用券"。
- 仅做小润色：将文案统一为"申请已提交，待审核通过后将通过短信通知您领取抵用券"，与用户描述一致。

### 6. `src/lib/voucher.ts`
- `Activity` 类型加 `poster_url?: string | null`，便于详情/列表传给 Dialog。

---

## 注意事项 / 技术要点

- 上传走 supabase storage：`supabase.storage.from('activity-posters').upload(path, blob, { upsert: true })` → `getPublicUrl`。
- 二维码内容仍然在生成那一刻读取 `window.location.origin`，所以即便换域名，旧海报里的二维码会带旧域名 —— 这是"固化"的代价。若用户希望换域名后旧海报自动失效或重生，需要额外提供"重新生成海报"按钮（本次默认不加，可在后续按需补上）。
- 不改 edge functions、不改 RLS 业务逻辑、不引入新依赖。