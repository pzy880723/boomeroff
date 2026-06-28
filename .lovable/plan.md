## 改动范围

### 1. 移除已过时的「拆段说明」文案
`src/pages/marketing/MarketingVideo.tsx`
- 删除时长选择下方的「{duration} 秒视频会拆成 N 段 × 约 15 秒…省一半 token…」整段提示（约 564–568 行的 `{duration > MAX_SEG_DUR && (...)}`）。
- 删除「主角」区描述里 `{duration > MAX_SEG_DUR && '多段视频如果不选,系统会自动先生成一张兜底角色身份板。'}` 这半句（约 638 行），改为常规一句话即可。
- 文案过时原因：现在统一走 `one_shot / per_shot` 自动策略 + 渲染时再降级，不再用「2 段 × 15 秒 拼接」的旧心智。

### 2. 新增 45 秒 / 60 秒视频时长
`src/pages/marketing/MarketingVideo.tsx`
- `DURATIONS` 由 `[15, 20, 30]` 扩展为 `[15, 20, 30, 45, 60]`。
- 把 `useState<15 | 20 | 30>(15)` 与 `setDuration(15)` 的类型签名放宽为 `number`（保留默认 15），避免类型卡住。
- 兼容草稿恢复时的旧值。
- 后端无需改：`render-marketing-video` 已按 `MAX_SEG_DUR=15` 自动切段，45/60 秒会落到 `per_shot` 多段渲染 + 拼接。

### 3. 角色横滑列表显示「预检通过 / 已认证」标签
`src/components/marketing/CharacterPicker.tsx`
- `select(...)` 增加 `meta` 字段一起拉回来。
- `Character` 类型补充 `meta?: { verify_kind?: 'character_sheet' | string } | null`。
- 在横滑的每个 thumb 按钮右上角加角标，沿用 `CharacterCard` 现有的色系：
  - `verified_asset_uri` 且 `meta?.verify_kind === 'character_sheet'` → 蓝色「预检 ✓」（软通过 / Character Sheet）。
  - `verified_asset_uri` 且非 character_sheet → 绿色「已认证」（火山真人认证）。
  - 否则 → 不显示（保持 thumb 干净，未认证靠新建/详情页提示，不在视频页打扰）。
- 角标使用 `lucide-react` 的 `ShieldCheck`，`text-[8px]`，绝对定位 `top-0.5 right-0.5`，与现有 thumb 视觉一致。

### 不动的
- `CharacterCard`、`CharacterDialog`、`BatchPreflightButton` 维持现状。
- 后端 `character-preflight` 已经写入 `meta.verify_kind='character_sheet'`，前端直接读即可，无需迁移。
- 视频任务流水、Seedance 调用次数、计费逻辑不变。

## 验收
- 时长选择条出现 15/20/30/45/60 五个 Chip，下方不再出现拆段说明。
- 选 60 秒 → 主角文案保持简洁，不再追加「多段视频…」。
- 角色横滑：已通过火山真人认证的显示绿色「已认证」；批量预检过的显示蓝色「预检 ✓」；未做的不显示角标。
- 后端渲染流程不变（per_shot 自动拼接），无需新增迁移。
