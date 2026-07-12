
# 活动风控升级（精简版）

只保留两件事：**领券前粉丝数识图** + **领券后小红书发文核查**。不做黑名单、逾期惩罚、提醒短信、pg_cron。

## 一、活动配置

`activities` 表新增：
- `min_followers int default 1000` — 0 表示不校验
- `platform text default 'xiaohongshu'`

`ActivityEditor` 加"最低粉丝数"输入框，默认 1000。

表单字段（`form_fields`）新增一个字段角色：某个 `type='image'` 字段可勾选 `role='profile_screenshot'`（小红书主页截图），某个 `type='text'` 字段可勾选 `role='xhs_profile_url'`（小红书主页链接）。识图和后续核查都用这两个 role 定位字段，不用硬编码 key。

## 二、领券前：粉丝数识图校验

改造 `activity-apply`。在校验完 OTP、处理完 image 字段的 base64 上传之后，插入 application 之前：

1. 若 `activity.min_followers > 0`，在 `form_fields` 找 `role='profile_screenshot'` 的字段，取到刚上传的 storage path；找不到直接跳过（后台没配置就不校验）。
2. 用 service role 从 `voucher-screenshots` 桶 download 该文件 → 转 base64。
3. 调 Lovable AI `google/gemini-2.5-flash`（vision），system prompt 明确"只输出 JSON"：
   ```
   {"followers": number|null, "note": "ok"|"not_xiaohongshu"|"unreadable"}
   ```
   粉丝数支持 "1234" / "1.2万" / "1234w"，统一转成整数。
4. 结果写入 `activity_applications.form_data.__profile_check = { followers, note, model, checked_at }`（即使通过也留档，方便后台复查）。
5. 判定：
   - `note != 'ok'` → 400 `{ error: '未能识别为小红书主页截图，请重传' }`
   - `followers < min_followers` → 400 `{ error: '识别到粉丝数 X，未达 1000 门槛，暂不能领取' }`
6. 通过 → 走原逻辑发券。

前端 `PublicActivityApply` 捕获错误信息，把识别到的粉丝数展示给用户。

## 三、领券后：小红书发文核查（外部 Worker + 用户登录 Cookie）

关于"搜索肯定要登录"这一点，方案是：**由店主/管理员在后台配置一个自用的小红书账号 Cookie，Worker 用它去带登录态抓取用户主页**。分两层：

### 3.1 后台配置

在 `app_settings` 加两条 key：
- `xhs_worker_cookie` — 小红书 web 版 cookie 字符串（`web_session=xxx; a1=xxx; ...`），管理员登录小红书 web 版后从浏览器 DevTools 复制粘贴到 `/portal → 活动风控` 新 tab。
- `xhs_worker_user_agent` — 配对的 UA（防止风控），有默认值。

Cookie 走 `app_settings`（仅 admin 可读写），不落前端。Worker 通过 `xhs-worker-config` edge function 拉取（`X-Worker-Token` 鉴权）。

### 3.2 用户提交发文

领券成功后的 `activity-feedback` 反馈页新增：
- 输入小红书笔记链接（`https://www.xiaohongshu.com/explore/xxx` 或 `xhslink.com/xxx` 短链）
- 现有截图上传保留

提交时写入 `activity_applications` 新字段：
- `xhs_note_url text`
- `xhs_note_id text` — 从 URL 提取的笔记 ID
- `xhs_verify_status text default 'pending'` — pending / running / verified / not_found / mismatch / failed
- `xhs_verify_last_at timestamptz`
- `xhs_verify_attempts int default 0`
- `xhs_verify_result jsonb` — 存 Worker 回写的详情（笔记标题、作者主页 ID、发布时间、匹配到的关键词）

### 3.3 Worker 核查链路（沿用 compose Worker 模式）

3 个新 edge function，`verify_jwt=false`，`X-Worker-Token: $XHS_WORKER_TOKEN`（`generate_secret`）：

1. **`xhs-verify-claim-next`**
   - 拉取待核查任务：`xhs_verify_status IN ('pending','failed')` 且 `xhs_verify_attempts < 5` 且 `xhs_note_url IS NOT NULL`。
   - 原子更新为 `running`，`xhs_verify_last_at=now()`，attempts+1。
   - 同时返回 `xhs_worker_cookie` + `xhs_worker_user_agent` + `xhs_profile_url`（申请时通过 `role='xhs_profile_url'` 字段填的）+ 活动关键词（活动名 / 门店名 / 券名，用于命中判断）。
   - 无任务返回 `{ empty: true }`。

2. **`xhs-verify-heartbeat`** — 同 compose，更新 `xhs_verify_last_at`。

3. **`xhs-verify-callback`** — Worker 抓完回写：
   - `{ verified: true, note_title, author_profile_url, published_at, matched_keywords }` → `xhs_verify_status='verified'`
   - `{ verified: false, reason: 'author_mismatch'|'not_found'|'no_keyword'|... }` → 对应状态
   - 写入 `xhs_verify_result`

### 3.4 Worker 侧的抓取逻辑（Codex 那边实现，本项目不写）

用管理员 cookie + UA 请求：
1. 拿 `xhs_note_url`：抓 `https://www.xiaohongshu.com/explore/{note_id}`（或短链跳转后）→ 解析笔记详情（标题/正文/作者主页 URL/发布时间）。
2. 校验作者主页 URL == 用户提交的 `xhs_profile_url`（防止贴别人的爆款）。
3. 校验正文/标题包含 `matched_keywords` 中任一（防止提交无关笔记）。
4. 全部通过 → callback verified。

Cookie 失效时（Worker 收到 XHS 登录跳转）→ callback `failed`，管理端在 `/portal` 看到"Cookie 已失效"提示，重新粘贴即可。

## 四、管理端

`/portal` 活动详情页 application 列表加两列：
- 粉丝数（`form_data.__profile_check.followers`）
- 小红书核查状态（`xhs_verify_status` + 点开看笔记链接和匹配结果）

新增 `/portal → 活动风控` tab：填写 XHS Cookie / UA、显示"Cookie 最后一次生效时间"。

## 五、需要用户/系统各做什么

- **系统自动**：`generate_secret` 生成 `XHS_WORKER_TOKEN`；migration；edge functions；前端。
- **只需用户做一次**：在小红书 web 版登录一个自用账号，复制 cookie 粘到 `/portal → 活动风控`。除此之外无需再动。

## 技术细节（可跳过）

- Gemini vision 调用：`POST https://ai.gateway.lovable.dev/v1/chat/completions`，`response_format: { type: 'json_object' }`，`messages[].content` 用 `image_url` 块传 base64 data URL。
- Storage download → base64：`admin.storage.from('voucher-screenshots').download(path)` → `arrayBuffer` → `btoa(String.fromCharCode(...new Uint8Array(...)))`（分块避免栈溢出）。
- XHS 笔记 ID 提取：`/explore/([0-9a-f]{24})` + 短链 `xhslink.com/*` 先 HEAD 跟随重定向拿真实 URL。
- 施工顺序：migration（activity/application 新字段 + app_settings 两条 key 占位）→ `activity-apply` 加识图 → 3 个 xhs-verify edge function → `xhs-worker-config` 拉 cookie 的 function → 前端 `ActivityEditor` / `PublicActivityApply` / `ActivityFeedbackView` / `/portal` 风控 tab。
