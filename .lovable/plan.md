
## 一、营销中心整体重新排版（移动端为主）

把当前一坨一坨「卡片各自为政」的页面，按"做事顺序"重新分组，让视觉节奏统一到 BOOMER 禅意品牌（古铜金 accent + 米白 card），不再出现彩色断层。

### 1. 首页 `MyMarketing.tsx`
重排为 3 个清晰区块，去掉零散卡：

```text
┌─────────────────────────────────┐
│ Hero · 今天产出 + 30 日统计     │  ← 保留
├─────────────────────────────────┤
│ ① 一键拍片                       │
│   · 惊喜一下（BOOMER 代拍）     │  ← 主 CTA，放大
├─────────────────────────────────┤
│ ② 自己创作（创作工坊）          │
│   01 AI 图片   02 AI 文案        │  ← 2 列
│   03 AI 视频（独占整行）         │
├─────────────────────────────────┤
│ ③ 管理与分发                     │
│   素材库 │ 内容分发中心          │  ← 2 列等高卡
└─────────────────────────────────┘
```

- 「内容分发中心」入口卡的图标/标签从 `from-pink-500 via-fuchsia-500 to-purple-500` + `text-fuchsia-600` 全部换成项目语义色：`bg-accent/15` + `text-accent`，与其它入口一致。
- 「惊喜一下」按钮从横向小条升级为带 BOOMER 主图的横向 banner（仍是 accent 描边，不引入新色）。
- 移除底部那条 `bg-accent/20` 的硬横线，改成自然 padding。

### 2. 分发中心 `dispatch/*` 去紫色
完全去掉 pink/fuchsia/purple 渐变，统一回 accent 体系：

- `Workbench.tsx` 主按钮：`from-pink-500 via-fuchsia-500 to-purple-500 text-white` → `bg-primary text-primary-foreground`
- `AiCopySheet.tsx` 同款渐变按钮 → `bg-primary text-primary-foreground`
- `Accounts.tsx` 添加账号按钮 → `bg-accent text-accent-foreground`（与"新建"类按钮一致）
- `DispatchHome.tsx` 顶部 tab/卡片如有紫色背景，一并改为 `bg-card border-accent/15`

### 3. 视频页 `MarketingVideo.tsx` 排版收敛
- 把"上传参考图 → 角色选择 → 聊脚本 → 生成分镜 → 渲染"重新画成清晰 4 步骤（带步骤序号 01/02/03/04），每步一个 Section，配 SectionLabel，去掉当前散落的 hint。
- 渲染配置（模型 + 分辨率 + 修复按钮）聚合到底部一张「输出设置」卡。

---

## 二、修复 AI 自定义视频（03）分镜与渲染 Bug

用户反馈：选完素材图 + 聊完脚本后，**分镜没有把"角色 + 已选图片"整合进去，最后渲染还报错**。

排查思路：

1. **`generate-marketing-video-script` 函数**：检查它是否真的把 `character` 和 `image_descriptions` 合到每一个 scene 的 prompt 里，并按规则给 scene 写入 `image_ref: { index, role }`（hook=first / mid=reference / outro=last）。当前前端只在"手动替换图"时才写 `image_ref`，AI 自动生成时若返回的 scene 没有 `image_ref`，渲染端就会忽略素材 → 这是核心 Bug。
   - 修复：函数 prompt 强制要求 JSON schema 中每个 scene 必须包含 `image_index`（0..N-1）和 `image_role`，并在返回后做服务端兜底（若缺失，按 hook→0 / mid→i%N / outro→last 自动补）。

2. **`render-marketing-video` 函数**：确认它读取 scene 上的 `image_ref` / `image_index` 并把对应 `urls[index]` 作为 `first_frame` / `last_frame` / `reference_image` 传给 Seedance；以及 `character.cover_url` 作为人物 reference 一并传入。
   - 同步处理：当 scene 同时存在 `last_frame` 和 `reference_image` 时按既有互斥规则降级（已有逻辑，确认未回归）。

3. **`storyboard-marketing-video`（合成静帧）**：确认它对每个 scene 真的拿到 (a) 角色 cover_url 作为人物参照、(b) 选中的素材图作为场景参照，再让 Gemini 合成静帧。若返回为空就让渲染端跳过静帧、回退到直接用素材原图作为 `first_frame`，避免整条链路因为静帧失败而 fail。

4. **前端 `MarketingVideo.tsx`**：
   - 「生成分镜」后，对每个 scene 检查是否有 `image_ref`，若没有则按上面规则前端再兜底一次，避免后端漏写。
   - 渲染卡片新增「分镜素材自检」提示：列出每个 scene 实际使用的图序号 + 角色 + 是否带角色参考，让用户能眼见为实。
   - 报错时把 edge function 的真实 message（已通过 `videoFailure.ts`）展开显示，包括上面 storyboard / render 两步分别失败的来源，便于点"修复"按钮。

5. **诊断验证**：用 `supabase--curl_edge_functions` 直接调一次完整链路（带 mock 角色 + 2 张图），看 `script.scenes[*].image_ref` 是否齐全，再调 `render-marketing-video` 看返回 segment payload 里 `first_frame_url` 是否正确指向素材图。

---

## 技术细节（给开发参考）

| 文件 | 修改要点 |
|---|---|
| `src/pages/MyMarketing.tsx` | 分发卡去 fuchsia/purple；惊喜 banner 重做；底线移除；3 区块结构 |
| `src/pages/marketing/dispatch/Workbench.tsx` `AiCopySheet.tsx` `Accounts.tsx` `DispatchHome.tsx` | 全量替换 pink/fuchsia/purple → primary/accent 语义色 |
| `src/pages/marketing/MarketingVideo.tsx` | 4 步骤排版；分镜后前端 image_ref 兜底；分镜素材自检面板；错误展开 |
| `supabase/functions/generate-marketing-video-script/index.ts` | Prompt 强制 image_index + image_role；返回后服务端兜底 |
| `supabase/functions/render-marketing-video/index.ts` | 确认按 image_ref 取 url；character.cover_url 作为人物 reference；静帧失败回退 |
| `supabase/functions/storyboard-marketing-video/index.ts` | 同时喂角色 + 场景图；任一缺失走降级 |

完成后用 curl 工具跑一遍端到端，并在前端复核：选 2 张素材图 + 1 个角色 → 聊脚本 → 生成分镜（每行可见图序号 + 角色徽章）→ 渲染（不再 fail）。
