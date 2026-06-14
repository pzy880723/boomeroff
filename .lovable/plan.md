## 用户反馈拆解

1. **AI 文案上传慢** — 现在 `compressForUpload` 默认压到 1600px / 0.82,对配图来说太大;而且 `uploadMarketingImages` 是 `for...of` 串行上传,3 张图就要等 3 倍时间。
2. **没有上传进度反馈** — 当前只在出错时 toast,中途用户只能干等。
3. **AI 视频画幅** — 现在是 `9:16 / 1:1 / 16:9` 三个文字 Badge,要换成竖/方/横三个**图形比例缩略图**按钮。
4. **AI 视频上传同样慢** — 同问题。
5. **先看 UI 设计稿再开发** — 不要直接动代码,先出图,确认后再写。

---

## 第一步:出 UI 设计稿(本轮交付)

进 build 模式后,**第一件事不是写代码**,而是调用 `design--create_directions` 出 3 套渲染后的 HTML 预览,聚焦两个组件:

**A. 多图上传卡片(文案 + 视频共用样式)**
   - 4 列网格,每张缩略图带:进度环 / 完成对勾 / 失败 ! / × 删除。
   - 顶部一条总进度细条 `上传中 2/5`。
   - "+" 添加格子,虚线边框,显示剩余可加张数。

**B. 视频画幅选择器**
   - 三个图形按钮代替文字 Badge:
     - 竖版:窄长方形竖立(9:16),下面小字 `9:16 竖版`。
     - 方形:正方形(1:1),下面 `1:1 方形`。
     - 横版:扁长方形(16:9),下面 `16:9 横版`。
   - 选中态:实心填充 + primary 边框 + 微缩放。
   - 未选中:线框 + muted 色。

3 个方向走不同密度/质感(极简线框 / 实色填充 + 阴影 / 玻璃态半透明),其它视觉风格沿用项目 design token,不引入新色。

出图后 `ask_questions(type: 'prototype')` 给你选,你选完我再落地代码。**这一步不动任何文件**。

---

## 第二步:用户选完 → 落地实现(下一轮)

### 2.1 上传提速

`src/lib/uploadImage.ts` 增加可选参数,提供两套预设:
- `compressForUpload(file)` — 维持原默认(给图片优化用,要细节)。
- `compressForUpload(file, { preset: 'thumb' })` — `maxWidth=900`、`quality=0.72`、目标 80–150KB。配图给 AI 看图写文/分析素材足够了。

`src/pages/marketing/uploadMarketingImages.ts` 改造:
- 新签名:`uploadMarketingImages(userId, files, { preset?, onProgress? })`
- 内部用 `Promise.all` 并发上传(浏览器自己会限到 6),不再 `for...of`。
- 每张图在 `开始压缩 → 压缩完成 → 上传完成` 三个节点回调 `onProgress({ index, status, doneCount, total })`。

不动 storage bucket、不动 RLS、不动 edge function。

### 2.2 上传 UI 反馈

`MarketingCopy.tsx` / `MarketingVideo.tsx` 都加 `uploading: Array<{ id, status: 'compressing'|'uploading'|'done'|'error', preview?: string }>` 状态:
- 用户选完文件,立刻用 `URL.createObjectURL` 显示本地预览(零等待感)。
- 每张缩略图角标实时切换"压缩中 → 上传中 → ✓"。
- 顶部小进度条 `上传中 X/N`,全部完成自动消失。
- 失败的可单张重试。

`MarketingCopy` 调用时传 `preset: 'thumb'`(配图只给 AI 看);`MarketingVideo` 同样用 `thumb` —— 素材分析也只需要语义识别,不需要 1600px。

### 2.3 视频画幅图形按钮

`MarketingVideo.tsx` 把 `ASPECTS.map((a) => <Badge>)` 这段(行 150–157)换成自定义 `<AspectButton>` 组件:
```
[ ▭ ]  [ □ ]  [ ▬ ]
9:16   1:1   16:9
竖版   方形   横版
```
用纯 CSS div 画矩形,按比例宽高,选中态加 `ring-2 ring-primary` + `bg-primary/10`。不引入新依赖。

---

## 不做

- 不改 edge function、不改 prompt、不改模型。
- 不上 zip 批量下载、不做 WebWorker 压缩(浏览器单图 <300ms,够了)。
- 不动 `MarketingPhoto.tsx`(它要的是高清原图,不能砍画质)。

---

## 交付节奏

- **本轮(plan 通过 → build):** 只调 `design--create_directions` + `ask_questions`,等你选样。
- **下一轮(你选完):** 实现 2.1 / 2.2 / 2.3,共改 4 个文件:`src/lib/uploadImage.ts`、`src/pages/marketing/uploadMarketingImages.ts`、`MarketingCopy.tsx`、`MarketingVideo.tsx`。
