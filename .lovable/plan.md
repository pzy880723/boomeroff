## 目标
1. **Me 页最底部**（"门店运营系统"上方）：使用新的红底白字方形 BOOMER GO 图（图 1）。
2. **顶部栏右侧 Logo**：全部改成图 2 的红字 BOOMER GO 横向文字，并去掉图片上下大量的白边。

## 具体改动

### 1. 素材处理
- 用图 1（`user-uploads://image-85.png`）**覆盖** `src/assets/boomer-go-logo.png`。这样 Me 页底部（`src/pages/Me.tsx` 第 281 行，通过 `APP_BRAND_LOGO`）和 AuthPage 引导页会自动跟着更新，无需改代码。
- 图 2（`user-uploads://image-86.png`）用 Python/Pillow **自动裁剪四周白色空白**后另存为新资产 `src/assets/boomer-go-wordmark.png`（横向文字 mark，专门给顶栏用）。

### 2. 顶部栏右侧 Logo 替换
下列文件将现有的 `boomer-off-vintage-logo` 或 `APP_BRAND_LOGO` 图片引用改为新的 `boomer-go-wordmark.png`：

- `src/pages/Home.tsx`：仪表盘顶栏右上角（当前 `brandLogo` 导入）
- `src/components/layout/PageHeader.tsx`：全站二级页顶栏右上角
- `src/components/layout/Header.tsx`：桌面/兜底 Header 的品牌位

同步把 `<img>` 的 `className` 从 `h-8 w-auto object-contain` 调整为适配文字 mark 的高度（约 `h-6 w-auto`），保证顶栏视觉高度与之前接近，不会因为文字更宽而顶破 12px header。

### 3. 不动的地方
- 公众端 / 分享卡 / 邀请页 / 密码重置页仍使用旧的 `boomer-off-vintage-logo.png`（属于对外顾客品牌 BOOMER-OFF，用户没要求改）。
- `src/assets/brand.ts` 的 `APP_BRAND_LOGO` 指向不变，只是文件内容被替换。

## 技术要点（供参考）
- 白边裁剪：`PIL.Image.open(...).convert("RGBA")` → `getbbox()` 基于非白像素得到裁剪框；对纯红字图上下留 ~2% padding 后 crop。
- 顶栏 h-12 容器中，方图适合 `h-8`，横向文字 mark 更适合 `h-5~h-6`（宽度自适应），否则文字太小或超出。

## 验收
- 打开"我的"页拉到最底部：看到新红底方块 BOOMER GO，下面接"门店运营系统 v0.2.0"。
- 打开首页 / 任意二级页：右上角显示红色 BOOMER GO 横向文字，上下无明显白边。
