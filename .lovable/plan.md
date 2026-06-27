
## 你说的问题，对在哪里

1. **分段预览跟分镜静帧没关联** ✅ 确实是 UI bug
   - `SegmentPreview` 只读 `urls`（原始素材库），完全没有看 `clip.storyboard_url`。
   - 但后端 `render-marketing-video/resolveSegmentImages` 其实**已经优先用 `storyboard_url`** 当首/尾帧，原素材只是降级和 reference。
   - 所以渲染并没有"用素材库的图凑视频"，是预览面板骗了你 —— 看着像两套东西。

2. **分段预览太占位** ✅ 默认折叠即可，不删。

3. **每段应该显示这段里包含的所有分镜（用静帧）+ 主角** ✅ 信息架构改一下就好。

## 改动（只动 `src/pages/marketing/MarketingVideo.tsx`，纯前端）

### A. 重写 `SegmentPreview` 卡片

不再画"开头/结尾/参考"三宫格，改成**"这一段 = 这几个分镜"**的真实视图：

- 每段头：`第 N 段 · X秒 · {镜头标签}` + 模式徽章（图生 / 首尾帧 / 参考生 / 文生）
- 每段体：
  - **横向缩略图条**：把这段里 `hook / 镜头k / outro` 按顺序排开，每个 tile 显示 `clip.storyboard_url`（没有时回退到 `urls[image_index]`，再没有显示"无图"占位）；tile 下方小字写"钩子 / 镜头k / 收尾"和时长。
  - tile 上角小角标：第一个 tile 标"开头帧"，最后一个标"结尾帧"（与 `resolveSegmentImages` 实际取帧规则一致 —— 优先取本段第一/最后一张 `storyboard_url`）。
  - **主角胶囊**：若有 `character.cover_url`，在段右侧固定显示一个小圆头像 + 名字，标"每段锁人"，对齐后端"角色 reference 永远塞"的行为。
- 这样用户一眼就能看到："这一段用的就是上面这几张分镜静帧拼成的"。

### B. 默认折叠

- 用 `<details>` 或受控 `useState(false)` 的折叠区，标题保持 `分段预览 · N 段（≤10s/段）`，右侧"展开/收起"按钮。
- 折叠态只显示一行汇总：`共 N 段 · 总 D 秒 · 主角:{name|无}`。

### C. 顺手修掉的几处不合理

1. **重做分镜静帧按钮的提示语**：当前只提示"画风切换 → 建议重做"，但**用户在分镜行手动替换了某张图**（`assignImageToTarget` / `setSceneImage`）也会让旧静帧和新绑定对不上。改成：监听 `script` 中各 clip 的 `image_index` 变化签名，一旦和上一次成功生成静帧时不一致，就在"重做分镜静帧"按钮旁边显示一个琥珀色小标"分镜图已变更，建议重做静帧"。
2. **`generateStoryboard` 永远全量重跑**：`storyboard-marketing-video` 后端其实支持 `only_indices`。在"重做分镜静帧"按钮旁加一个"仅重做缺失/失败的"次级按钮，把 `frames` 里 `url=null` 的 `scene_index` 传过去，节省时间和额度。
3. **`SceneRow` 缩略图仍显示原素材而非静帧**：当 `scene.storyboard_url` 存在时，左上角 64×64 缩略图优先显示静帧，原 `参考图` 角标改为"已合成静帧"，让用户看到"这一镜最终会动起来的那张"就是它，不再误以为是从素材库直接抽图渲染。
4. **空状态文案**：脚本生成后但还没合成静帧时，在"分镜"区顶端加一行提示 `"⚠ 还没有分镜静帧，渲染会直接用原素材，质量会差。点击右上角『重做分镜静帧』"`，避免用户误提交。

## 不动

- 后端 `render-marketing-video` / `storyboard-marketing-video` / 分段拆分逻辑保持不变 —— 它本身就是优先用 storyboard 静帧的。
- `SurpriseVideoDialog` 不动（它的分段预览是另一处，已是缩略卡，必要时再单独提）。
- `planSegments` / `marketingSegments.ts` 不动。
