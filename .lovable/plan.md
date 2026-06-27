## 目标
1. 选素材弹窗加载更快  
2. 任何放大预览：右上有大且醒目的关闭按钮 / 点空白也能退出 / 左右滑切换图片 / 预览尺寸不再撑满屏幕导致点不到边缘

## 一、素材选择加载慢的根因
当前 `LibraryImagePickerDialog`、`LibraryAssetPickerDialog`、`CharacterPicker` 等弹窗在 3 列网格里直接用 `output_url` 原图（一张常常 1~3MB，120 张 = 几十 MB），并且没有 `loading="lazy"` / `decoding="async"`，所以打开就卡。

**优化**：
- 网格统一改成 `thumbUrl(url, 320)`（Supabase render 缩略图，单张约 20–40KB）
- 视频用 `thumbUrl(poster, 320)`
- 全部加 `loading="lazy"`、`decoding="async"`，首屏前 6 张用 `fetchPriority="high"`
- 列表 `limit` 从 120 调到 60，滚动到底加载更多（简单版：保留 60 + "加载更多" 按钮）
- 预加载只在 dialog 打开时执行，关闭后清空（已是这样，确认即可）

## 二、Lightbox 全面重做（`src/components/voucher/ImageLightbox.tsx`）
保留现有 props，只升级交互：

- **关闭按钮**：从 36px 增大到 **52px**，移到右上 + 加圆形白底 + 阴影；同时在底部居中再放一个「关闭」胶囊按钮（手指够得到的位置）
- **图片不再撑满**：`max-w-[88vw] max-h-[78vh]`，四周留出**至少 60px** 的可点击空白区
- **点空白关**：保留（现在已有），但因为图片现在小一圈，更容易点中
- **左右滑切换**：触摸滑动已有；额外加 **鼠标拖拽** 和 **图片下方圆点导航**
- **左右大箭头按钮**：从 40px 增大到 **56px**，垂直居中
- **键盘**：Esc 关、← → 翻页（已有）
- **页码**：`3 / 12` 改放到顶部胶囊里更显眼
- **iOS 安全区**：top/bottom 都加 `env(safe-area-inset-*)`

`PublicActivity.tsx` 内部还有一个简化版 ImageLightbox，统一替换成 `@/components/voucher/ImageLightbox`，免得一个地方好用、另一个不好用。

## 三、把"左右滑预览"接到所有还没接的地方
排查所有点开放大的位置，统一走升级后的 `ImageLightbox`：

| 位置 | 现状 | 改动 |
|---|---|---|
| `MarketingVideo.tsx` 分镜静帧 | 直接放大或没有 | 接入 lightbox，images = 全部分镜静帧 URL |
| `AssetDetailDialog.tsx` 图片素材 | 单图预览 | 接入 lightbox（多张时支持滑动） |
| `SurpriseVideoDialog.tsx` | 已接入 ✓ | 不动 |
| `LibraryImagePickerDialog` 长按 / 双击 | 暂无 | 选中按钮上加 ⓘ 角标，点角标走 lightbox（不冲突选择交互） |
| `CharacterPicker.tsx` 角色图 | 直接 img | 点击调 lightbox |
| `PublicActivity.tsx` 报名图 | 自带简化版 | 换成统一组件 |

## 技术细节
- 仍走 portal 到 `document.body`，仍 stopPropagation 防 Radix Dialog 误关
- 缩略图改造只影响展示，存库 / 选中回填的 URL 保持原图
- 不动后端、不动数据库

## 不在范围
- 不改素材库主页 `MyLibrary` 的视觉
- 不调整 Supabase render 图像服务的开关（默认已经可用）

## 影响文件
- `src/components/voucher/ImageLightbox.tsx`（升级）
- `src/components/marketing/LibraryImagePickerDialog.tsx`
- `src/pages/marketing/dispatch/LibraryAssetPickerDialog.tsx`
- `src/components/marketing/CharacterPicker.tsx`
- `src/components/marketing/AssetDetailDialog.tsx`
- `src/pages/marketing/MarketingVideo.tsx`
- `src/pages/public/PublicActivity.tsx`
