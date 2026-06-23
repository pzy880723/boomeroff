## 目标

后端接全 Seedance `reference_image / first_frame / last_frame` 的同时,前端也升级一版,让你**看得到、控得住、改得了**每张图最终会进入哪一段、扮演什么角色。

涉及文件:
- `src/pages/marketing/MarketingVideo.tsx`(主要改动)
- `src/components/marketing/CharacterPicker.tsx`(主角附加参考图)
- `supabase/functions/render-marketing-video/index.ts`(后端 — 上一个计划)

数据库、storage、拼接逻辑 **不动**。

---

## 一、分镜行(SceneRow)升级:每张图标"用途"

现状:每个镜头只能选 `image_index` 一张图,不知道它最终是首帧/尾帧/参考。

改动:
1. 把 `scene.image_index: number | null` 升级成
   ```ts
   scene.image_ref?: { index: number; role: 'first' | 'last' | 'reference' }
   ```
   并保留对旧 `image_index` 的读兼容(默认当 `first`)。
2. 选完图后,图片缩略图右上角出一个小 Pill 让用户切换用途:
   `[开头]` `[结尾]` `[参考]` — 默认 `开头`。
3. 缩略图下方多一行 hint:
   - `开头` → "本镜头将作为它所属视频段的开场画面"
   - `结尾` → "作为段尾画面,与开头帧约束运动方向"
   - `参考` → "仅用于锁定主体形象,不出现在固定帧位"

## 二、新增"主角附加参考图"

在 `CharacterPicker` 选完主角后,下方新增折叠区 `+ 加参考图(最多 2 张)`:
- 来源:素材库 / 上传(复用现有 LibraryImagePickerDialog 和文件上传)
- 存到 `script.character.extra_reference_urls: string[]`(`character.cover_url` 仍是主图)
- 后端会把 `[cover_url, ...extra_reference_urls]` 都作为 `reference_image` 每段都传

UI:小尺寸 64px 缩略图 + 删除按钮,提示"用来锁人物长相/服装,每段都会带"。

## 三、新增"分段预览"卡片(在分镜列表上方)

按后端 `splitScript` 的同样逻辑(贪心装箱 ≤10s)在前端实时算一遍,展示:

```
第 1 段 · 8s · 钩子+镜头1+镜头2
  参考图: [主角封面] [+1]
  首帧:   [镜头1的图]   尾帧: [镜头2的图]

第 2 段 · 6s · 镜头3+镜头4
  参考图: [主角封面] [+1]
  首帧:   (无)        尾帧: (无) — 将走纯文生
```

把这个装箱函数抽到 `src/lib/marketingSegments.ts`,前后端各引一份(后端 Deno 直接复制一份同名 .ts,避免 import 链)。这样用户**所见即所得**,改任何一张图都能立刻看到它落在哪段。

## 四、SectionLabel "06 参考图" 说明文字更新

把现在的"建议每段一张"改成:
> 上传的图会按分镜里的「用途」标签进入视频:开头帧/结尾帧用作画面控制,参考图用来锁形象。主角形象建议放在「角色」里。

## 五、不动

- 7 步表单结构、shop/character 选择器、立意沟通、BGM/时长/比例选择、ShareToCommunity、库存逻辑、拼接 (`stitchVideos.ts`)、`marketing_assets` 表 全部保留。
- `image_urls` 数组本身不变,只是新增 `image_ref.role` 标签。
- 视频生成入口/按钮文案不变。

## 六、后端同步点(衔接上一个计划)

`pickSegmentFrames(sub, imageUrls, scenes)` 改成:
- 优先按新字段 `image_ref.role`:
  - `first` → 该段 `first_frame`(若多个,取最早出现)
  - `last` → 该段 `last_frame`(若多个,取最晚出现)
  - `reference` → 加入该段 `reference_images`
- 兼容旧字段:scene 仅有 `image_index` → 当 `role='first'`
- 主角:`character.cover_url` + `character.extra_reference_urls[]` → 每段都进 `reference_images`,去重,最多 3 张

## 七、验证

1. 部署后端 + 前端编译通过。
2. 在 `MarketingVideo` 页:
   - 给镜头1 选图标"开头",镜头2 选图标"结尾",镜头3 选图标"参考"。
   - "分段预览"卡片应实时显示对应位置。
3. 给主角加 1 张附加参考图,确认每段预览都列出。
4. 点"开始渲染",看 edge function 日志 `[render] seg ... ref=[2张] first=<...> last=<...>`,与前端预览一致。
5. 视频生成后,目标段的画面与所选图明显对应。
