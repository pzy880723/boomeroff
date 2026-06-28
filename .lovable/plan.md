
# 把 First Steps（PC 端）接入本项目的 Lovable Cloud 数据库

## 现状

- 对方项目：**First Steps**（ID `3a5a8bad...`），技术栈 **TanStack Start TS**，目前 `src/api/*` 全是 mock，无 `src/integrations/supabase/`。
- 对方 `.lovable/plan.md` 已经明确「共享 Genie 这个 Supabase 项目」，但 Phase 0 写的"Lovable UI 里 Connect → 选已有 Supabase"行不通——本项目是 **Lovable Cloud 托管的**，不会出现在外部 Supabase 项目列表里。
- 正确做法：让 First Steps 跳过 Lovable 的 Supabase Connector，**直接当成普通 Supabase 客户端用 URL + anon key 连**。

## 关键约束

- **First Steps 绝对不能点 "Enable Lovable Cloud"**——否则会被开一个独立的新数据库。如果之前不小心开过，要先关掉。
- **TanStack Start 是 SSR**，要同时维护 **客户端 client** 和 **服务端 client**（服务端用 service_role key 走 `createServerFn`）。
- service_role key 是高权限密钥，**只能放在服务端**，绝不能进 `VITE_` 前缀的环境变量。

## 跨项目限制说明

`cross-project` 工具是**只读**的——我可以看 First Steps 的代码，但**不能直接改它**。所以下面的实施会拆成两半：
- **本项目里我做**：写一份《PC 端接入手册》到 `docs/cross-project-shared-db.md`、生成"贴到 First Steps 的完整文件清单"。
- **First Steps 项目里 Agent 做**：您把这份手册贴进 First Steps 的对话，那边的 Lovable Agent 一键落地。我会把指令写得非常具体，让对方 Agent 零思考就能执行。

## 实施步骤

### Step 1（本项目）— 生成 PC 端接入手册

在本项目新建 `docs/cross-project-shared-db.md`，包含：

1. **连接参数**（直接可贴）：
   ```env
   # First Steps 的 .env
   VITE_SUPABASE_URL=https://narqwgwpqglathwtyevz.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGc...（本项目 anon key，公开可用）
   VITE_SUPABASE_PROJECT_ID=narqwgwpqglathwtyevz
   ```
   service_role key **不写在文档里**——让 First Steps 那边的 Agent 用 `add_secret` 工具向您本人索要并存到 Supabase Edge Function Secrets。

2. **客户端文件模板**（适配 TanStack Start）：
   - `src/integrations/supabase/client.ts`：浏览器端 client，用 `VITE_SUPABASE_*`，配 `persistSession + autoRefreshToken`。
   - `src/integrations/supabase/client.server.ts`：服务端 client，用 `SUPABASE_SERVICE_ROLE_KEY`，禁用 session 持久化。
   - `src/integrations/supabase/auth-middleware.ts`：`requireSupabaseAuth` 中间件，从 cookie 取 token 验证。
   - `src/integrations/supabase/types.ts`：**直接从本项目复制**，确保表类型对齐。

3. **使用示例**：
   - `useSuspenseQuery + queryOptions` 读 `marketing_assets`。
   - `createServerFn` 包装 `supabase.functions.invoke('render-marketing-video', ...)`。
   - Realtime 订阅 `marketing_video_jobs`。
   - Storage 签名 URL 生成。

4. **RLS 提示**：所有 insert 必须带 `shop_id`，需要做 `useShops()` 钩子；超级管理员通过 `user_roles.role = 'admin'` 识别。

5. **登录态共享说明**：
   - 同一 Supabase URL → localStorage key 一致（`sb-narqwgwpqglathwtyevz-auth-token`）。
   - 同域名自动共享，跨域名需要重新登录但 `user_id` 一致。

6. **Mock 清理清单**：列出 First Steps 里 `src/api/*.ts` 和 `src/mocks/` 哪些文件要删/改。

### Step 2（本项目）— 把 `types.ts` 准备成可复制版本

`src/integrations/supabase/types.ts` 是自动生成的，对方项目复制时要确认两边的 Supabase schema 完全一致。我会在 `docs/cross-project-shared-db.md` 里给出"如何同步 types"的指令：本项目每次 migration 后，把新的 `types.ts` 重新复制到 First Steps。

### Step 3（本项目）— 生成 Worker 共享密钥

如果走 Phase 3 的 Worker 回调路由，需要在本项目 `secrets--generate_secret WORKER_SHARED_SECRET`（32 字符随机串），然后在手册里告诉 First Steps 也用同一个值（让 First Steps 那边的 Agent 用 `set_secret` 写入同名 secret）。**本步先列出来，等您确认要不要做 Phase 3 再执行**。

### Step 4（First Steps 项目）— 您操作

把 `docs/cross-project-shared-db.md` 的内容粘贴到 First Steps 的对话，让那边 Agent：

1. 确认 Lovable Cloud **未启用**（若已启用，停下来找 Lovable 支持回滚）。
2. 写入 `.env`（用 Lovable 的 env 工具）。
3. 创建 4 个 supabase 集成文件。
4. 删除 `src/api/client.ts` 的 mock 层 + `src/mocks/` 目录。
5. 重写 `src/api/*.ts` 为真实表查询（按手册示例）。
6. 用 `set_secret` 存入 `SUPABASE_SERVICE_ROLE_KEY` 和 `WORKER_SHARED_SECRET`（值由您从本项目复制过去）。

### Step 5（双向验证）

我帮您写一个最小验证脚本（放本项目 `scripts/verify-shared-db.ts`，可选）：模拟以 First Steps 风格用 anon key 查 `marketing_assets`，验证 RLS 和 Realtime 都正常。

## 您需要确认的 3 件事

1. **是否同时需要服务端 client（service_role）？**
   - 需要 → 我会在手册里写完整的 `client.server.ts` + `auth-middleware.ts`；您要把本项目的 service_role key 通过安全渠道告诉对方 Agent。
   - 不需要 → 只生成浏览器端 client（所有写操作走 Edge Function + 用户 JWT），更安全。**推荐这条**。

2. **Phase 2 的"总部独有表"现在做吗？**
   - First Steps 的 plan 提到要新增 `headquarters_publish_batches` / `automation_tasks` / `hq_dashboard_metrics_v`。这些表会落到本项目数据库里。
   - 现在做 → 我现在就出 migration（带 `hq_admin` 角色 + RLS + GRANT）。
   - 之后再说 → 本次只解决"接通"。**推荐先接通再说**。

3. **types.ts 同步策略？**
   - 选项 A：每次本项目 migration 后，您手动从本项目复制 `types.ts` 到 First Steps。
   - 选项 B：在本项目里写一个 Edge Function `get-shared-types`（返回当前 types.ts 内容），First Steps 启动时拉取。复杂一点但永远同步。
   - **推荐 A**（简单可控）。

## 本次只动本项目这一个文件

`docs/cross-project-shared-db.md`（新建）。**不动任何运行代码，不动数据库**。

确认这 3 件事后我就进入 build 模式，先把手册写完整，您就能直接拿去 First Steps 那边粘贴。
