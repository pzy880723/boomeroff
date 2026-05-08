## 一、性能体检结果（实测数据）

刚刚跑了一次性能采集，关键指标如下：

| 指标 | 当前值 | 评价 |
|---|---|---|
| TTFB（首字节） | 1150ms | 偏慢，受网络/Cloud 区域影响 |
| DOM Interactive | 1910ms | 还行 |
| **DOMContentLoaded / Full Load** | **6602ms / 6619ms** | **明显偏慢** |
| 加载脚本数 | **159 个** | **过多，主要瓶颈** |
| 总脚本体积 | 1.76 MB | 中等 |
| JS 堆 | 7.7MB / 16.5MB | 健康 |
| DOM 节点 | 49，深度 2 | 非常轻 |

**结论**：运行时本身不慢（DOM/内存/脚本执行都很轻），首屏慢主要是「**首次加载要拉 159 个 JS 文件**」造成的瀑布流，单个最大的几个：
- `lucide-react` 157KB / 1.78s
- `@supabase/supabase-js` 130KB / 1.64s
- `react-day-picker` 121KB / 1.66s
- `react-markdown` 69KB / 1.39s

注意这是 **Vite dev 预览**的数字，正式 `vite build` 后会做 tree-shaking + 合包，速度会显著好于 6.6 秒，但目前代码里有几处确实会拖慢生产首屏。

---

## 二、可以做的优化（按性价比排序）

### A. 路由级懒加载（最高 ROI）
`src/App.tsx` 现在把 13 个页面（Scan / OfficialLibrary / MyLibrary / Community / Me / History / Portal / Invite / ResetPassword / CheckInHistory / OfficialDetail / NotFound …）全部 **同步 import**。一打开 `/scan` 就把后台 Portal、社区、我的、历史等全部页面的代码一起下载。

**改造**：所有非首屏路由用 `React.lazy + Suspense`：
```tsx
const Portal = lazy(() => import('./pages/Portal'));
const Community = lazy(() => import('./pages/Community'));
// ... 其余页面同理，只保留 Scan 同步
```
配上一个轻量 Loading fallback。预计 **首包体积 -30%~-50%**。

### B. lucide-react 按需子路径
项目大量 `import { X } from 'lucide-react'`，lucide-react 没做完美 tree-shaking 时会被打包成 ~150KB。改为按需子路径 `import X from 'lucide-react/dist/esm/icons/x'`，或用 `babel-plugin-import` 的等价方案，体积可降 60%+。

### C. AuthProvider 启动顺序
`useAuth.tsx` 里 `getSession()` + `onAuthStateChange` 有 5 秒超时兜底，多数情况会在 ~700ms 内完成；但 `Scan` 页面 `loading` 期间整屏 spinner。可以把首屏骨架屏放出来，让 `LiveStreamPanel` 的相机界面先渲染，登录态后再叠加。

### D. 重组件懒加载
- `react-markdown` 只在知识库详情/聊天里用 → 让用到它的组件本身也懒加载。
- `recharts` / `embla-carousel-react` / `react-day-picker` / `html-to-image` / `@dnd-kit/*` 全部只在少数页面使用，配合 A 之后会自动分包，无需额外操作。

### E. Vite 构建分包
在 `vite.config.ts` 里加 `build.rollupOptions.output.manualChunks`，把 `react`、`@radix-ui/*`、`@supabase/supabase-js`、`recharts` 单独拆 chunk，利于浏览器缓存（第二次访问几乎瞬开）。

### F. Service Worker / 资源预缓存（可选）
门店店员场景是「每天反复打开同一台设备」，加一个最简 SW 把 hash 过的静态资源缓存住，回访打开时间能压到 1 秒内。

### G. Cloud 实例规格（如果接口慢，不是前端问题）
如果你觉得「**点击识别后等待变慢**」而不是「白屏长」，那是后端而不是前端问题。可以到 **Cloud → Overview → Advanced settings** 升一级实例，识别/查询的 P95 会明显下来。

---

## 三、迁移到「腾讯云」的影响评估

需要分清楚目前这套架构里**到底有几块东西在 Lovable 这边**：

```text
┌────────────────────────┐    ┌────────────────────────────┐
│  前端静态资源（构建产物）│    │  Lovable Cloud（= Supabase）│
│  React / Vite build    │    │  - Postgres + RLS          │
│  托管在 lovable.app    │    │  - Auth                    │
│                        │    │  - Storage（product-images） │
│                        │    │  - Edge Functions（识别等）│
│                        │    │  - Realtime                │
└──────────┬─────────────┘    └────────────┬───────────────┘
           │                               │
           └────────► 调用 ─────────────────┘
                                           │
                                ┌──────────▼──────────┐
                                │ Lovable AI Gateway   │
                                │ Gemini / GPT 模型    │
                                └──────────────────────┘
```

### 1. 「整体迁移到腾讯云」具体指什么？分三种情况

| 方案 | 含义 | 难度 | 影响 |
|---|---|---|---|
| ① **只把前端静态文件放腾讯云 COS/CDN** | Lovable 这边 publish 后，把 `dist/` 上传腾讯云 CDN | 容易 | 国内访问会变快；后端、AI 都不变 |
| ② **整个后端从 Lovable Cloud 搬到腾讯云** | 自建 Supabase、或换 TDSQL/CloudBase + 自写云函数 | **重度** | 需要重写所有 Edge Functions、迁数据、迁存储、重做 RLS |
| ③ **完全不再使用 Lovable** | 项目脱离 Lovable 自托管 | 高 | Lovable 提供的可视化编辑、自动构建、Cloud 一体化都失效 |

### 2. 各模块迁移影响清单

- **数据库（products / official_knowledge / user_roles ...）**：可以用 `pg_dump` 导出，导入到腾讯云 PostgreSQL 或自建 Supabase。但 RLS 策略、`has_role` / `perform_check_in` 等 SECURITY DEFINER 函数都要一起搬，且需要测试。
- **Auth**：腾讯云无原生 Supabase Auth 的对应物。要么自建 Supabase，要么换成腾讯云 CloudBase / 自研 JWT，**全部前端 `supabase.auth.*` 调用都要改写**。
- **Storage（product-images bucket）**：换成腾讯云 COS，所有 `supabase.storage.*` 调用要改成 COS SDK；数据库里存的图片 URL 域名要批量替换。
- **Edge Functions**（识别、纠错、知识管理共 ~20 个）：要在腾讯云 SCF（云函数）或 CloudBase 云函数里重写，`Deno.serve` → Node.js handler，`createClient(SERVICE_ROLE_KEY)` 也要换。
- **Realtime**：腾讯云没有现成等价物，要么用 WebSocket 自建，要么砍掉实时同步功能。

### 3. AI 功能会受什么影响

这是关键，目前 AI 走的是 `Lovable AI Gateway`，密钥是 Lovable 平台发的 `LOVABLE_API_KEY`：

- **如果只是前端搬到腾讯云、后端还在 Lovable Cloud**：AI **完全不受影响**。
- **如果后端也搬到腾讯云**：
  - `LOVABLE_API_KEY` 是 Lovable 平台密钥，**离开 Lovable 后无法再用**。
  - 需要换成自己申请的：
    - 走腾讯云「混元 / DeepSeek」=> 国内合规、延迟低，但要换模型、重新调 prompt。
    - 或继续走 Google Gemini / OpenAI => 需要海外网络出口，国内服务器直连不稳定，通常要走代理。
  - 你现在依赖的 `google_search` grounding（web 搜索）功能，国产模型不一定有等价物，识别准确度会受影响。
  - 图片识别（multi-image）是模型多模态能力，换 DeepSeek/Hunyuan 文本模型不能直接替代；需要选有视觉能力的模型（Hunyuan-Vision、Qwen-VL 等）。

### 4. 给你的建议

> 在做技术选型决策前，建议先确认你想解决的核心问题是什么：是「**国内访问慢**」、「**成本控制**」、还是「**合规/数据出境**」？这三种诉求对应的方案差别非常大。

我列了几个常见组合（在确认你想要哪种之前我不会动代码）：

| 你的诉求 | 推荐方案 | 工作量 |
|---|---|---|
| 只是国内打开慢 | 保持 Lovable Cloud + 前端套腾讯云 CDN（方案①） | 小 |
| 想要稳定的国内后端 + 仍用海外 AI | 后端搬腾讯云自建 Supabase + AI 仍走 Gateway/OpenAI | 大 |
| 全合规、数据不出境 | 后端腾讯云 + AI 换国产视觉模型（混元/Qwen-VL） | 很大，且识别精度需重新调优 |

---

## 我接下来准备做的事（等你确认方向）

1. 先做**前端性能优化**（路由懒加载 + lucide 按需 + 构建分包），这个不影响后端，立即见效。
2. 性能优化后再讨论腾讯云迁移；如果你倾向方案①（只动前端 CDN），我可以给你出一个发布到腾讯云 COS+CDN 的具体步骤；如果想动后端，我会先做一份"模块影响清单 + 工时评估"，再开始动。

请告诉我：
- 你最在意的是「**首屏打开速度**」还是「**识别响应速度**」？
- 迁移腾讯云的真正动机是什么（速度 / 成本 / 合规 / 公司要求）？
- 是否可以接受「保留 Lovable Cloud 后端 + 前端走腾讯云 CDN」这种轻量方案？
