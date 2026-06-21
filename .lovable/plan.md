## 一、重新调整「AI 视频」页面的步骤顺序

按你说的逻辑改成：**参考图 → 主角 → 立意沟通 → 生成脚本**。把视频参数（类型/风格/时长/画幅/想突出的点）放到最顶部一个紧凑的「拍摄设置」卡片里，下面再按新顺序排：

```
[拍摄设置] 类型 · 风格 · 时长 · 画幅 · 想突出的点
   ↓
01 参考图（可选，最多 20 张，可上传 / 从素材库导入）
   ↓
02 主角（可选，CharacterPicker）
   ↓
03 立意沟通（VideoBriefChat，右上「生成分镜」按钮）
   ↓
04 分镜脚本（生成后出现，可逐镜编辑 → 确认脚本，开始渲染）
```

StepBar 同步改为：`选店铺 → 参考图 / 主角 → 立意沟通 → 确认分镜 → 渲染`（或精简成 4 步），current 计算逻辑同步更新。

只调整 `src/pages/marketing/MarketingVideo.tsx` 里 JSX 的顺序和 SectionLabel 编号，不动业务逻辑，也不动 Edge Function。

## 二、修复"超过 15 秒视频卡住 / Edge Function 返回非 2xx"

截图里点「确认脚本，开始渲染」时报错。查阅当前代码后定位到两条最可能的卡点：

**1. `confirmRender`（前端）会在 duration > 12 且没有主角时，先**同步**调用 `ensure-auto-anchor-character` 生成一张角色身份板图（Gemini Nano Banana，单次往返 30–60s），再去调 `render-marketing-video`。**

- 这一步任何失败（AI 限流、超时、storage 上传）都会直接抛错，UI 就显示"Edge Function returned non-2xx"。
- 修复：把它改成"尽力而为"——`try/catch` 包住，失败时只 toast 提示，不中断后面的 render 调用；并显示更明确的中文错误信息（不要直接吐 `error.message`）。

**2. `render-marketing-video`（后端）在多段路径里**串行**提交 Ark 任务**，30s = 3 段，每段创建任务都要等火山方舟返回 task id。**

- 串行 3 次 + 之前的角色生成，很容易超过 Edge Function 的执行预算，让客户端那侧拿到 5xx。
- 修复：把 3 段子任务的 `submitArkTask` 改成 `Promise.all` 并行提交（Ark 创建任务接口本身只是入队，互不依赖）。父任务在所有子任务都成功后再统一插 `marketing_video_jobs` / `marketing_assets`；任何一段失败就把父任务标记 failed 并返回该段的真实错误信息。

**3. 把后端真实错误带回前端**

- `render-marketing-video` 现在返回 `{ error: r.error, raw: r.raw }`，但 `supabase.functions.invoke` 在非 2xx 时会把 body 吞掉只留通用错误。改用 `return json({...}, 200)` + `{ ok: false }` 字段的约定，前端读 `data.ok` 判定，避免"Edge Function returned non-2xx"这种没信息的提示。
- 前端 `confirmRender` 的 catch 里也要展示真实 message（目前已是 `e?.message`，但 invoke 失败时 message 就是那串英文）。

### 改动文件

- `src/pages/marketing/MarketingVideo.tsx` — UI 顺序 + StepBar + `confirmRender` 容错与错误展示
- `supabase/functions/render-marketing-video/index.ts` — 多段并行提交 + 200+ok 错误返回约定
- 不动数据库 schema、不动其他 edge function

完成后我会：用 30s × 9:16 走一次完整流程，确认前端能进入"已入队"状态；如果失败，前端能显示"第 X 段创建失败：xxx"这类中文真实信息。