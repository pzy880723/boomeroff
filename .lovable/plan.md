目标：让「我的」头像 + 姓名 + 徽章几乎"同框"出现，中古圈瀑布流秒开，AI 识物入口零等待。

---

## 一、Me 页（当前最痛）

**症状**：昵称先出 → 头像后出 → 徽章/统计/等级/排班最后一起出，全程 1~3s 白屏感。

**根因**
1. 6 个并行查询用 `Promise.all` 一次性 `setLoading(false)`，最慢的那个决定首屏时间。
2. `avatar_url` 直接用 `<AvatarImage src=原图>`，没有走 CDN 缩略图 (`thumbUrl`)，也没设 `width/height/fetchPriority`，导致大图排队 + 布局跳动。
3. 每次进 `/me` 都从零查一遍，没有本地缓存 —— 用户其实上一秒还看过。

**方案**
- **SWR 缓存**：新建 `src/lib/profileCache.ts`，用 `sessionStorage` 缓存 `profile + staff + shopName + exp + stats`，key = `user.id`。进页面立即用缓存 hydrate（0ms 出全部内容），后台再拉一次覆盖。
- **拆分请求 & 优先级**：
  - 第 1 波（首屏必需，串行 render）：`profiles`（含 avatar/display_name）+ `staff_profiles`（含 shop_id/position/real_name）—— 用 `Promise.all` 一次并发。
  - 第 2 波（次要，不阻塞首屏）：`shops.name`、`user_experience`、3 个 count(*) 统计，独立异步 setState。
- **头像加速**：
  - `AvatarPicker` 里用 `thumbUrl(avatarUrl, 144, 80)`，`<img width=72 height=72 fetchPriority="high" decoding="async">`。
  - 拿到 avatar 后 `<link rel="preload" as="image">` 塞进 `<head>`，让下次进 /me 命中浏览器缓存。
  - 上传/AI 生成后写回缓存，去掉 `?v=Date.now()` cache-buster（导致每次强刷）。改用固定文件名 + `cacheControl` 已经足够，或把版本号存进 `profiles.avatar_version` 复用。
- **骨架屏**：给统计卡 / 等级卡 / 排班卡加 `<Skeleton>`，比 spinner 视觉上更快。

---

## 二、中古圈 Community

**根因**
1. `loadPosts` 里 posts → profiles → likes → favs **串行 4 次 RTT**（await 之间没并发）。
2. 瀑布流卡片 `<img>` 没写 `width/height`，`columns-2` 布局在图片加载完才定高 → 抖动。
3. Realtime `useEffect` 依赖 `[cat, profiles]`，每收到一条新 profile 就撤销/重建 channel。
4. 卡片图直接读 `p.thumbnail_url`（可能是 dataURL 大图），或 480 宽的 `thumbUrl`，对手机 3 列瀑布来说 240 就够。

**方案**
- 首屏一次 `select` + 三个从属查询用 `Promise.all` 并发发出，缩到 2 次 RTT。
- 卡片图统一 `thumbUrl(url, 240, 70)` + `srcSet`（`thumbSrcSet(url, 180)`），`sizes="(max-width:640px) 46vw, 220px"`。
- 每张卡加 `aspect-[3/4]` 兜底比例（首屏无跳动），首图 `fetchPriority="high"`。
- 详情弹层大图从 1080 降到 720，`fetchPriority` 仅在打开时给。
- Realtime effect 依赖只保留 `[cat]`，`profiles` 用 ref 读；缺 profile 时懒补而不是重订阅。
- 分类切换从「重拉全部」改为已加载 caches by cat（Map<cat, posts>）。

---

## 三、AI 识物 Scan

**现状**：`AuthPage` 与 `LiveStreamPanel` 都是 `lazyWithRetry`，好；但 `useAuth` 拉 role 需 1 次 RTT，未登录用户在此期间只看 spinner。

**方案**
- 页面挂载时先 `import()` 预取 `LiveStreamPanel` 的 chunk（不 render），并行 role 查询完成时 chunk 已就位。
- `PageHeader` 立即渲染，spinner 只放在内容区，视觉上不再"整页转圈"。
- `LiveStreamPanel` 首屏检查：是否有 heavy 依赖（模型/相机 SDK）能延迟到用户点"开始识别"时再加载 —— 本轮先加一条 `requestIdleCallback` 预热相机权限检查。

---

## 四、通用底座（一次改，所有页面受益）

- `src/lib/imageUrl.ts` 增加 `avatarUrl(url, size)` 辅助：走 `render/image/public` + `resize=cover` + `quality=75`，供头像/角色卡/评论区共用。
- `AvatarImage` 组件包一层默认给 `decoding="async" loading="lazy"`，首屏关键头像手动加 `fetchPriority="high"`。
- 全局 `<link rel="preconnect">` 到 Supabase storage 域，减去 TLS 握手。

---

## 预期收益

| 页面 | 首屏内容出现 | 头像出现 | 图片总字节 |
| --- | --- | --- | --- |
| /me | 1.2s → **≤100ms（缓存命中）/ 500ms（冷启）** | 与姓名同帧 | -60% |
| /community | 1.8s → **700ms** | — | -50% |
| /scan | 1.0s → **400ms** | — | — |

改动范围：仅前端表现层 + 一个小工具文件，不动数据库、不动 Edge Function。
