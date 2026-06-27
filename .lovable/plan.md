## 背景

「惊喜一下」目前流程：选素材 → 写脚本 → **调 storyboard 函数为每个分镜合成一张静帧**（Gemini 画的）→ 把脚本喂给 Seedance one_shot 渲染。

问题：storyboard 合成的分镜静帧里人物每张脸都不一样，没有人物一致性；既然 one_shot 本身就支持最多 9 张参考图，多塞一层"AI 想象出来的二手静帧"反而稀释了真正的角色参考图。

## 目标

「惊喜一下」彻底跳过 storyboard 合成那一步，直接把【角色板图】+【挑出来的真实素材图】当 reference_image 喂给 Seedance one_shot，让模型自己排镜头。这也正好对齐用户原话：「快速生成视频用的，不需要再去生成各种分镜」。

## 改动

### 后端 `supabase/functions/surprise-marketing-video/index.ts`
- 删除 403–426 行整段对 `storyboard-marketing-video` 的调用。
- 返回结果不再带 `storyboard` / `storyboard_session_id` / `__sb_warn` 字段。
- preview 返回里仍然带 `picked` + `assets` + `script` + `character`，前端预览面板用真实素材缩略图就够了。
- 渲染调用保留 `render_strategy: 'one_shot'`，由 `render-marketing-video` 内部按既定优先级把【角色板 cover ➜ 实景素材】聚成 ≤9 张 reference_image 一次推理出片，人物一致性依赖角色板锁定。

### 前端 `src/components/marketing/SurpriseVideoDialog.tsx`
- 预览/进度面板把所有 `clip.storyboard_url` 分支收敛回 `asset.url`（真实素材图）。
- 顶部副标题"分镜静帧 · X/Y 张已合成"改为"参考图 · N 张"。
- 移除 `disable_storyboard` 这个 override，以及一键修复菜单里的相关项（已经没意义了）。
- `Frame` 类型里的 `storyboard_url` 字段、`storyboard` 数组类型一并清理。

### 保留不动
- `storyboard-marketing-video` 函数本身不删，"自定义视频"分支和回填脚本仍会用。
- `MarketingVideo.tsx`（自定义视频）的分镜静帧流程**完全不动**——用户明确说的是「惊喜一下」这条线。
- `render-marketing-video` 不动，它的 one_shot 参考图聚合逻辑已经正确。

## 验证

- 部署 surprise + 前端打开"惊喜一下"，确认：预览不再出现"正在合成分镜静帧"，弹窗里看到的就是素材库里的原图；点确认渲染，job 正常起来，最终视频人物 = 角色板那个人。
- 检查 edge function logs 没有 storyboard 相关调用。
