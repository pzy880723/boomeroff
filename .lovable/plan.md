
# 分镜「关联图片」支持手动替换(素材库 / 上传)

## 现状
- 每个镜头 `scene.image_index` 指向 `urls[]`(顶部参考图池子)。
- `SceneRow` 底部只有一排 `#0 #1 #2 …` 切换按钮,只能在已有 urls 之间选,不能换库里的别的图,也不能临时上传。

## 改造
在 `SceneRow` 那排参考图 chip 旁边加两个按钮:**「素材库」** 和 **「上传」**;选/传的图直接追加到 `urls`,并把当前镜头 `image_index` 指向新加的那张。

### 1) `MarketingVideo.tsx`
- 新增 `addImagesAndAssign(sceneTargetId, newUrls)` 辅助:
  - 把 `newUrls` 中**还没在 `urls` 里**的追加到 `urls` 末尾(去重)。
  - 把命中的图(原已有或新加)对应的 index,赋给目标 scene 的 `image_index`(只取第一张)。
  - `sceneTargetId` 用 `'hook' | 'outro' | mid 索引`,复用现有 `updateScene` / `updateMid`。
- 把 `addImagesAndAssign` 透传给 `SceneRow`。
- 渲染 `<LibraryImagePickerDialog>`(单实例)+ 一个隐藏 `<input type=file multiple accept=image/*>`,由当前点击的 scene 来决定回调对象。用一个 `pickerTarget` state 记录 `{ scene: 'hook'|'outro'|number }`。
- 直接上传走现有 `uploadMarketingImages`(已支持 shop_id / hash 去重)。上传完拿到 url 数组,调 `addImagesAndAssign`。上传过程用 sonner toast 提示进度。

### 2) `SceneRow`
- 在「参考图」标签那行末尾追加两个按钮(同样 `text-[10px] h-5` 样式,搭配 lucide 图标):
  - 📚「素材库」→ `onPickLibrary()`
  - ⬆️「上传」→ `onPickUpload()`
- 新增 props:`onPickLibrary: () => void; onPickUpload: () => void;`。
- 不动其他字段,不动 `urls.map(...)` 那排已有 chip。

### 3) 边界
- `urls` 上限按现有 `LibraryImagePickerDialog` 的 `max` 走(默认 20);不动。
- 选/传**多张**时,按上面的规则,首张赋给当前 scene,其余仅追加到池子,供后续手动切换。
- 图片描述 `imageDescriptions` 由现有 useEffect 监听 `urls.join('|')` 自动重算,无需手动触发。

## 不动的部分
- 数据库 / RLS / edge functions / 视频生成 / 渲染管线全部不变。
- 顶部「参考图/主角」步骤的上传入口、字段、画幅、风格选择都不变。

## 涉及文件
- `src/pages/marketing/MarketingVideo.tsx`(加 picker state + handler,改 `SceneRow` 调用)
- `src/pages/marketing/MarketingVideo.tsx` 内的 `SceneRow`(加 2 个按钮和 props)

## 预期效果
店员看分镜时,任意镜头都能一键从素材库换图或现场再传一张,新图自动加入顶部图池,后续别的镜头也能选它。
