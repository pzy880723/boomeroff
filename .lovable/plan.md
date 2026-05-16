## 验证目标

确认未登录状态下注册页的"所属门店"下拉框能加载到数据库中 `active=true` 的两家门店，并能完整走完一次注册提交流程（提交后应提示「注册成功，等待管理员审核」）。

## 数据库现状（已查）

`shops` 表当前有 2 条 active 记录：
- 上海中信泰富店
- 上海闵行728总部

匿名读取 RLS 策略 `shops read active by anon` 已存在，理论上 anon 角色可读。

## 验证步骤

1. 用 browser 工具打开预览 `/auth`（需先确保是未登录态，因为预览域名会自动用开发账号登录 — 会先调用 `signOut` 或直接清 sessionStorage 后强刷）。
2. 切到"注册"Tab，观察"所属门店"下拉框：
   - 期望：显示 2 个选项（上海中信泰富店、上海闵行728总部）
   - 异常：若显示「暂无可选门店」→ 说明 anon RLS 未生效，需要回查策略。
3. 填入测试账号：
   - 用户名：`qa_shop_<时间戳后4位>`
   - 真实姓名：`QA测试`
   - 门店：选第一个
   - 密码：`qa123456`
4. 提交，验证：
   - toast 出现「注册成功」
   - 数据库 `user_roles` 中该用户 `suspended=true`
   - `staff_profiles` 中存在该用户的记录且 `shop_id` 正确
5. 清理：删除该测试用户（auth.users + 级联），避免污染数据。

## 技术细节

- 预览域有 dev auto-login 逻辑（`useAuth.tsx` 中 `tryDevAutoLogin`），需要先 `sessionStorage.setItem('dev-autologin-tried','1')` 再刷新，或先 signOut 再切到注册页。
- 验证完成后通过 `supabase--read_query` 确认数据落库，再用迁移/insert 工具清理测试数据。
- 全程不修改任何业务代码；如果下拉框为空才需要排查 RLS。
