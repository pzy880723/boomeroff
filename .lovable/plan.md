## 诊断结论

目前账号新增卡住的主要问题不在二维码生成，而在扫码后的闭环：

- worker 的 `/login?type=3` 能正常返回二维码，格式是 `{status:"qrcode", image:"data:image/png;base64,..."}`。
- worker 的账号列表 `/getValidAccounts`、`/getAccounts` 当前返回空数组，所以你扫完后，前端没有任何账号能落到 `social_accounts` 表。
- 前端现在直接从浏览器写 `social_accounts`，缺少 `created_by` 等服务端兜底；一旦 worker 不回 `account_id` 或账号列表延迟更新，就会表现为“扫了没反应”。
- 现有 Edge Function 只转发 SSE，不负责持久化账号，也没有明确展示“已扫码、等待确认、worker 未发现新增账号”等状态。

## 修复目标

把“添加自媒体账号”改成稳定闭环：

1. 二维码能稳定显示。
2. 扫码后前端能实时显示状态。
3. 登录成功后由后端写入账号表，不再依赖前端自己拼数据写库。
4. 如果 worker 没有返回账号或账号列表仍为空，界面要明确提示原因和下一步，不再静默卡住。
5. 账号列表刷新能确认 worker 在线、账号是否有效。

## 实施计划

### 1. 修复 `dispatch-account-login` 的完整绑定流程

- 登录流命中实际 worker 端点：优先 `/login?type=N`。
- 兼容 worker 事件格式：
  - `{status:"qrcode", image:"..."}` → 二维码
  - `{status:"scanned"}` → 已扫码
  - `{status:"success"}` → 登录成功
  - `{status:"error"}` / `{status:"fail"}` → 失败
- 在函数内读取登录前后的 worker 账号列表，识别新增账号。
- 新增“延迟确认”机制：success 后连续轮询几次 `/getValidAccounts`，避免 worker 写 cookie 比 SSE success 慢。
- 成功识别账号后，Edge Function 直接写入 `social_accounts`，包括：
  - `shop_id`
  - `platform`
  - `worker_account_id`
  - `worker_account_key`
  - `account_name`
  - `avatar_url`
  - `cookie_status`
  - `created_by`
- 如果最终仍找不到账号，返回中文可读错误：例如“手机端已确认，但发布服务器没有写入账号 Cookie，请在手机端重新确认或重试”。

### 2. 前端弹窗只负责展示状态，不再直接写数据库

- `AddAccountDialog.tsx` 改为带 `shop_id` 调用登录函数。
- 收到 success 事件后直接显示绑定成功，并刷新账号列表。
- 去掉前端 `supabase.from('social_accounts').upsert(...)`，避免权限、字段、延迟导致失败。
- 增加更明确的状态文案：
  - 正在连接发布服务器
  - 二维码已生成
  - 已扫码，请在手机端确认
  - 已确认，正在同步账号
  - 绑定成功
  - 绑定失败 + 原因 + 重试按钮

### 3. 加固账号列表和 worker 状态展示

- `dispatch-account-list` 保持从数据库读账号，同时合并 worker 在线状态。
- 对 worker 返回空账号、离线、接口失败分别给前端更清晰的提示字段。
- 账号卡片显示：在线 / 已失效 / 发布服务器未确认。

### 4. 最小化数据库改动

- 先不新增表、不改核心权限。
- 如发现现有 `social_accounts` 写入策略无法覆盖当前用户门店，再补一条最小 RLS 修复迁移。
- 不改其它营销视频、素材库、发布任务逻辑。

### 5. 验证方式

- 直接测试 Edge Function：确认能收到二维码事件。
- 扫码后确认是否出现“已扫码 / 同步账号 / 成功或明确失败”。
- 查询 `social_accounts` 是否新增记录。
- 账号页刷新后确认账号可见。

## 需要你知道的一点

如果 worker 本身扫完后仍然让 `/getValidAccounts` 返回空数组，那前端和 Lovable 这边只能给出明确失败原因；真正的根因会在 worker 服务器里，通常是 Playwright 没保存 Cookie、平台风控、或 worker 没实现 success 后账号落盘。这个计划会把问题从“没反应”变成“准确显示卡在哪一步”。