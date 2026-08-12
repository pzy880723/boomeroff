# BOOMER GO 启动性能 只读审计报告

未修改任何代码、数据库、Edge Function，未执行任何写 SQL。

## 0. 重要前提：生产库当前查询通道不可用

本轮所有实时数据库查询均失败：

- `read_query`（含 `select 1`）返回 `544 Connection terminated due to connection timeout`
- `slow_queries`（pg_stat_statements）同样 544 失败
- `db_health`（metrics）返回 `521`

因此**行数、真实索引清单、慢查询排行本轮无法取到真实值**，不做任何编造。下面的结论基于迁移文件（DDL 权威来源）与前端查询代码的静态审计；行数与慢查询待数据库恢复后补测（第 5 节给出待执行的只读 SQL）。

## 1. 首页启动实际发起的查询（静态确认）

登录后进入首页，串并行发起约 **17–20 次** PostgREST 请求，分布在 5 个来源：

| 来源 | 查询 |
|---|---|
| `useAuth` | `user_roles` by user_id |
| `usePermissions` | `user_roles` by user_id（**重复第二次**）→ 串行 `app_role_permissions` by role_code |
| `Home.tsx` | 并行 5 条：`profiles`、`staff_profiles`、`shift_schedules`(today/tomorrow)、`shop_shifts`(全表)、`user_check_ins`；随后**串行** `activities` → `staff_profiles`(同店过滤) →（有 shop 时）`operation_okrs`；另一条链 `daily_encouragement` → 未命中则调用 edge function |
| `useTasks` | 并行 5 条：`exp_pending`、`products` count、`knowledge_test_results` count、`community_posts` count、`task_claims` |
| `useNotifications` | `rpc has_role` → `notifications`(limit 60) + `notification_reads` → `profiles` in(authorIds) |

关键瓶颈是**串行深度**而非单条查询：`useAuth → usePermissions(2 跳) → 组件渲染` 与 `Home 的 activities → staff_profiles → operation_okrs`、`useNotifications 的 has_role → notifications → profiles` 都是 3 跳串行往返，移动端每跳含 TLS/冷启动开销。

## 2. 索引现状（迁移文件中确实存在的）

- `shift_schedules`: `(work_date)`、`(user_id, work_date)`、`(shop_id, work_date)` — 覆盖首页查询，充分
- `user_check_ins`: `(user_id, check_in_date DESC)` — 充分
- `knowledge_test_results`: `(user_id)`、`(user_id, passed_at)` — 充分
- `exp_pending`: `(user_id) WHERE claimed_at IS NULL` — 充分
- `notifications`: `(active, created_at DESC)`；`notification_reads`: `(user_id)`
- `community_posts`: `(created_at DESC)`、`(user_id)`、`(category)`
- `products`: `(image_hash)`、`(name, category)`
- `staff_profiles`: `(shop_id)`
- `user_roles`: 仅 `(suspended) WHERE suspended`（部分索引）

## 3. 缺失或无效索引（按当前前端查询条件）

| 表 | 前端条件 | 现状 | 结论 |
|---|---|---|---|
| `user_roles` | `.eq('user_id', …)`（每次启动至少 2 次 + has_role 内部再查） | 只有 suspended 部分索引；user_id 是否有 unique 约束未能在线确认 | **需确认**，无则必须补 |
| `app_role_permissions` | `.eq('role_code', …)` | 迁移中未见任何索引 | **缺失** |
| `profiles` | `.eq('user_id')`、`.in('user_id', […])` | 迁移中未见显式索引（可能靠 PK/unique） | **需确认** |
| `staff_profiles` | `.eq('user_id')` | 只有 `(shop_id)` | **需确认 user_id 唯一约束**，无则补 |
| `products` | `created_by + created_at` 范围 count | 只有 image_hash / name+category | **缺失**，每日任务 count 会走 seq scan |
| `community_posts` | `user_id + created_at` 范围 count；`is_public + created_at` | 只有单列 | **建议复合索引** |
| `task_claims` | `user_id + claim_date` | 未见索引 | **缺失**（若无同列唯一约束） |
| `notification_reads` | `user_id`（已有） | 足够 |  |
| `shop_shifts` | 全表 select，无过滤 | 小表 | 无需索引，但**首页取了全部字段全表**，可缓存 |
| `activities` | `status='active'` + `order starts_at desc` | 未见索引 | **缺失** |
| `operation_okrs` | `shop_id` + `period_start<=today<=period_end` | 未见索引 | **缺失** |
| `daily_encouragement` | `.eq('date')` | 未见索引 | **需确认唯一约束** |
| `notifications` | `order created_at desc limit 60`（**未过滤 active**） | 有 `(active, created_at)` | 现查询用不上该索引前缀 → **无效索引**，要么查询加 `active=true`，要么补 `(created_at DESC)` |
| `knowledge_test_results` | `user_id + passed_at not null + 范围` | 已有 | 可选部分索引优化 |

## 4. bootstrap RPC 评估：适合，且是本次收益最大的一项

结论：**适合新增** `public.app_bootstrap()`，`security invoker` + `stable`，返回单个 jsonb。

理由与安全边界：

- 用 **SECURITY INVOKER**（不是 definer），函数内所有查询依旧受调用者 RLS 约束，权限零放宽；只把 3 跳串行网络往返压缩成 1 跳。
- 只读、无副作用（不写 `user_check_ins`、不写 `exp_pending`），`stable` 且 `set search_path = public`。
- 一律以 `auth.uid()` 为主体，不接受 user_id 参数，杜绝越权探测。
- 仅授权 `authenticated`，不授权 `anon`。
- 返回内容限定为首页首屏必需：role_code + 权限数组、profile/staff/shop、今日与明日排班、今日是否打卡、未领经验条数、未读通知数。列表类（通知全文、活动、OKR、社区）仍走原查询懒加载，避免函数变重。

预期效果：首屏阻塞往返从 ~5 跳降到 1–2 跳；配合索引补齐，冷启动可见收益主要来自往返数下降。

## 5. 建议 SQL 草案（仅草案，本轮不执行）

### 5.1 先跑的只读核查（数据库恢复后）

```sql
-- 行数
select relname, n_live_tup from pg_stat_user_tables
where schemaname='public' and relname in (
 'user_roles','app_role_permissions','profiles','staff_profiles','notifications',
 'notification_reads','exp_pending','products','knowledge_test_results','community_posts',
 'task_claims','shift_schedules','shop_shifts','user_check_ins','activities',
 'operation_okrs','daily_encouragement') order by n_live_tup desc;

-- 现有索引与约束
select tablename, indexname, indexdef from pg_indexes
where schemaname='public' and tablename in (/* 同上 */) order by tablename;

-- 未使用索引 / 顺序扫描热点
select relname, seq_scan, seq_tup_read, idx_scan from pg_stat_user_tables
where schemaname='public' order by seq_tup_read desc limit 20;
```

### 5.2 索引草案（确认不存在后再建）

```sql
create index if not exists idx_user_roles_user on public.user_roles(user_id);
create index if not exists idx_arp_role_code on public.app_role_permissions(role_code);
create index if not exists idx_profiles_user on public.profiles(user_id);
create index if not exists idx_staff_profiles_user on public.staff_profiles(user_id);
create index if not exists idx_products_creator_created on public.products(created_by, created_at desc);
create index if not exists idx_cposts_user_created on public.community_posts(user_id, created_at desc);
create index if not exists idx_cposts_public_created on public.community_posts(is_public, created_at desc);
create index if not exists idx_task_claims_user_date on public.task_claims(user_id, claim_date);
create index if not exists idx_activities_status_starts on public.activities(status, starts_at desc);
create index if not exists idx_okrs_shop_period on public.operation_okrs(shop_id, period_start, period_end);
create index if not exists idx_daily_enc_date on public.daily_encouragement(date);
create index if not exists idx_notifications_created on public.notifications(created_at desc);
```

（若某列已有 PK/unique，则对应索引跳过，不重复建。）

### 5.3 bootstrap RPC 草案

```sql
create or replace function public.app_bootstrap()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Asia/Shanghai')::date;
  v_role text;
  result jsonb;
begin
  if uid is null then return jsonb_build_object('error','unauthenticated'); end if;

  select coalesce(role_code, case when role='admin' then 'super_admin' else 'staff' end)
    into v_role from public.user_roles where user_id = uid limit 1;

  select jsonb_build_object(
    'role_code', v_role,
    'permissions', coalesce((select jsonb_agg(permission_key)
       from public.app_role_permissions where role_code = v_role), '[]'::jsonb),
    'profile', (select to_jsonb(p) from (
        select display_name, avatar_url from public.profiles where user_id = uid) p),
    'staff', (select to_jsonb(s) from (
        select real_name, shop_id, position from public.staff_profiles where user_id = uid) s),
    'shifts', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select work_date, shift_code from public.shift_schedules
        where user_id = uid and work_date between today and today + 1) x), '[]'::jsonb),
    'shop_shifts', coalesce((select jsonb_agg(to_jsonb(y)) from (
        select code, name, start_time, end_time, color from public.shop_shifts) y), '[]'::jsonb),
    'checked_today', exists(select 1 from public.user_check_ins
        where user_id = uid and check_in_date = today),
    'pending_exp', (select count(*) from public.exp_pending
        where user_id = uid and claimed_at is null),
    'unread_notifications', (select count(*) from public.notifications n
        where not exists (select 1 from public.notification_reads r
          where r.notification_id = n.id and r.user_id = uid))
  ) into result;

  return result;
end;
$$;

revoke all on function public.app_bootstrap() from public, anon;
grant execute on function public.app_bootstrap() to authenticated;
```

前端配套（不在本轮范围）：`useAuth`/`usePermissions`/`Home` 首屏改为消费一次 `rpc('app_bootstrap')`，其余保持懒加载。

## 6. 建议优先级

1. 数据库恢复后跑 5.1 核查，确认索引真实缺口与慢查询（本轮无法取得）
2. 补 5.2 中确认缺失的索引（低风险、立竿见影）
3. 落地 5.3 bootstrap RPC 并改造首屏，去掉 `user_roles` 重复查询与 3 跳串行
4. `notifications` 查询补 `active=true` 过滤，让既有复合索引生效
