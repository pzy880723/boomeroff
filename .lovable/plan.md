
## 目标

按火山官方方案（https://www.volcengine.com/docs/82379/2333589）把真人肖像走「H5 活体认证 → 私域 Asset」通道，后续 Seedance 渲染用 `asset://` URI 引用，跳过真人审核拦截。

## 一、密钥入库

- 把您贴的 AK/SK 通过 `set_secret` 保存为：
  - `VOLC_ACCESS_KEY_ID`
  - `VOLC_SECRET_ACCESS_KEY`
- 仅 Edge Function 后端使用（签 Volc V4），不下发前端。

## 二、数据库迁移

新增 1 张表 + 角色表加 3 列：

- `marketing_character_assets`：每个角色一条记录，记录认证状态、私域 asset_id、`asset://` URI、过期时间、最近一次 verify_session_id、错误信息。
- `marketing_characters` 增加：
  - `verified_asset_id text`（私域资产 ID）
  - `verified_asset_uri text`（`asset://xxx`，渲染时直接用）
  - `verified_at timestamptz`
- RLS：只有角色所在 shop 的成员能读写；service_role 全权。

## 三、Edge Functions（4 个）

全部使用 `VOLC_ACCESS_KEY_ID/SECRET` 做 Volc V4 签名（HMAC-SHA256），不依赖 ARK key：

1. `volc-identity-create-session`
   - 入参：`character_id`
   - 调用火山「创建真人认证会话」接口，返回 H5 跳转 URL + session_id；写入 `marketing_character_assets`（状态 `pending`）。

2. `volc-identity-poll`
   - 入参：`character_id` 或 `session_id`
   - 轮询火山结果接口；通过后拿到肖像资产，调用「资产入库」把人脸图入到火山私域 Asset，拿到 `asset_id` 和 `asset://` URI；写回 `marketing_characters.verified_asset_id/uri/verified_at`，状态置 `verified`。失败写入 `error_reason` + 状态 `failed`。

3. `volc-identity-revoke`（可选）
   - 删除/失效私域资产，清空角色上的 verified 字段。

4. 改造 `render-marketing-video`
   - 渲染参数里如果角色 `verified_asset_uri` 存在，把 `reference_image` / `first_frame` 中对应该角色的真人图替换成 `asset://...`；否则保持现行三级降级。
   - 多段并行渲染同样适用。

## 四、前端改造

文件：`src/components/marketing/CharacterCard.tsx`、`CharacterCreateDialog.tsx`、`CharacterDialog.tsx`、新建 `IdentityVerifyDialog.tsx`。

- 角色卡片右上角新增徽章：
  - 未认证：灰色「未认证」+ 按钮「去认证真人」
  - 认证中：蓝色「认证中…」（轮询）
  - 已认证：绿色「已认证 ✓」+ 「重新认证」入口
- 点击「去认证」→ 调 `volc-identity-create-session` → 弹窗内显示二维码（PC 扫码）或直接跳转（移动端 webview）。
- 弹窗内每 3s 调 `volc-identity-poll`，成功后自动关闭并 toast；失败显示「人话化」原因 + 重试按钮。
- 角色被使用在视频生成时，UI 上提示「该角色已认证，渲染将直接使用您的真人形象」。

## 五、降级与排错

- 未认证角色保持现有 photoreal / 三级降级策略（去 first_frame → 去 reference → 纯文本）。
- 认证失败/资产过期时，自动回落到现有路径并在结果卡显示「角色未认证，已使用普通模式」。

## 六、验收

1. 新建一个真人角色 → 完成 H5 活体 → 卡片显示「已认证 ✓」。
2. 用该角色「惊喜一下」生成视频 → 后端日志显示 `asset://` 被携带 → 不再触发 "may contain real person" 拦截。
3. 未认证角色继续走旧逻辑，不影响现有功能。

---

确认无误后我切换到 build 模式，按以上顺序执行：先 `set_secret`，再迁移，再 4 个 Edge Functions，最后前端。
