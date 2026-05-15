## 目标
把 `/u` 游客版迁移到一个全新的、独立后端的 Lovable 项目，老项目代码暂时保留不动。

## 一、需要你先手动做一件事

我无法在当前会话里直接创建新的 Lovable 项目。请你在 Lovable 工作区先做：
1. 新建一个空项目（建议命名 `boomeroff-public`）
2. 进新项目后开启 Lovable Cloud（独立后端）
3. 在该新项目里发一句话给我，比如"按方案把游客版迁过来"，我会用 `cross_project` 工具从当前项目把文件全部拉过去

下面是我在新项目里会执行的全部步骤（也就是当前项目这边只是"源仓库"）。

## 二、新项目的代码迁移

### 复制文件清单（保持原路径）
- `src/pages/public/PublicScan.tsx`
- `src/pages/public/PublicResult.tsx`
- `src/pages/public/PublicCommunity.tsx`
- `src/pages/public/PublicAbout.tsx`
- `src/components/layout/PublicLayout.tsx`
- `src/components/public/GuestOnboarding.tsx`
- `src/components/recognition/CameraStage.tsx`
- `src/components/recognition/GuestProductCard.tsx`
- `src/components/system/ErrorBoundary.tsx`
- `src/lib/chunkLoadRecovery.ts`（如已加）
- `src/hooks/useGuestRecognition.ts`
- `src/lib/imageThumb.ts`、`src/lib/shareCopy.ts`、`src/lib/utils.ts`
- `src/types/index.ts`（按游客版裁剪，只保留 `Product`/`Category` 等用到的类型）
- `src/assets/boomer-off-vintage-logo.png`、`src/assets/shop-wechat-qr.png`

### shadcn 组件
新项目里 `npx shadcn add button card`（其余按需）。`tailwind.config.ts` 和 `index.css` 设计 token 从老项目对应文件整体复制过去保持视觉一致。

### Edge Functions（在新项目重新创建）
- `supabase/functions/recognize-product-public/index.ts`
- `supabase/functions/submit-public-post/index.ts`
- `supabase/functions/generate-share-copy/index.ts`

需要的 secret：`LOVABLE_API_KEY`（新项目独立的）。如老 functions 还引用了别的 secret（如 `DOUBAO_API_KEY`），到时一并加。

### App.tsx 路由调整
新项目里去掉店员相关路由，`/` 直接渲染游客首页：
```tsx
<Routes>
  <Route element={<PublicLayout />}>
    <Route index element={<PublicScan />} />
    <Route path="result" element={<PublicResult />} />
    <Route path="community" element={<PublicCommunity />} />
    <Route path="about" element={<PublicAbout />} />
  </Route>
  <Route path="*" element={<NotFound />} />
</Routes>
```
同步把 `PublicLayout` / 各 Public 页面里的 `to="/u/..."`、`navigate("/u/...")` 全部改成 `to="/..."`。

## 三、新项目的数据库（独立 Cloud）

通过 migration 在新项目建：
- `community_posts`（裁剪掉店员独有列：`user_id`、`buy_reason`、`market_value` 等也保留即可，反正 anon 不写）
- `community_likes`、`community_comments`
- `guest_daily_usage`
- `profiles`（仅供 community 查 `display_name`/`avatar_url`，可暂时为空）
- 必要的 RLS：anon 可 SELECT 公开帖、anon 不能直接 INSERT（写入只走 edge function 用 service role）

不需要的表（`products`、`shops`、`shifts*`、`user_*`、`app_*` 等）一律不带过去。

## 四、当前项目这边

按你的要求 **不动**。等新项目跑通、你验证完再单独发起一次"清理"任务，我会一次性删除：
- `src/pages/public/`、`PublicLayout.tsx`、`GuestOnboarding.tsx`、`useGuestRecognition.ts`、`GuestProductCard.tsx`
- `App.tsx` 里 `/u/*` 路由块
- 3 个 `*-public` / `submit-public-post` edge functions
- `guest_daily_usage` 表
- 收紧 `community_posts` 的 RLS（删 `Public posts readable by anon`）

## 五、域名/上线

- 新项目发布后会得到 `xxx.lovable.app` 子域；如想换正式域名（例如 `try.boomeroff.com`），在新项目 Project Settings → Domains 单独绑定
- 老项目继续用 `boomeroff.lovable.app`，二者完全独立

## 你接下来要做的

去 Lovable 工作区新建项目并开启 Cloud，然后在那个新项目里 @ 我开工。要不要我现在先做一件准备工作——**把上面要复制的所有源文件清单导出一份 manifest（含每个文件大小/路径），方便你核对**？如果要，我下一步就生成。