## 目标

把 `/me/marketing` 素材库从当前的"一行一条 + 小缩略图"列表，改为"一行多张大图"的图库（gallery）样式，更接近相册浏览体验。

## 改动范围

仅改 `src/pages/marketing/MarketingLibrary.tsx` 的列表渲染部分，其它逻辑（店铺切换、Tab、上传、管理/删除、视频拼接轮询、月份分组、点击进入详情）全部保持不变。

## 浏览方式调整

- **图片 Tab / 视频 Tab / 全部 Tab 中的图片和视频**：网格展示
  - 手机：每行 3 张；≥sm：每行 4 张；≥md：每行 5 张
  - 每个格子为正方形（`aspect-square`），缩略图 `object-cover` 填充
  - 视频格子右下角保留 `VIDEO` 角标，叠加一个半透明播放小图标
  - 不再显示文字标题/平台/时间等元信息，改为悬停或长按时显示（移动端直接保持简洁，点击进详情查看完整信息）
- **文案 Tab**：仍保留卡片列表样式（文字为主，网格不合适），但缩略尺寸调小、密度更紧
- **全部 Tab**：图片/视频走网格；文案以独立小节列表形式排在网格之后（按月分组内部先图后文）
- **月份分组标题**保留（"本月 / 2026 · 05 月"），分组下直接是网格

## 管理模式

- 选中态：格子四周高亮 `ring-2 ring-primary`，左上角圆形 ✓ 角标覆盖在缩略图上
- 点击格子：管理模式切换选中；普通模式打开 `AssetDetailDialog`
- 顶部"已选 N / 取消 / 删除"工具条不变

## 空态 / loading / 上传按钮 / 店铺选择

完全不动。

## 技术细节

- 新增一个内部小组件 `MediaTile`（仅在本文件内），负责单个图片/视频格子的渲染（缩略图、视频角标、选中态）
- 在月份分组里把 `list` 拆成 `mediaList = photo+video` 和 `copyList = copy`：
  - `mediaList.length > 0` 时渲染 `<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5">`
  - `copyList.length > 0` 时沿用现在的卡片列表（保留 copy 预览文本）
- 视频缩略：优先用 `meta.cover_url`，否则用 `<video preload="metadata" muted playsInline>`，与现有逻辑一致
- 视频状态文字（"生成中 1/3"、"拼接中 45%"、"失败"）改为叠加在缩略图底部的一条半透明黑底文字，避免破坏网格

## 验证

- 手机视口 390px 下 photo Tab 一行 3 张、间距均匀
- 切到 video Tab 能看到 VIDEO 角标和进度文字
- 切到 copy Tab 仍是文字卡片
- 管理模式可多选并删除
- 点击格子能打开 `AssetDetailDialog`
