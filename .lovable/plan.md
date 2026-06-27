
# 一次推理多镜（One-Shot Multi-Scene）渲染 · v2

对齐「小云雀」：脚本 + 角色板 + 关键参考图 **一次性** 丢给 Seedance 2.0，模型自己切 2~4 镜。保留现有「逐镜渲染」作为兜底。

> 修正：Seedance 2.0 `reference_image` 通道**最多 9 张**（旧代码里写死的 `slice(0, 4)` 是 1.5 时代遗留），本次一并放开到 9。

## 1. 参考图上限：4 → 9

- `supabase/functions/render-marketing-video/index.ts` 内 `resolveSegmentImages()` 的 `refs.slice(0, 4)` 改为 `slice(0, 9)`；`submitArkTask()` 内 `slice(0, 4)` 同步改为 `slice(0, 9)`。
- 新增 `_shared/seedance-models.ts` 常量 `SEEDANCE_MAX_REFS = 9`，全部从常量读。
- 前端 `CharacterPicker` / 角色额外参考图上限提示文案同步从「最多 4 张」改为「最多 9 张」。

## 2. 新增渲染策略 `render_strategy`

| 值 | 行为 | 用途 |
|---|---|---|
| `one_shot` | 整段脚本作为「分镜导演 Prompt」+ 最多 9 张参考图，单次 Seedance 调用直出 ≤15s | 「惊喜一下」默认 / 短视频默认 |
| `per_shot` | 现有逐镜并行 + 前端 ffmpeg-wasm 拼接 | 长视频 / 强一致性 / 用户手动 |
| `auto` | 后端按脚本特征自动判断 | 「自定义视频」默认 |

`auto` 判定（无额外 AI 调用）：
- 总时长 ≤ 15s → `one_shot`
- 分镜数 ≤ 4、每镜 ≥ 3s、无手动绑定的实景静帧 → `one_shot`
- 总时长 > 15s 或大量手动 `image_index` 绑定 → `per_shot`

## 3. `one_shot` Prompt 结构

按 Seedance 2.0「多镜导演口令」最佳实践，把脚本翻译为单条镜头切换指令：

```
【15s 探店短片，9:16，真人写实电影质感】
【主体1】参考图 1 中的人物（外观锁：…），全片同一人，禁止换人/分身。
【镜头节奏】共 3 个镜头，自然剪辑切换，不要黑场过渡。

镜头 1（0-4s，特写推镜）：…
镜头 2（4-10s，中景跟拍）：…
镜头 3（10-15s，半身收尾 + CTA 字幕）：…

整体：BOOMER·OFF 中古杂货店暖色货架；禁止动漫/插画/3D；不要文字水印。
```

参考图喂法（reference_image 通道，**上限 9 张**，按权重排序去重）：
1. 角色身份板（优先 verified `asset://`）
2. 角色额外参考图
3. 每镜手动绑定的关键实景图（按分镜顺序）
4. 每镜静帧（若已合成）
5. 兜底封面

## 4. 前端 UI

### 「惊喜一下」
- 硬编码 `render_strategy = 'one_shot'`，对用户不可见。
- 进度卡文案：「BOOMER 正在一次成片，约 1~2 分钟…」，不再显示 X/Y 分段。

### 「自定义视频」`MarketingVideo.tsx`
画风卡片下新增胶囊式「渲染方式」切换：

```
渲染方式：[🤖 智能 (推荐)]  [🎬 一次成片]  [🧩 逐镜拼接]
                           更快·更自然          每镜可控·更精准
```

- 默认 `auto`，实时显示后端解析后的「实际将走 one_shot / per_shot」徽章。
- 「一次成片」模式：收起「分镜静帧重做」入口，提示「本模式由模型自动安排镜头切换，参考图最多 9 张，按权重自动挑选」。
- 「逐镜拼接」模式：SceneRow / 静帧预览保持不变。

### `SegmentPreview`
- one_shot：单卡「1 段直出 · 模型自动切镜（共 N 张参考图）」。
- per_shot：保持现状。

## 5. 失败降级

`one_shot` 复用现有 3 级安全降级链（全 9 张参考 → 仅 1 张角色板 → 纯文本）。若 one_shot 整段被内容安全连续拦截 ≥2 次，自动回落 `per_shot` 并 toast 提示「已切换为逐镜渲染保证出片」。

## 6. 数据与元信息

`marketing_assets.meta` 新增字段（jsonb，无需迁移）：
- `render_strategy`: `one_shot` / `per_shot`
- `render_mode`: `one_shot_reference` / `per_shot_reference`
- `one_shot_refs`: 实际喂进去的参考图 URL 数组（最多 9 张，用于复盘）
- `auto_decision_reason`: strategy=auto 时记录判定原因（如 `duration<=15s`）

## 7. 不动的部分

- 模型选择（Seedance 2.0 Pro/Fast/Mini）、分辨率、画风（photoreal/stylized）、时长记忆 —— 全部保留。
- `per_shot` 代码全部保留作为兜底和「逐镜拼接」按钮实现。
- `stitchVideos.ts` 仅在 `per_shot` 时调用。
- 不改数据库 schema。

## 技术要点

- 后端：`render-marketing-video/index.ts` 抽出 `runOneShot()` 与现有 `splitScript → 并行提交` 并列；入口按 `render_strategy` 分发。
- Prompt 构造抽到 `_shared/one-shot-prompt.ts`，复用 `video-styles` / `realism` / `shop-context`。
- 参考图上限统一从 `_shared/seedance-models.ts` 的 `SEEDANCE_MAX_REFS = 9` 读取。
- 前端：新增 `src/lib/renderStrategyPref.ts`（localStorage 记忆）+ `RenderStrategyPicker.tsx`。
- 「惊喜一下」`SurpriseVideoDialog.tsx` / `surprise-marketing-video` 显式传 `render_strategy: 'one_shot'`。
