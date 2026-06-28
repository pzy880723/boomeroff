# PC 端 First Steps 接入本项目（Genie / BOOMER.OFF）Lovable Cloud 数据库

> 这份手册是给 **First Steps**（TanStack Start 项目，ID `3a5a8bad-dfde-4d66-8cd6-9786e7370c8e`）的 Lovable Agent 看的。
> 目标：让 PC 端和 Genie 手机端共用同一个 Supabase 实例（同库、同 RLS、同 Edge Functions、同 Storage）。

---

## 0. 总原则（必读）

- 本项目（Genie，ref `bef32724-503e-467a-af03-2062176cf921`，Supabase ref `narqwgwpqglathwtyevz`）是 **Lovable Cloud 托管**的 Supabase。
- First Steps **不要点 "Enable Lovable Cloud"**——否则会被自动开一个独立的新数据库。
- First Steps 也**不要走 "Connect → Supabase → 选已有项目"**——Lovable Cloud 的内部 Supabase 不会出现在外部账号列表里，那条路走不通。
- 正确做法：First Steps 把本项目的 Supabase 当成**普通的外部 Supabase 项目**用（手工写 `.env` + 手工创建 client 文件）。
- 推荐**只用 anon key + 用户 JWT**（"浏览器端 client"模式）。所有需要高权限的操作（service_role）一律走本项目已部署的 Edge Function，不在 PC 端再开一份 service_role client，更安全。

---

## 1. 连接参数

复制以下三行到 First Steps 的 `.env`（**变量名不能改**，TanStack Start 的 Vite 强制 `VITE_` 前缀）：

```env
VITE_SUPABASE_URL=https://narqwgwpqglathwtyevz.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hcnF3Z3dwcWdsYXRod3R5ZXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0NDkwOTMsImV4cCI6MjA4MTAyNTA5M30.ZzkXVU8X0l1LOvT4wIMWwdarwDSdFm6GTaVhC4Xle2M
VITE_SUPABASE_PROJECT_ID=narqwgwpqglathwtyevz
```

> anon key 是公开可用的 publishable key，可以直接进代码仓库。
> service_role key **不在本手册**——如果 First Steps 之后真的需要服务端高权限（不推荐），请联系本项目管理员单独走 `add_secret` 流程。

---

## 2. 在 First Steps 里要创建的文件

### 2.1 `src/integrations/supabase/client.ts`（浏览器端）

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL!;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
```

### 2.2 `src/integrations/supabase/client.server.ts`（SSR/loader 端，仍只用 anon key）

```ts
import { createClient } from "@supabase/supabase-js";
import { parseCookies } from "@tanstack/start/server";
import type { Database } from "./types";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const COOKIE_KEY = "sb-narqwgwpqglathwtyevz-auth-token";

/** 在 createServerFn / loader 里用：拿到带当前用户 JWT 的 client，自动满足 RLS。 */
export function getServerSupabase() {
  const cookies = parseCookies();
  const raw = cookies[COOKIE_KEY];
  const accessToken = (() => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(decodeURIComponent(raw));
      return parsed?.access_token ?? null;
    } catch {
      return null;
    }
  })();

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}
```

> 故意**不用** service_role，避免误用绕开 RLS。需要写敏感数据就调本项目的 Edge Function。

### 2.3 `src/integrations/supabase/auth-middleware.ts`

```ts
import { createMiddleware } from "@tanstack/start";
import { getServerSupabase } from "./client.server";

export const requireSupabaseAuth = createMiddleware().server(async ({ next }) => {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Response("Unauthorized", { status: 401 });
  return next({ context: { supabase, user } });
});
```

### 2.4 `src/integrations/supabase/types.ts`

**直接从本项目复制**（路径：`src/integrations/supabase/types.ts`），保证两边类型完全对齐。

每次本项目跑 migration 后，First Steps 的 Agent 需要把最新 `types.ts` 重新复制一遍——可以用 `cross_project--read_project_file` 工具从本项目（ID `bef32724-503e-467a-af03-2062176cf921`）读 `src/integrations/supabase/types.ts`，整文件覆盖。

---

## 3. 业务侧改造清单

### 3.1 删除 mock

- 删除 `src/api/client.ts` 里的 `mock()` 逻辑（保留导出 `supabase` 重定向到 `@/integrations/supabase/client`）。
- 删除整个 `src/mocks/` 目录。

### 3.2 改写 `src/api/*.ts`

按 `.lovable/plan.md` 列表对应：

| 文件 | 真实数据源 |
|---|---|
| `assets.ts` | `from('marketing_assets')`，按 `shop_id` 过滤 |
| `copy.ts` | `from('marketing_assets').eq('kind','copy')` |
| `aiImage.ts` | `from('marketing_assets').eq('kind','image')` |
| `videoJobs.ts` | `from('marketing_video_jobs')` + Realtime 订阅 |
| `accounts.ts` | `from('social_accounts')` + `functions.invoke('dispatch-account-list')` |
| `publishJobs.ts` | `from('social_publish_jobs')` + `from('social_publish_targets')` |
| `shops.ts` | `from('shops')` + `from('staff_profiles')` |

### 3.3 必备钩子

复制本项目 `src/hooks/useShops.ts` 的实现（按 `staff_profiles.shop_id` 列出当前用户能进的店铺），所有 insert/select 都要传 `shop_id`，否则会被 RLS 拒绝。

### 3.4 调用 Edge Function

不要在 First Steps 里重新部署 Edge Function——本项目 Supabase 上已经有完整的 50+ 函数。直接：

```ts
const { data, error } = await supabase.functions.invoke("render-marketing-video", {
  body: { script, scenes, character_id, model_id: "seedance-pro", resolution: "1080p", shop_id },
});
```

完整函数清单 + body 格式见本项目 `docs/marketing-center-api.md`（同样可以用 `cross_project--read_project_file` 拉过去当参考）。

### 3.5 Realtime 订阅

```ts
supabase.channel(`job-${jobId}`)
  .on("postgres_changes",
      { event: "UPDATE", schema: "public", table: "marketing_video_jobs", filter: `id=eq.${jobId}` },
      (payload) => updateUI(payload.new))
  .subscribe();
```

已加入 publication 的表：`marketing_assets` / `marketing_video_jobs` / `social_publish_jobs` / `social_publish_targets`。

### 3.6 Storage 桶

| Bucket | Public | 用途 |
|---|---|---|
| `product-images` | ✅ | 营销图片主桶 |
| `avatars` | ✅ | 头像 |
| `marketing-videos` | ❌ | 视频中间产物（用 signed URL） |
| `voucher-screenshots` / `activity-posters` | ❌ | 非 PC 模块 |

视频成片下载统一调本项目 `download-marketing-asset` Edge Function 走代理（火山 TOS URL 24h 会过期）。

---

## 4. 登录态共享说明

- 同一 Supabase URL → 浏览器 localStorage 的 key 是同一个：`sb-narqwgwpqglathwtyevz-auth-token`。
- **同域名/子域名**：登录态自动共享。
- **不同域名**：用户在 First Steps 还是要再登一次，但 `auth.uid()` 完全一致，所有数据互通。
- 用 Supabase 的 Email + Password（与手机端一致），不要在 PC 端走第三方 OAuth。

---

## 5. RLS 自检

每张表都加了 `shop_id + auth.uid()` 过滤。常见踩坑：

1. `insert` 时漏传 `shop_id` → 401 / 403。务必先调用 `useShops()` 拿到当前店铺 ID。
2. 角色判定用 `user_roles.role`：`admin` 是超级管理员，`anchor` 是店员。**不要**在 `profiles` 上加 role 字段。
3. 总部管理员可以加 `role_code = 'hq_admin'`（待 Phase 2）——本次接通先不动。

---

## 6. 验证步骤（First Steps Agent 在落地后跑一遍）

1. 启动 dev server，打开 First Steps → 登录页 → 用本项目里已存在的某个测试账号登录。
2. 打开浏览器 DevTools → Application → Local Storage，确认 key 是 `sb-narqwgwpqglathwtyevz-auth-token`。
3. 进 `/assets` 页，确认能看到本项目数据库里已有的素材（按 shop 过滤）。
4. 进 `/aigc/video`，订阅一个 running 状态的 `marketing_video_jobs` 看 Realtime 推送是否正常。
5. 调一次 `supabase.functions.invoke('describe-marketing-images', { body: { image_urls: [...] } })`，确认返回成功（说明跨项目调用 Edge Function 通了）。

---

## 7. 后续协作约定

- **本项目（Genie）**：所有 Edge Function、schema、RLS 的源头。改动后通知 First Steps Agent 同步 `types.ts`。
- **First Steps（PC）**：只做 UI 层、SSR loader、`createServerFn` 包装 Edge Function 调用。**绝不直接 ALTER TABLE / CREATE POLICY**——所有数据库变更都回到本项目提 migration。
- 文档源：本项目 `docs/marketing-center-api.md`（API 详细）+ 本文件（接入手册）。

---

## 8. 给 First Steps Agent 的一键执行清单

```text
□ 确认 Lovable Cloud 未启用（若已启用，停下来联系用户）
□ 写入 .env（3 个变量，照抄第 1 节）
□ bun add @supabase/supabase-js
□ 创建 src/integrations/supabase/client.ts（第 2.1 节）
□ 创建 src/integrations/supabase/client.server.ts（第 2.2 节）
□ 创建 src/integrations/supabase/auth-middleware.ts（第 2.3 节）
□ 用 cross_project 工具从项目 bef32724-503e-467a-af03-2062176cf921 复制 src/integrations/supabase/types.ts
□ 删除 src/api/client.ts 的 mock，删除 src/mocks/
□ 按第 3.2 节重写 src/api/*.ts
□ 复制 src/hooks/useShops.ts
□ 跑第 6 节验证步骤
```

完成后即可与 Genie 手机端共享同一数据库，所有营销中心功能（素材库 / AI 创作 / 视频生成 / 内容分发）在 PC 端立即可用。
