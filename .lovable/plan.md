# 官方 API 发布改造 · 数据库与边界方案评审

只做评审，本文件不含任何已执行的写操作。

## 现状（已核对）

- `social_accounts`：`worker_account_key text NOT NULL`、`worker_account_id int`、`cookie_status text NOT NULL default 'active'`、`platform_account_id`、`capabilities jsonb`、`content_kinds text[]`、`meta jsonb`。现有数据仅 3 行（xhs / douyin / wechat_video，均 cookie_status=valid）。
- `social_publish_targets`：`worker_task_id`、`status`、`progress`、`platform_post_id/url`、`claim_token`、`claim_expires_at`、`retry_count`、`last_step`。现有 6 行（success/cancelled）。
- `social_platform_specs`：6 个平台（xhs、douyin、kuaishou、wechat_video、bilibili、dianping），全部 `enabled=true`，无“是否有官方发布权限”的字段。
- RLS：三张表都是 `TO authenticated`，条件为 `has_role(admin)` / `is_erp_user()` / `staff_profiles.shop_id = 本行 shop_id`。**门店隔离条件是存在的**，不是裸 `TO authenticated`；真正的风险在于 `social_accounts` 的 SELECT 会把整行（未来含 token 列）暴露给同店任何店员。
- 现有 Cookie/扫码链路：`dispatch-account-login`（SSE 扫码，写 `worker_account_key`）、`dispatch-job-create`（用 `cookie_status/worker_account_key` 判活）。

结论：迁移的核心不是重建表，而是**加列 + 拆表 + 收敛可见列**，可以做到最小且可回滚。

## 1) social_accounts：从 cookie/worker 迁到官方授权

新增列（全部可空或带默认，不动旧列，保证回滚）：

```sql
alter table public.social_accounts
  add column if not exists auth_mode text not null default 'legacy_cookie',      -- official_oauth | unavailable | legacy_cookie
  add column if not exists provider text,                                        -- 官方开放平台标识，如 douyin_open
  add column if not exists provider_account_id text,                             -- 平台稳定账号 ID
  add column if not exists open_id text,
  add column if not exists union_id text,
  add column if not exists scopes text[] not null default '{}',
  add column if not exists token_status text not null default 'unknown',         -- active | expiring | expired | revoked | unknown
  add column if not exists access_token_expires_at timestamptz,
  add column if not exists refresh_token_expires_at timestamptz,
  add column if not exists reauth_required boolean not null default false,
  add column if not exists authorized_at timestamptz,
  add column if not exists last_token_check_at timestamptz;

create unique index if not exists social_accounts_provider_uidx
  on public.social_accounts (platform, provider_account_id)
  where provider_account_id is not null;
```

旧列处理（分两次发版，避免一次性破坏在跑的代码）：

- 第一次迁移：`alter table public.social_accounts alter column worker_account_key drop not null;`，`cookie_status` 保留但只读，不再写入。
- 第二次迁移（官方链路验收通过后）：`drop column worker_account_key, worker_account_id, cookie_status;`。

数据回填（只读现状后一次性 UPDATE，非 schema 变更）：现有 3 行标记为 `auth_mode='unavailable'`、`token_status='revoked'`、`reauth_required=true`，即刻停用 Cookie 账号，不做任何降级发布。

## 2) 密钥存放与访问边界

**原则：`access_token` / `refresh_token` / `client_secret` 一列都不进入 `public.social_accounts`。**

新建一张 Data API 不可达的凭证表：

```sql
create table if not exists public.social_account_secrets (
  account_id uuid primary key references public.social_accounts(id) on delete cascade,
  access_token text,
  refresh_token text,
  token_type text,
  raw jsonb not null default '{}',
  rotated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on public.social_account_secrets from anon, authenticated;
grant all on public.social_account_secrets to service_role;
alter table public.social_account_secrets enable row level security;
-- 不建任何 policy：authenticated / anon 永远读不到
```

- `client_id` 放 `social_platform_specs`（可公开），`client_secret` 只放 Edge Function Secrets（Project Settings → Secrets），永不入库、永不返回给浏览器。
- 允许触碰 secrets 表的只有 service-role Edge Function：`oauth-authorize-url`（只回 302 URL）、`oauth-callback`（换 token、写 secrets、更新 `token_status`）、`oauth-refresh-tick`（定时刷新）、`publish-dispatch`（取 token 调官方 API）、`publish-poll`（查审核状态）。
- 腾讯云 API Gateway 只做转发/回调入口，不持有 token；回调必须带签名（HMAC + 时间戳）并由 Edge Function 校验。
- 浏览器只读 `social_accounts` 的非敏感列（见第 4 节视图），任何情况下不 invoke 返回 token 的函数。

## 3) social_publish_targets：官方请求与审核结果

```sql
alter table public.social_publish_targets
  add column if not exists provider_request_id text,     -- 官方 API 返回的任务/发布 ID
  add column if not exists idempotency_key text,
  add column if not exists provider_status text,         -- 平台原始状态字符串
  add column if not exists review_status text not null default 'unknown', -- pending | approved | rejected | not_applicable
  add column if not exists review_reason text,
  add column if not exists review_updated_at timestamptz,
  add column if not exists provider_error_code text,
  add column if not exists callback_payload jsonb not null default '{}',
  add column if not exists callback_received_at timestamptz;

create unique index if not exists spt_idempotency_uidx
  on public.social_publish_targets (idempotency_key)
  where idempotency_key is not null;
```

- `idempotency_key` 由服务端生成 `job_id:account_id:attempt`，重复提交直接命中唯一索引，杜绝重复发帖。
- `worker_task_id` / `claim_token` / `claim_expires_at` 属于 Worker 抢单模型，第二次迁移随 Cookie 链路一起 drop。

## 4) RLS：门店隔离 + 列级收敛

现有 policy 已按 `shop_id` 隔离，保留不动；补两件事：

1. 列级收敛：撤掉 authenticated 对 `social_accounts` 的整表 SELECT，改为受限视图。

```sql
create or replace view public.social_accounts_public
with (security_invoker = true) as
select id, shop_id, platform, provider, account_name, avatar_url, account_remark,
       auth_mode, token_status, scopes, reauth_required,
       access_token_expires_at, authorized_at, content_kinds, capabilities
from public.social_accounts;

grant select on public.social_accounts_public to authenticated;
```

前端一律读视图，写操作走 Edge Function。

2. 防"仅 TO authenticated"越权：新增列的 UPDATE 不允许客户端改。把 `social_accounts` 的 staff UPDATE policy 收成只允许改 `account_remark/content_kinds`（用 BEFORE UPDATE 触发器锁定授权类列，policy 层无法做列级 check），授权状态只能由 service-role 写。

`social_account_secrets` 无 policy、无 grant，任何 JWT 都读不到。

## 5) 无官方发布权限的平台必须显式不可用

```sql
alter table public.social_platform_specs
  add column if not exists official_publish_status text not null default 'unavailable',
    -- available | pending_approval | unavailable
  add column if not exists official_note text;

update public.social_platform_specs
   set enabled = false, official_publish_status = 'unavailable'
 where platform in ('xhs','wechat_video','dianping');
```

- 服务端硬约束：`publish-dispatch` 在 `official_publish_status <> 'available'` 时直接 400，不存在任何模拟/人工补发分支。
- 前端在这些平台上只展示"暂未开放官方发布"，禁用选择，不提供扫码入口。

## Edge Function 边界

| 函数 | 角色 | 能否读 token |
| --- | --- | --- |
| oauth-authorize-url | anon+JWT 校验 | 否 |
| oauth-callback | service-role | 是（写入） |
| oauth-refresh-tick | service-role / cron | 是 |
| publish-dispatch | service-role | 是 |
| publish-poll / publish-callback | service-role + 签名校验 | 是 |
| 现有 dispatch-account-login / dispatch-job-create | 下线 | — |

## 回滚方法

- 迁移一（加列 + secrets 表 + 视图 + specs 状态）：全部 `add column if not exists`，回滚 = `drop column` / `drop table social_account_secrets` / `drop view`，旧 Cookie 列与旧 Edge Function 仍在，链路可原样恢复。
- 迁移二（drop 旧列）：不可逆，必须在官方链路连续发布验收通过、且对现有 6 行 targets / 3 行 accounts 做过 `create table ..._backup_20260817 as select *` 之后再执行。

## 验收标准

1. `information_schema.columns` 里 `social_accounts` 无任何 token 列；`social_account_secrets` 对 anon/authenticated 无 grant、无 policy。
2. 用普通店员 JWT 请求 `social_accounts` / `social_account_secrets` 均返回权限错误，只有视图可读且不含敏感字段。
3. 跨门店 JWT 读不到他店账号与 targets。
4. 同一 `idempotency_key` 重复调用 `publish-dispatch` 只产生一条平台发布，第二次返回既有 `provider_request_id`。
5. xhs / wechat_video / dianping 调用发布一律 400 `official_publish_status=unavailable`，代码中不存在 Cookie / Playwright / 扫码 / 人工补发分支（`rg` 全仓无 `worker_account_key`、`login_qrcode` 引用）。
6. token 到期前由 `oauth-refresh-tick` 自动刷新；刷新失败置 `reauth_required=true`，前端提示重新授权而非降级发布。
