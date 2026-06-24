## 目标
1. 全项目锁定 Seedance 2.0 系列
2. ≤15s 一律走单段，不再触发拼接(根治拼接报错)
3. 前端用户在生成视频时可**直接选择 2.0 子版本**，并清楚看到每个版本的差异

## 一、模型常量(前后端共用)
新建 `src/lib/seedanceModels.ts`(前端用)+ `supabase/functions/_shared/seedance-models.ts`(后端用,字段一致):

```ts
export const SEEDANCE_2_MODELS = [
  {
    id: "doubao-seedance-2-0-260128",
    label: "Seedance 2.0 Pro",
    tagline: "画质最强 · 推荐",
    max_duration: 15,
    resolutions: ["480p", "720p", "1080p", "4k"],
    supports_audio: true,
    speed: "标准",
    cost: "高",
    best_for: "成片、对外发布、需要 1080p/4K",
    available: true,
    recommended: true,
  },
  {
    id: "doubao-seedance-2-0-fast-260128",
    label: "Seedance 2.0 Fast",
    tagline: "更快更便宜",
    max_duration: 15,
    resolutions: ["480p", "720p"],
    supports_audio: true,
    speed: "快(约 1/2 用时)",
    cost: "中",
    best_for: "日常短视频、批量出片",
    available: true,
  },
  {
    id: "doubao-seedance-2-0-mini-260615",
    label: "Seedance 2.0 Mini",
    tagline: "最便宜 · 6/25 开放",
    max_duration: 15,
    resolutions: ["480p", "720p"],
    supports_audio: true,
    speed: "最快",
    cost: "最低",
    best_for: "测试稿、灵感稿",
    available: false, // 6/25 之后改 true
    available_at: "2026-06-25",
  },
] as const;
export const DEFAULT_SEEDANCE_2 = "doubao-seedance-2-0-260128";
export const SEEDANCE_MAX_SINGLE_SHOT = 15;
```

## 二、前端版本选择器
新组件 `src/components/marketing/SeedanceModelPicker.tsx`：
- 3 张卡片横排(移动端纵排),每张显示:
  - 标题 + tagline 徽章("推荐"/"更快更便宜"/"最便宜")
  - 4 行规格:**最长 15 秒** · 分辨率 480p/720p/1080p/4K · 速度 · 费用
  - "适合:成片/日常/测试稿"一行
  - Mini 在 6/25 前显示为不可选(灰),角标写"6 月 25 日开放"
- 选中态:边框高亮 + 勾选图标
- 不展开任何技术 id;hover/长按显示底部小字 "model: doubao-seedance-2-0-260128"

接入两个入口:
1. `SurpriseVideoDialog`:脚本预览页顶部新增"渲染模型"块,默认 Pro,可切换。点"开始渲染"时把选中的 `model_id` 透传给 `render-marketing-video`。
2. `MarketingVideo.tsx`(标准生成页):同样位置嵌入选择器。

并在 `/portal → MarketingPresetsPanel` 留"默认模型"下拉,作为用户没主动选时的兜底。

## 三、render-marketing-video 改造
`supabase/functions/render-marketing-video/index.ts`:
- 移除 `DEFAULT_MODEL` 写死,顺序:`body.model` → `marketing_presets.video_model` → `DEFAULT_SEEDANCE_2`;不在白名单的回退到默认并日志告警。
- `MAX_SEG_DUR` → 15;`clampDuration` 上限 15;单段判定 `totalDur <= 15`(去掉 `+2`)。
- 2.0 全系都支持 `reference_image` / `first_frame` / `last_frame` / `generate_audio`,删掉 `modelSupportsAdvancedRefs()` 的 1.x 判断,统一按 2.0 走。
- **移除 2.0 不支持的字段**:不再发送 `seed`、`camera_fixed`。
- 按所选模型的 `resolutions` 收敛分辨率:若请求 1080p 但模型不支持,降级 720p 并在 `meta.warnings` 写 `resolution_downgraded`。
- 单段成功后直接落 `marketing_assets.output_url`,不再走拼接路径。

## 四、surprise-marketing-video 配套
让 Gemini 生成脚本时 `total_duration_s ∈ [5, 15]`,system prompt 加 "总时长必须 ≤15 秒";返回前 `Math.min(15, total)`。

## 五、stitchVideos 容错(保险)
`src/lib/stitchVideos.ts`:下载 3 次指数退避重试;任一段 demux 失败 → 回退用第一段 + `meta.warnings:['stitch_failed']`;`MarketingLibrary.tsx` 监听到时 toast。新流程默认不会触发,只为未来 >15s 留口子。

## 六、UI 小细节
`SurpriseVideoDialog` 脚本预览徽章:"单段直出 · 无拼接 · {selected_label}"。

## 涉及文件
新增:
- `src/lib/seedanceModels.ts`
- `supabase/functions/_shared/seedance-models.ts`
- `src/components/marketing/SeedanceModelPicker.tsx`

修改:
- `supabase/functions/render-marketing-video/index.ts`
- `supabase/functions/surprise-marketing-video/index.ts`
- `src/components/marketing/SurpriseVideoDialog.tsx`
- `src/pages/marketing/MarketingVideo.tsx`
- `src/components/admin/MarketingPresetsPanel.tsx`(下拉选项换成 2.0 三档)
- `src/lib/stitchVideos.ts`
- `src/pages/marketing/MarketingLibrary.tsx`

## 不改动
`poll-marketing-video`、`storyboard-marketing-video`、角色 100% 出场、分镜逻辑。