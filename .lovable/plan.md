## 问题诊断

### 1. 收藏后图片不显示
LiveStreamPanel 的 `toggleFavorite` 把 `capturedImage`（base64 dataURL）写进 `snapshot.image_url`。两个后果：
- base64 体积巨大，写进 jsonb 可能被截断或写入失败
- 即使写入成功，下次跨设备/刷新无法显示

正确做法：用 `products.image_url`（已上传到 storage 的真实 URL）。

### 2. 个人知识库无法打开详情
`MyLibrary.tsx` 卡片只有「移除」按钮，没有点击详情交互。三种来源 (`official` / `recognition` / `product`) 应分别跳转：
- `official` → 复用 OfficialLibrary 的 Dialog
- `recognition` / `product` → 跳到识别详情（基于 `products` 表）

## 修改方案

### A. `LiveStreamPanel.tsx` —— 收藏时改用真实 URL
`toggleFavorite` 内 insert 前先查 `products.image_url`，并补全 snapshot：

```ts
const { data: prod } = await supabase
  .from('products').select('image_url')
  .eq('id', currentProductId).maybeSingle();

snapshot: {
  name: displayResult.name,
  category: displayResult.category,
  cover_url: prod?.image_url || null,
  image_url: prod?.image_url || null,
  summary: displayResult.description || null,
}
```

### B. `MyLibrary.tsx` —— 卡片可点开详情

1. 卡片整体（封面 + 标题区）变成可点击。
2. 点击后打开统一的 `Dialog`：
   - 大图（cover_url / image_url）
   - 标题、来源 Badge、类目
   - 摘要 / selling_points / tips（按需从 source 表回查）
   - 底部按钮：`移除收藏`、对 `official` 类还显示 `查看完整官方资料`（路由到 /official-library?id=xxx）
3. 详情数据按 `source_type` 懒加载：
   - `official` → `select * from official_knowledge where id = source_id`
   - `recognition` / `product` → `select * from products where id = source_id`
4. 加 try/catch；若源数据已被删除，提示「原始资料已被删除」并只显示快照。

### C. 兜底：旧收藏的图片仍是 base64 怎么办
卡片渲染时检查：若 `cover` 以 `data:` 开头且长度 > 200KB（或就直接 startsWith 'data:'），则不渲染（已经写不进 jsonb 的话就是 null，无影响）。简单起见，按现状直接 `<img>` 即可，新收藏会用正确 URL，旧的破损记录用户可手动移除。

## 涉及文件
- `src/components/dashboard/LiveStreamPanel.tsx`：`toggleFavorite` 改 8 行
- `src/pages/MyLibrary.tsx`：增加 Dialog + 详情加载逻辑（约 +80 行）

## 不动
- 数据库结构、RLS、官方知识库页面
- 「申请收录到官方知识库」按钮逻辑

## 验收
1. 识别→收藏→进入「我的 → 个人知识库」，卡片有图片
2. 点击卡片弹出详情弹窗，含大图/卖点/小贴士
3. 官方收藏的卡片点开后有「查看完整官方资料」按钮，可跳到官方知识库
