## 问题

火山方舟 Seedance 渲染时报：
`InputImageSensitiveContentDetected.PrivacyInformation – The request failed because the input image may contain real person`

原因：我们在 storyboard 阶段用 Gemini 合成的分镜静帧，主角脸太像真人，被方舟的"真人识别"内容安全策略拦下。同一个分镜（first/last frame 都是这张图）连续报错 3 次。

## 修复思路（分两层兜底，确保不再卡住）

### 1. 让分镜静帧不再像"真人"
改 `storyboard-marketing-video` 的 prompt：
- 明确加上"轻度风格化 / 漫感插画 / 略带海报感"等措辞，避免照片级真人面孔
- 显式禁止"photorealistic real person face, real human photograph, documentary photo"
- 保留角色身份板的发型/服装/体型识别度，但不要照片级肤质和瞳孔细节

### 2. 渲染端自动降级，永不再因为这一条卡住
改 `render-marketing-video`：
- 捕获方舟返回的 `InputImageSensitiveContentDetected` 错误码
- 自动重试一次，本次去掉 `first_frame` + `last_frame`，只保留 `reference_image`（角色身份）+ 文本 prompt
- 如还报错，再重试一次，去掉所有参考图，纯文本生成（保底必出片）
- 把降级原因写进 `marketing_video_jobs.error` 的备注里，前端弹窗显示"分镜帧被安全策略拒绝，已自动降级渲染"

### 3. 失败任务收尾
把现在卡住的这条素材库视频任务标为 failed，让用户能直接点 ✕ 删除，不再无限重试。

## 涉及文件

- `supabase/functions/storyboard-marketing-video/index.ts` — 改 prompt
- `supabase/functions/render-marketing-video/index.ts` — 加错误码识别 + 两级降级重试
- `src/components/marketing/SurpriseVideoDialog.tsx` / `MarketingLibrary.tsx` — 失败提示文案微调（可选）

## 验证

- 用现在这条素材重新跑一次「帮我拍一条」，确认：
  1. 新生成的分镜静帧不会再被判真人
  2. 即使被判真人，也会自动降级渲染并出片
- 看 `render-marketing-video` 日志里是否打印降级路径

需要我按这个方案改吗？
