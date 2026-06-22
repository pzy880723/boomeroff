## 问题
分镜数量被写死成"4–6 条 + hook + outro"(`generate-marketing-video-script` 第 111、201 行),草稿脚本中段也固定 2–4 段,无视 15s/20s/30s 的差别 — 30s 太挤、15s 太松。

## 改法(两个 edge function,纯 prompt + 清洗逻辑)

### 1. `supabase/functions/generate-marketing-video-script/index.ts`
按 ≈2.5s/镜估算总镜数:

```ts
// 在 duration 解析下加:
const targetClips = Math.max(3, Math.round(duration / 2.5));   // 15→6, 20→8, 30→12
const minScenes = Math.max(2, targetClips - 2);                // hook+outro 占 2
const maxScenes = targetClips + 1;                             // 给 AI 一点弹性
const perClipMin = duration >= 25 ? 1.5 : 2;
const perClipMax = duration >= 25 ? 3.5 : 5;
```

- 把第 111 行 `镜头条数 4–6 条;每条 2–5 秒` 改成
  `镜头条数 = 总时长/约2.5秒 ≈ ${targetClips} 条(含 hook 和 outro),中段 scenes 数组长度 ${minScenes}–${maxScenes} 条;每条 ${perClipMin}–${perClipMax} 秒,总和必须 ≈ ${duration} 秒。`
- 第 195 行 `duration_s` 上限从 6 改成 `perClipMax + 1`(保留兜底,避免某条独大)。
- 第 201 行 `script.scenes = script.scenes.slice(0, 6)` 改成 `slice(0, maxScenes)`;若 `script.scenes.length < minScenes`,记一条 warn(不强制重生,前端依旧能用)。
- 生成后增加一次时长均摊:把所有 clip 的 `duration_s` 等比缩放到总和 = `duration`,避免 AI 给出 4s+4s+4s 这种 30s 视频却只算 12s 的情况。

### 2. `supabase/functions/marketing-video-brief-chat/index.ts`(draft_script 分支)
把第 83–94 行的"中段 2–4 段、全文 150–300 字"改成按时长动态:

```ts
const midCount = Math.max(1, Math.round(duration / 2.5) - 2);  // 15→4, 20→6, 30→10
const wordsLo = Math.round(duration * 12);   // 15→180, 30→360
const wordsHi = Math.round(duration * 18);   // 15→270, 30→540
```

- 模板提示从"中段 2–4 段"改成"中段 ${midCount} 段(可上下浮动 1 段)";
- "全文 150–300 字"改成"全文 ${wordsLo}–${wordsHi} 字";
- 仍然每段结尾 `[图 #N]`,规则不变。

### 3. 兼容
前端 `VideoScenesCard` / `VideoBriefChat` 不动 — `scenes` 数组本来就支持任意长度。

## 验证
- 15s 视频:草稿大约 4 段中段,生成后 `scenes.length` 在 4–7 之间,总 duration ≈15s。
- 30s 视频:草稿 8–10 段,生成后 `scenes.length` 在 9–13 之间,总 duration ≈30s。
- 20s 视频:介于两者之间。
- 不动 UI、不动数据库。
