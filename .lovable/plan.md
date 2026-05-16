## 目标

让识别历史完全私有：每个店员只能看自己识别过的商品；管理员仍可看全部。

## 根因回顾

1. 数据库 `products` 表的 SELECT 策略是 `USING (true)`，所有登录用户都能读全部记录。
2. 前端 `History.tsx`、`LiveStreamPanel` 的"最近识别 / 当前商品"也没有按 `created_by` 过滤。
3. 哈希缓存（`recognize-product` edge function）会跨用户命中别人识别过的图片，这本来是性能优化，但也变成了"看到别人记录"的入口。

## 方案

### ① 数据库层（最关键，一次性堵死）

把 `products` 的 SELECT 策略改成：**只能看自己创建的 + 管理员看全部**。

```sql
DROP POLICY "Products viewable by all authenticated users" ON public.products;

CREATE POLICY "products select own or admin"
ON public.products FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR public.user_has_permission(auth.uid(), 'history.read_all')
);
```

`history.read_all` 权限默认只给"超级管理员"角色，普通店员没有。如果该权限 key 还没在 `app_permissions` 里就先插一条，并绑到 super_admin。

### ② 前端查询补一层显式过滤（双保险 + 性能）

- `src/pages/History.tsx`：列表查询追加 `.eq('created_by', user.id)`；管理员（`can('history.read_all')`）则不加过滤。
- `src/hooks/useDashboardData.ts`、`src/pages/Me.tsx`：已经按 `created_by = user.id` 过滤，不动。
- `src/components/dashboard/LiveStreamPanel.tsx`：
  - `current_session` 读到的 `product_id` 在展示前校验 `created_by === user.id`，否则当作"无当前商品"。
  - "最近识别"类查询同样追加 `created_by` 过滤。
- `src/pages/MyLibrary.tsx`：收藏的 product 如果是别人创建的，新 RLS 下会读不到，列表把它显示为 snapshot fallback 即可（已有 `missing: true` 分支），不需要额外改。

### ③ 哈希缓存改成"用户私有缓存"

`supabase/functions/recognize-product/index.ts` 里 hash 命中只在**当前用户自己**的历史里命中：

```ts
.from('products').select(...).eq('image_hash', hash).eq('created_by', userId)
```

这样别人识别过同一件东西，你拍它仍然走完整 AI 流程；好处是没有跨用户泄漏，坏处是缓存命中率下降。对小店少量店员场景影响可接受。

### ④ 历史数据处理

迁移**不会动**已有 `products` 行。新策略生效后：
- 之前别人识别的记录依然存在，但当前店员账号下看不见了——符合预期。
- 管理员（super_admin）仍然能在后台查到全部。

## 需要改的文件清单

- 一条 supabase migration（改 RLS + 插权限）
- `src/pages/History.tsx`
- `src/components/dashboard/LiveStreamPanel.tsx`
- `supabase/functions/recognize-product/index.ts`

## 不在本次范围

- `community_posts` 不动（社区帖本来就是公开的）。
- `price_records` 不动（沿用 `price.write` 权限模型）。
- 暂不做"识别记录批量迁移到正确归属者"，因为没有可靠依据判断旧记录该归谁。
