## 背景

火山 Seedance 2.0 接口规则:**`last_frame` 与 `reference_image` 互斥**(同一个 generation 任务里只能出现其中一类)。我们当前在 `render-marketing-video` 里同时下发了 `reference_image + first_frame + last_frame`,因此被火山以 `InvalidParameter` 拒绝,任务一律失败。

控制台关键证据:
```
[render single] model= doubao-seedance-2-0-260128 res= 720p ref= 3 first= ... last= ...
[render single] ark error ... last frame image content cannot be mixed with reference image or draft_task content
```

跟模型是否开通无关,Pro 模型已经能正常受理请求。

## 目标

让单段任务在两种情况下都能成功提交,并保留视觉一致性。

## 方案(后端二选一策略,优先保证「分镜静帧驱动」)

改造点集中在 `supabase/functions/render-marketing-video/index.ts` 的单段提交逻辑里 `resolveSegmentImages` 之后的请求拼装部分:

1. **优先走「首尾帧」路径(分镜静帧已生成时)**
   - 当该段同时具备 `first_frame` 和 `last_frame`(由 storyboard 生成):
     - 保留 `first_frame` + `last_frame`
     - **去掉 `reference_image`**(角色形象已经被 Nano Banana 烘进静帧里,无需再传)
   - 当只具备 `first_frame`,无 `last_frame`:
     - 保留 `first_frame`
     - **保留 `reference_image`**(此时不会触发互斥)

2. **回退到「参考图」路径(完全没有静帧时)**
   - 没有任何静帧 → 保留 `reference_image`(角色封面 + 额外参考),不传 `first_frame` / `last_frame`,由模型自由生成。

3. **统一日志**:在 `[render single]` 日志里新增 `mode=frames|reference` 字段,方便后续排查。

4. **前端无需改动**:`SeedanceModelPicker`、`SurpriseVideoDialog`、自定义页都不动。用户原有的「开头/结尾/参考」用途标记继续生效 —— 后端按以上规则自动取舍。

## 验收

- 在「惊喜一下」按 Pro 提交一条 15s,日志显示 `mode=frames`,任务进入 rendering 而不是 failed。
- 关掉 storyboard(或 storyboard 跳过的情况),任务走 `mode=reference`,同样能成功提交。
- 不再出现 `last frame image content cannot be mixed with reference image` 报错。
