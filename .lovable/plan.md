## 背景

登录采用「用户名 + 密码」（或手机验证码）。用户名会被拼成 `{username}@boomeroff.local` 后走 Supabase Auth，`auth.users.email` 只是内部占位符，不是真实邮箱，展示给管理员没有意义。

## 计划

1. **前端 `src/components/admin/UserTable.tsx`**
   - 移除 ✉️ 登录邮箱这一行展示。
   - 移除 `fetchUsers` 中对 `admin_list_user_emails` 的调用及 `emailMap` 相关逻辑，只保留手机号 / 门店 / 姓名 / 用户名展示。
   - 保留「未填手机」过滤 Tab 及手机号列，不做其他改动。

2. **后端（可选清理）`admin_list_user_emails` RPC**
   - 由于前端不再使用，可以通过一次 migration `DROP FUNCTION` 移除，避免留下无用的 SECURITY DEFINER 函数。
   - 如果你担心以后还会用（比如导出报表），也可以保留函数只删前端调用，请告诉我倾向。

3. 不修改登录流程、注册流程、手机绑定流程等其它模块。

## 需要你确认

- `admin_list_user_emails` RPC 要**一并 DROP 掉**，还是**保留函数只清理前端**？
