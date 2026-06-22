## 目标

四件事一起做:
1. 上传/入库实时进度 + 失败原因 + 重试
2. 同 shop_id 的素材库实时同步(子账户也能看到)
3. 哈希去重提升到「整店」级别
4. 素材库标签/品类 + 筛选

---

## 1. 数据库迁移

```sql
-- 1.1 给 marketing_assets 加标签 + 强化去重元数据
ALTER TABLE public.marketing_assets
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS category text,         -- 单选品类(可空)
  ADD COLUMN IF NOT EXISTS sha256 text;            -- 从 meta 提升为正式列,便于索引

-- 回填一次历史 sha256
UPDATE public.marketing_assets
   SET sha256 = meta->>'sha256'
 WHERE sha256 IS NULL AND meta ? 'sha256';

CREATE INDEX IF NOT EXISTS idx_ma_shop_sha     ON public.marketing_assets(shop_id, sha256) WHERE sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ma_user_sha     ON public.marketing_assets(user_id, sha256) WHERE sha256 IS NOT NULL AND shop_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_ma_shop_tags    ON public.marketing_assets USING GIN (tags);

-- 1.2 RLS:扩展 SELECT/INSERT/UPDATE/DELETE 到「同 shop_id 的成员」
--      复用 staff_profiles.shop_id 关系判断成员归属
DROP POLICY IF EXISTS "own assets read"   ON public.marketing_assets;
DROP POLICY IF EXISTS "own assets write"  ON public.marketing_assets;
DROP POLICY IF EXISTS "own assets update" ON public.marketing_assets;
DROP POLICY IF EXISTS "own assets delete" ON public.marketing_assets;

CREATE POLICY "shop members read" ON public.marketing_assets FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR (shop_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.user_id = auth.uid() AND sp.shop_id = marketing_assets.shop_id
  ))
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "shop members write" ON public.marketing_assets FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);   -- 仍要求作者=自己

CREATE POLICY "own update" ON public.marketing_assets FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "own delete" ON public.marketing_assets FOR DELETE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 1.3 开启实时
ALTER PUBLICATION supabase_realtime ADD TABLE public.marketing_assets;
ALTER TABLE public.marketing_assets REPLICA IDENTITY FULL;
```

> 安全:写入仍要求 `user_id = auth.uid()`,任何成员只能用自己的身份入库,但同店其他成员可以读到。

---

## 2. 去重逻辑改成「整店共享」

`UploadGrid.tsx` 和 `LibraryImagePickerDialog.tsx` 的查重 SQL:

```ts
let q = supabase.from('marketing_assets')
  .select('id, output_url').eq('sha256', hash).limit(1);
if (shopId) q = q.eq('shop_id', shopId);
else q = q.eq('user_id', user.id).is('shop_id', null);
const { data } = await q.maybeSingle();
```

命中时直接复用 URL,toast 提示「已在素材库中复用」。

入库 insert 加上 `sha256: hash` 列(而不仅是 meta)。

---

## 3. LibraryImagePickerDialog 加进度/错误/重试 + 标签筛选

### 3.1 上传 UI 升级(与 UploadGrid 同款)

复用 `UploadGrid` 内部的 `ItemTile` 风格 —— 抽出成共享组件 `src/components/marketing/UploadProgressTiles.tsx`:
- 缩略图 + stage 圆环(compressing / uploading / done / error)
- 每张失败显示错误文案,点击 ↻ 重试
- 顶部细进度条 + "上传中 X/N"

`UploadGrid.tsx` 改用这个共享组件,行为不变。
`LibraryImagePickerDialog.tsx` 在「上传到素材库」按钮下方加同款进度区。

### 3.2 错误原因可见

`uploadMarketingImages` 已经在 `onProgress` 里回传 `error`;把它原样写到 tile 的 `error` 字段,失败时显示 `e.message`(如 `storage 上传失败 (403)`、`图片压缩失败`、`网络超时`、`已存在但 RLS 拒绝读取` 等)。
catch 的兜底 message 用 `e?.message || JSON.stringify(e).slice(0,80)`,不再吞成「上传失败」。

### 3.3 标签筛选 + 编辑

dialog 顶部加一条 chip 行:
```
[全部] [门头] [商品] [人物] [场景] [其他]   ＋自定义
```

数据来源:从当前店铺/当前用户已有 assets 的 `tags` 聚合 + 内置 6 个默认 chip。
点击 chip 触发 `q.contains('tags', [tag])` 重新查询。

每张缩略图右下角 hover/长按出「✎」打开 `AssetTagDialog`(新文件,极轻量):
- 多选 tags(可新增字符串)
- 单选 category
- 保存 → `update marketing_assets set tags=..., category=... where id=...`
不影响选图勾选状态。

`UploadGrid` 入库时:如果父页有 `defaultTags`(可选 prop),写入 assets.tags。
`MarketingLibrary` 列表页同步加 tag chip 筛选条。

---

## 4. 实时订阅

在 `LibraryImagePickerDialog.tsx`(open 时)和 `MarketingLibrary.tsx`(mounted 时)新增 `useEffect`:

```ts
useEffect(() => {
  if (!shopId) return;
  const ch = supabase.channel(`ma:${shopId}`)
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'marketing_assets', filter: `shop_id=eq.${shopId}` },
        () => load())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}, [shopId]);
```

debounce 500ms 合并 load。

---

## 5. 受影响文件

- `supabase/migrations/<ts>_marketing_assets_tags_shared.sql`(新)
- `src/pages/marketing/UploadGrid.tsx`(查重改 shop 级、把 ItemTile 抽出)
- `src/components/marketing/UploadProgressTiles.tsx`(新,共享进度瓦片)
- `src/components/marketing/LibraryImagePickerDialog.tsx`(进度/错误/重试 + tag chip + 实时订阅)
- `src/components/marketing/AssetTagDialog.tsx`(新,改 tags/category)
- `src/pages/marketing/MarketingLibrary.tsx`(tag chip 筛选 + 实时订阅 + 单图标签编辑入口)
- `src/lib/fileSha256.ts`(确认存在,无改动)

不动:`uploadMarketingImages.ts`、edge functions、`marketing_video_jobs`、其它 RLS。

---

## 6. 验证

1. 主账号上传 3 张图(含 1 张重复)→ 进度条满、toast「新增 2 / 去重 1」、列表立刻多 2 张。
2. 故意断网 → tile 显示具体错误,点 ↻ 恢复后成功。
3. 子账号(同 shop_id)登录素材库 → 看到主账号刚传的图;主账号再传 1 张,子账号页面 1s 内出现新缩略图。
4. 子账号上传同 hash 文件 → 命中复用,不产生第二行记录。
5. 给某图打「门头」tag → 列表 chip 选「门头」只剩这一张;LibraryImagePickerDialog 同样能筛。