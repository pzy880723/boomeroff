## 目标

防止同一用户名重复提交注册申请：当用户名已被占用（无论是待审核、正常、还是被暂停），都拒绝再次注册并给出清晰提示。管理员删除该用户后，用户名释放，可重新申请。

## 现状

- `supabase/functions/public-register/index.ts` 调用 `auth.admin.createUser`，依赖 Auth 层的唯一性约束。
- 重复时返回的提示是「用户名已存在」，但用户分不清是「我之前已申请过、在等待审核」还是「别人占用了」，会反复尝试。
- 数据库查询确认目前没有重复的 `user_roles`，说明 Auth 层确实已经挡住了重复账号，问题主要在「提示不清晰 + 体验上像是允许再次提交」。

## 方案

改造 `public-register` edge function，在创建账号前先用 service role 查询用户名状态，根据不同情况返回精准提示：

1. **用户已存在且 suspended=true（待审核）** → 返回 409，消息：「您已提交过申请，正在等待管理员审核，请耐心等待」。
2. **用户已存在且 suspended=false（已通过/正常）** → 返回 409，消息：「该用户名已被注册，请直接登录或更换用户名」。
3. **用户名未被占用** → 走原有 `createUser` + `suspended=true` 流程。

前端 `RegisterForm.tsx` 仅需透传 edge function 返回的 `error` 文案到 toast，无需新增字段。

## 技术细节

- 在 `public-register` 中通过 `admin.auth.admin.listUsers` 按 email (`${username}@boomeroff.local`) 过滤，或直接尝试 `getUserByEmail` 风格的查询；找到后再 `select role, suspended from user_roles where user_id = ...`。
- 用 HTTP 409（冲突）而非 400，便于前端区分；前端目前只读 `error` 字符串，行为不变。
- 不改数据库 schema、不改 RLS。
- `admin-create-user`（管理员手动建号）也加上同样的预检，避免管理员误建重复账号（可选，建议同步加）。

## 受影响文件

- `supabase/functions/public-register/index.ts`（修改）
- `supabase/functions/admin-create-user/index.ts`（同步加预检，可选）
- 不改前端、不改 DB schema

## 不做的事

- 不引入 `username` 唯一索引（auth.users.email 已经唯一）。
- 不改变「管理员删除用户后释放用户名」的现有行为——删除 auth.users 后 email 自动可复用。