# 性能体检报告

不是改造方案，是一份「按优先级排好」的清单，看完再决定改什么。

---

## A. 素材 / 静态资源加载

### 当前状况
- `index.html`：字体已用 `preload + media=print` 非阻塞，preconnect 到 Supabase 和 Google Fonts，已经做得不错。
- `public/icon-512.png` **188KB**，`src/assets/shop-wechat-qr.png` **192KB**，`boomer-off-vintage-logo.png` **54KB**。三张图全是 PNG，没有 webp / avif。
- 项目里**没有 `vite-imagetools`**，所有图片按原格式打包，浏览器无法用现代格式。
- 字体只加载了 2 个字重（Noto Sans SC 400/600 + Playfair Display 700），已优化。
- favicon 4KB、apple-touch-icon 24KB，OK。

### 主要问题
| # | 问题 | 影响 | 难度 |
|---|------|------|------|
| A1 | `icon-512.png` 188KB 太大（仅 PWA 安装时用） | 首屏其实不加载，但 manifest 抓取会拉一次 | 低 |
| A2 | `shop-wechat-qr.png` 192KB 在 bundle 里 | 哪个页面 import 了就强制加载 | 低 |
| A3 | 所有 PNG 没 WebP 版本 | 用户头像、商品图、官方知识封面都用 PNG/JPG 直链 | 中 |
| A4 | Supabase Storage（avatars / product-images）**没有图片转换层** | 列表页/瀑布流加载原图 | 中 |
| A5 | LCP 图片没有 `<link rel="preload" as="image">` | 首屏识别页 hero 图未优先 | 低 |

### 建议
- **必做**：用 `squoosh` 或 `sharp` 把 `icon-512.png` / `shop-wechat-qr.png` 压到 < 50KB。
- **应做**：community / library 列表用 `<img loading="lazy" decoding="async" width height>`（防 CLS + 懒加载），检查是否已有。
- **可做**：接入 `vite-imagetools`，或在 Supabase 前面加 Cloudflare Image Resizing / imgproxy 做 WebP/AVIF 转换。
- **不建议**：自己写 SSR 图片代理（SSRF 风险）。

---

## B. 页面打开速度（JS bundle + 首屏）

### 当前状况
- `vite.config.ts` 已做 `manualChunks`：react-vendor、radix、supabase、charts、markdown、date、dnd、carousel、html-to-image、icons 全拆开 ✅
- 路由全部 `lazyWithRetry` 懒加载 ✅
- 生产构建 `drop console / debugger` ✅
- `Scan.tsx` 把 `AuthPage`、`LiveStreamPanel` 都拆成单独 chunk ✅
- 这一块整体水平已经不错。

### 仍存在的痛点
| # | 问题 | 影响 |
|---|------|------|
| B1 | **`recharts` (charts chunk) 通常 150–200KB gzip**，但仪表盘只用了 `Sparkline`（自己手写 SVG），看着没真正用 recharts。需要确认是否还能整个去掉。 | 大 |
| B2 | `html-to-image` 只在生成分享卡时用，但若被同步 import 会进首包 | 中 |
| B3 | `useDashboardData` 一次发 **15+ 个并行 Supabase 查询**（profiles/shift_schedules/shop_shifts/user_experience/check_ins/sop/qa/daily_knowledge/products×2/favorites/community_posts×2/peer profiles…）。RLS 多策略表查询累计往返 + 函数调用容易 800ms–1.5s。 | 大 |
| B4 | `FloatingDashboard` 全局挂载在 `MainLayout`，每个页面都会跑这套查询（即便胶囊收起） | 大 |
| B5 | `index.html` 没有 `<link rel="modulepreload">` 给关键路由 chunk | 小 |
| B6 | 项目里依然装着 `recharts + d3-*`、`embla-carousel`、`react-day-picker`、`vaul`、`cmdk`、`input-otp`、`@dnd-kit/*` 等，需要核实是否真在用 | 中 |

### 建议（按性价比）
1. **拆 `useDashboardData`**：分成「胶囊必需（头像+今日班次）」和「抽屉打开后才加载（学习/数据/待办/同事）」两层；用 `useQuery` 替代手写 effect，自动缓存+复用。
2. **审计未用依赖**：跑 `npx depcheck`，确认 recharts / d3 / dnd / carousel / day-picker / vaul 是否真用，无用的删掉能砍 200–400KB。
3. **`FloatingDashboard` 路由白名单**：登录页、`/u/*` 游客页、`/reset-password` 不挂。
4. **压缩 2 张大 PNG**（参见 A1/A2）。
5. **可选**：给 `/scan`（首屏）的 `LiveStreamPanel` chunk 加 `<link rel="modulepreload">`，登录后立刻可用。

---

## C. AI 识别速度

### 当前状况
- 主识别硬编码 `google/gemini-2.5-flash-lite`（最快档），不走 admin 配置 ✅
- Edge function 已写好 hash_cache → name_cache → AI 三级 pipeline ✅
- 前端单图压缩到 **640px / q=0.62**，多图 576px / q=0.6 ✅（已经很激进）
- 前端进入识别页 **预热 OPTIONS** 一次，避免冷启动 ✅
- 前端用 8×8 pHash 做去重 ✅
- 上传图片到 storage 与 AI 调用是 **Promise.all 并行** ✅

### 仍有空间
| # | 问题 | 影响 |
|---|------|------|
| C1 | 预热用 `OPTIONS` 实际不会执行 handler，**冷启动不会被预热**。应该 POST 一个轻量探活 body。 | 中 |
| C2 | Edge function 内 `tryQuickClassify` + `tryNameMatch` + 主识别可能串行调用，多走一跳 = +800ms–1.5s。需要确认是否在缓存未命中时多调一次 AI。 | 大 |
| C3 | 图像 base64 通过 JSON body 发送，比 multipart 多 33% 体积。640px JPG q0.62 通常 40–80KB → base64 后 55–110KB，4G 上行 200–500ms。 | 中 |
| C4 | 识别后 `enrich-recognition` 在后台跑，但前端是否等待 enrich 完才显示长话术？需要确认 UX。 | 中 |
| C5 | `useGuestRecognition` / `useProductRecognition` 两套 hook 调两个 edge function（`recognize-product` / `recognize-product-public`），代码重复 600+ 行，维护成本高，无性能影响。 | 维护 |

### 建议
1. **改预热**：把 `OPTIONS` 换成 `POST {ping:true}`，edge function 早返回，能真正预热 V8 isolate。
2. **审 pipeline**：确认 `tryQuickClassify` 是否在主识别之外**额外**调了一次 AI。如果是，砍掉它或改为「主识别失败再兜底」。
3. **缓存命中率监控**：往日志加 `hash_hit / name_hit / ai_miss` 三段计数，按周看命中率，决定是否值得加 CLIP embedding 召回。
4. **可选**：上行用 `Blob + FormData` 替代 base64 JSON，省 30% 体积；但需要 edge function 改 parser。
5. **不建议**：换更贵模型。Lite 已是 1–3s 档，换 Flash/Pro 只会更慢更贵。

---

## D. 一句话结论

- **改造性价比最高的三件事**：①拆 `useDashboardData` + 路由白名单挂 `FloatingDashboard`；②`depcheck` 砍掉没用的依赖（重点看 recharts/d3）；③压缩 `icon-512.png` 和 `shop-wechat-qr.png`。
- **识别速度**目前已经压到接近 lite 模型物理极限，最大变量是**冷启动**和**缓存命中率**，不是模型本身。
- **图片现代格式（WebP/AVIF）**收益大但工作量也大，建议放在第二轮。

---

## 等你决定

请告诉我你想先做哪几项，我再展开具体改造方案。可选：

1. 拆 `useDashboardData` + FloatingDashboard 路由白名单
2. 跑 depcheck，砍未用依赖
3. 压缩两张大 PNG + LCP preload
4. 把识别预热改成真预热 POST
5. 审 edge function pipeline 是否多调一次 AI
6. 接入 WebP / 图片转换层
7. 全做（按 1→5→2→3→4→6 顺序）
