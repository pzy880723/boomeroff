## 根因

`src/lib/imageUrl.ts` 里的 `thumbUrl()` 写死了 `resize=cover`，导致 Supabase 渲染端在生成缩略图时就把图片裁掉一大半，只留中间一小块。列表里看到的"只显示一点点"就是这个 URL 参数干的，不是容器 CSS。

## 改动（一行核心修复 + 列表样式微调）

### 1. `src/lib/imageUrl.ts`
- `resize=cover` → `resize=contain`：保留完整画面，只按宽度等比缩放，永不裁剪
- 顺手让 `quality=72`（contain 模式下文件略大，提点质量）

### 2. 列表卡片的 `object-cover` → `object-contain`
现在 URL 不裁了，但卡片容器还是 `object-cover` 的话仍会被 CSS 切。把以下文件里**列表缩略图**的 `<img>` 改成：
```
className="w-full h-full object-contain bg-muted/30"
```

涉及文件：
- `src/pages/OfficialLibrary.tsx`（大卡片 L337 + 列表项 L369）
- `src/pages/MyLibrary.tsx`（L447）
- `src/pages/History.tsx`
- `src/pages/Community.tsx`
- `src/pages/public/PublicCommunity.tsx`

### 3. 详情页不动

详情页本来就是完整尺寸，没问题。

## 不做的事

- 不动已压缩的文件本身（它们没被裁，只是 URL 参数让 CDN 裁了）
- 不动 Firecrawl 重抓
- 不动 lightbox（已有）

改完所有列表里的图都是完整画面 + 浅底色留白，不再被切。