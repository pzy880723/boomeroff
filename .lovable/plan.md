# 官方知识库加载提速

## 诊断（看代码看到的三个真慢点）

**1. 列表页 `select('*')` 拉了一堆列表根本不用的重字段**
`src/pages/OfficialLibrary.tsx:112` 一次拉 120 条，`*` 里包含：
- `body`（Markdown 长文，可能几 KB/条）
- `content`（jsonb：一句话、速记卡、话术、对比…全塞进来）
- `gallery`（图集 URL 数组）
- `video_url`、`source_product_id` 等

列表只用到 12 个字段（id/name/category/ip_name/summary/era/origin/cover_url/selling_points/tips/view_count/favorite_count/importance_score）。
**估算：payload 至少能从 300 KB+ 压到 30 KB 级别。**

**2. 列表页两次查询串行等**
先 `await` 拿 items 再 `await` 拿 favorites，用户主观感受 = 两段网络往返之和。改成 `Promise.all` 并行。

**3. 图片按"最大可能尺寸"取，而不是按 CSS 实际尺寸**
- 列表大图卡 `thumbUrl(cover, 480)`，手机 2 列每列 ≈ 180 CSS px × dpr 2 = **360 px 够用**；桌面 dpr 1 需要更小；现在统一按 480 拉。
- 列表模式缩略图 `thumbUrl(cover, 160)` 尺寸只有 56×56 CSS px，其实 112 就够。
- 详情 Hero `thumbUrl(cover, 1080)` 对手机没问题，但桌面用户拿 1080 也够，只是没上 `srcset`，会浪费一次判断。

用 `srcSet + sizes` 让浏览器按 dpr/视口自动选，能少下 30–50% 的字节。

**4. 详情页也在 `select('*')` 且串行查了 3 个请求**
`OfficialDetail.tsx:78/84/90`：主数据 → 收藏状态 → 个人库状态，三段串行。合并为一次 `Promise.all`；主数据本身也拆成"首屏必备字段"，`body` 这种超长 Markdown 延后到用户点"展开完整介绍"时再拉。

**5. 详情页 `increment_official_view` RPC 走 `await` 前置**
现在写的是 `void supabase.rpc(...)`，实际不阻塞，OK；但确认一下是否 fire-and-forget，不能挡首屏。

---

## 改法（只碰前端 + 一个可选索引，不动业务逻辑）

### A. `src/pages/OfficialLibrary.tsx`
1. `.select('*')` → `.select('id,name,category,ip_name,summary,era,origin,cover_url,selling_points,tips,view_count,favorite_count,importance_score')`。
2. items 查询和 favorites 查询用 `Promise.all` 并行。
3. 首屏先加载 **60 条**（`.limit(60)`），滚到底再加载下一段（简单 IntersectionObserver + `.range()`，或者干脆保留一个"加载更多"按钮）—— 首屏字节直接砍一半。
4. 图片改用 `srcSet`：
   - 大图卡：`srcSet="thumb(cover,240) 1x, thumb(cover,480) 2x, thumb(cover,720) 3x"` + `sizes="(max-width: 640px) 50vw, 240px"`
   - 列表小缩略图：`srcSet="thumb(cover,112) 1x, thumb(cover,224) 2x"`。
5. 给第 1 张封面加 `fetchpriority="high"`，其余保持 `loading="lazy"`。

### B. `src/pages/OfficialDetail.tsx`
1. 首屏 `select` 拆成两拨：
   - **首屏（必备）**：`id,name,category,ip_name,summary,era,origin,cover_url,selling_points,tips,view_count,favorite_count,importance_score,video_url,gallery,content,source_product_id`（去掉 `body`）。
   - **懒加载**：`body` 只在用户展开"完整介绍"那一刻按 id 再取一次。
2. 主数据 + 两个 `user_favorites` 查询用 `Promise.all` 一次发出，串行 3 段 → 并行 1 段。
3. 已存在的 `srcSet` 缺失同样补上（Hero、图集、底款）。

### C. `src/lib/imageUrl.ts`
新增一个 helper：
```ts
export function thumbSrcSet(url, base = 240) {
  return `${thumbUrl(url, base)} 1x, ${thumbUrl(url, base*2)} 2x, ${thumbUrl(url, base*3)} 3x`
}
```
（其实已经有 `thumbSrcSet`，直接用起来。）

### D. 可选：数据库索引
如果 `official_knowledge` 表已经上百条，加一个复合索引可以显著加速列表：
```sql
CREATE INDEX IF NOT EXISTS official_knowledge_cat_updated_idx
  ON public.official_knowledge (category, updated_at DESC);
```
排序页面（`ORDER BY updated_at DESC WHERE category = ?`）会直接命中索引。

---

## 预期效果
- 列表首屏 payload：**约 -70%**（少了 body/content/gallery + 120→60 条）。
- 列表图片字节：**-30% 到 -50%**（按 dpr 精准取图）。
- 详情首屏 RTT：**3 段串行 → 1 段并行**，首屏可交互时间预计快 300–800ms（取决于网络）。
- 加索引后，翻类目/换排序的数据库耗时基本可以忽略不计。

---

## 不做的事（避免误伤）
- 不动 `official_knowledge` 的字段结构、不改 RLS。
- 不动详情页的 UI 组件、不动排版和交互。
- 不引入新的图片 CDN 或缓存层（`/render/image/public/` 已经在做转码 + 边缘缓存，够用）。

如果同意，我进 build 模式一次改完 A/B/C；数据库索引（D）你说要不要一起加。