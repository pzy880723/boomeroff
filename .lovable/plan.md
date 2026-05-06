## 问题诊断

当前 `web-search-images` 的实现有 3 个明显瓶颈：

1. **搜索方式低效**：用 Firecrawl `/search` 抓 6 个网页的完整 HTML（`scrapeOptions: { formats: ["html"] }`），再用正则从 HTML 里挖 `<img>`。这一步本身就要 5–15 秒，而且很多商品网站会反爬、返回登录页或空 HTML，所以经常挖不到图。
2. **镜像下载是串行的**：`for` 循环里一张一张 `await mirrorImage(...)`，每张最多 8 秒超时。要凑够 3 张图，最坏就是 24 秒。
3. **查询词不够精准**：`${query} 商品 真实图` 这种中文 query 在 Google 网页搜索里命中的不一定是图片密集的页面。

## 改造方案

### 1. 直接走 Firecrawl 图片搜索（核心提速）

Firecrawl v2 的 `/search` 支持 `sources: ["images"]`，直接返回图片 URL + 来源页 + 标题，**不需要再抓 HTML 也不需要正则解析**。这一步从 5–15 秒降到 ~1–2 秒，且命中率显著提高。

```ts
body: JSON.stringify({
  query: q,
  limit: 12,            // 多取一些做候选
  sources: ["images"],  // 关键：图片源
})
```

返回结构形如 `{ data: { images: [{ url, title, imageUrl, position }] } }`，直接用 `imageUrl`。

保留旧的 HTML 兜底逻辑，只在图片源返回 0 张时再退回去试一次（容错）。

### 2. 镜像下载改成并发

把串行 `for await` 换成 `Promise.allSettled`，一次性发起前 N 张候选的下载（N = `limit * 3`，比如要 3 张就并发拉 9 张），先到先得，凑够 `limit` 张就返回。整体耗时从 N×8s 降到约 1×8s。

```ts
const tasks = uniq.slice(0, limit * 3).map(c => mirrorImage(...));
const settled = await Promise.allSettled(tasks);
const ok = settled.filter(...).slice(0, limit);
```

### 3. 查询词优化 + 失败提示

- `intent: "gallery"` → 直接用 `query`（图片搜索本身已经够精准，不要加"商品 真实图"这种噪音词）
- `intent: "backstamp"` → `${query} backstamp 底款`
- 返回结果里加上 `reason` 字段：当 `images=[]` 时告诉前端是"未搜到"还是"全部下载失败"，方便排查。

### 4. 顺带的小修

- 把 `mirrorImage` 的下载超时从 8s 降到 6s（避免单张拖死整体）。
- 候选去重时按 URL 的"路径基名"去重，避免同一张图的不同尺寸缩略图占满候选位。

## 改动文件

- `supabase/functions/web-search-images/index.ts` — 按上述 4 点重写搜索 + 下载逻辑，前端无需任何改动（接口 schema `{ images, found }` 不变，只多加一个可选 `reason`）。

## 预期效果

- 平均耗时：**8–20 秒 → 2–5 秒**
- 命中率：明显提升（不再依赖网页能否被成功抓取并解析出 `<img>`）
- 用户感知：基本一次就能搜到 3 张图，失败时也有明确原因。