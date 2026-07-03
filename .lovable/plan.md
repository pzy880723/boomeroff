## 诊断结果

页面本身没有前端编译错误，首页在本地可以渲染；真正的异常来自后端接口：

- 失败接口：`staff_profiles`
- 错误原因：`infinite recursion detected in policy for relation "staff_profiles"`
- 影响：任何需要读取员工档案 / 门店 / 排班 / 首页信息的页面都可能加载失败或部分内容空白。

根因是上一轮安全修复里，为了限制 `staff_profiles` 真实姓名泄露，把同店判断写成了在 `staff_profiles` 的 RLS 策略里再次查询 `staff_profiles`，触发了数据库 RLS 递归。

## 修复计划

1. 新增一个安全的后端函数，用 `SECURITY DEFINER` 查询当前用户的 `shop_id`，避免在 `staff_profiles` 的 RLS 策略里直接递归查询自身。
2. 重建 `staff_profiles` 的读取策略：
   - 本人可以读取自己的员工档案。
   - 有 `staff.read` 权限的人只能读取同门店员工档案。
   - 管理员可读取员工档案。
3. 保留之前四个安全修复的意图，不改动其它扫描项：
   - 不放开验证码表读取。
   - 不恢复匿名 OKR 读取。
   - 不扩大优惠券领取手机号读取范围。
4. 验证首页 `/` 和 `staff_profiles` 请求不再 500，确认页面可打开。

## 技术细节

会通过 Lovable Cloud migration 执行类似以下修复：

```sql
CREATE OR REPLACE FUNCTION public.current_user_shop_id()
RETURNS uuid
SECURITY DEFINER
...

DROP POLICY IF EXISTS "staff read self or same shop manager" ON public.staff_profiles;
CREATE POLICY ... USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
  OR (
    public.user_has_permission(auth.uid(), 'staff.read')
    AND shop_id = public.current_user_shop_id()
  )
);
```

然后用浏览器打开首页确认不再报错。