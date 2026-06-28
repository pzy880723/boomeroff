# 交付共享库接入所需的两样东西

## 1. anon public key（公开可入仓）

替换 `src/integrations/shared-db/client.ts` 里的 `__REPLACE_WITH_ANON_KEY__`：

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hcnF3Z3dwcWdsYXRod3R5ZXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0NDkwOTMsImV4cCI6MjA4MTAyNTA5M30.ZzkXVU8X0l1LOvT4wIMWwdarwDSdFm6GTaVhC4Xle2M
```

配套常量（确认无需改动）：
- `VITE_SUPABASE_URL = https://narqwgwpqglathwtyevz.supabase.co`
- `VITE_SUPABASE_PROJECT_ID = narqwgwpqglathwtyevz`
- localStorage key：`sb-narqwgwpqglathwtyevz-auth-token`

## 2. types.ts 同步（First Steps Agent 自取）

本项目 `src/integrations/supabase/types.ts` 现有 **2959 行**，且每次 migration 后自动重新生成。**不**通过聊天搬运全文。

让 First Steps 项目里的 Agent 执行一次：

```
cross_project--read_project_file({
  project: "bef32724-503e-467a-af03-2062176cf921",
  file_path: "src/integrations/supabase/types.ts",
  lines: "1-3000"
})
```

把结果整文件覆盖 `src/integrations/shared-db/types.ts`，然后把 `client.ts` 的泛型从 `any` 改成 `import type { Database } from "./types"`。

## 3. 后续同步约定

每当本项目跑过 migration（你会在我这边收到 schema 变更通知），First Steps Agent 重复上面那条 `cross_project--read_project_file` 即可，不需要我再走人工流程。

## 4. 验证清单（First Steps 那边贴完之后跑）

```text
□ client.ts 里 anon key 已替换，types 泛型已切到 Database
□ 启动 dev，打开 /auth 用本项目已有账号登录
□ DevTools → Application → Local Storage 出现 sb-narqwgwpqglathwtyevz-auth-token
□ 进 /_authenticated 下任意页面不被踢回 /auth
□ 浏览器 Console 执行 (await supabase.from('shops').select('id,name').limit(3)) 应返回非空数组
```

## 5. 等 First Steps 确认走通之后我下一步要做的（仅在你下达「开始」之后执行）

- 重写 `src/api/{assets,copy,aiImage,videoJobs,accounts,publishJobs,shops}.ts`：按 `docs/cross-project-shared-db.md` §3.2 映射到真实表，全部带 `shop_id` 过滤
- 复制本项目 `src/hooks/useShops.ts`，在 First Steps 落地 `useEffectiveShop()`
- 删 `src/mocks/` 整目录与 `src/api/client.ts` 的 mock 分支
- 把 `marketing_video_jobs` / `marketing_assets` / `social_publish_jobs` / `social_publish_targets` 的 Realtime 订阅接到对应页面

**注意**：上述第 5 步必须在你贴完 anon key + types.ts、并确认验证清单全部通过后再启动 —— 否则前端会大面积白屏。
