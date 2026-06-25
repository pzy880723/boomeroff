# 视频生成错误"人话化"+ 一键修复

## 现在的问题
当 Seedance 渲染失败时，前端直接把英文报错（比如 `the parameter resolution specified in the request is not valid for model doubao-seedance-2-0-fast in flf2v ...`、`input image may contain real person`、`account ... has not activated the model`、`last frame image content cannot be mixed with reference image`、`分段读取失败(403)`）原样吐给你。看不懂，也不知道该改什么。

## 要做的事

### 1. 后端：把每种已知错误打上"机器可读的原因码"
在 `render-marketing-video` / `poll-marketing-video` / `surprise-marketing-video` 抓到火山 / 拼接错误时，除了原文，再额外写入 `failure`：

```
{
  code: 'resolution_not_supported' | 'real_person_blocked' | 'model_not_activated'
      | 'ref_and_lastframe_conflict' | 'segment_url_expired' | 'stitch_failed'
      | 'unknown',
  title: 中文一句话标题,
  detail: 中文解释（为什么发生）,
  fixes: [{ id, label, kind: 'auto' | 'manual' }],
  raw: 原始英文（折叠在"查看技术细节"里）
}
```

写入 `marketing_video_jobs.meta.failure`，让前端能直接读。

### 2. 前端：失败卡片改版
当前 `SurpriseVideoDialog` / `MarketingVideo` / `AssetDetailDialog` 里的视频失败态，只显示一行红字。改成：

```text
┌───────────────────────────────┐
│ ⚠️ 渲染失败                    │
│ {中文标题}                      │
│ {中文解释，2-3 行}              │
│                               │
│ 建议这样改 ↓                   │
│ [ 一键切换到 Pro 模型 ]         │
│ [ 一键降到 720p ]               │
│ [ 不用首尾帧，仅用参考图 ]      │
│ [ 重新生成分镜静帧 ]            │
│ [ 重试 ]                       │
│                               │
│ ▸ 查看技术细节                 │
└───────────────────────────────┘
```

按钮按 `failure.fixes` 动态渲染，点一下就改对应字段并立即重渲染，不需要你回去翻设置。

### 3. 已知错误的映射表（先覆盖这 6 类）

| 触发关键词 | 中文标题 | 一键修复选项 |
|---|---|---|
| `resolution ... not valid ... fast ... flf2v` | Fast 模型不支持当前分辨率组合 | ① 切到 Pro（保持画质） ② 降到 720p（继续用 Fast） |
| `input image may contain real person` | 画面被判定为"真人"被拦 | ① 重新生成分镜静帧（加大插画感） ② 去掉首尾帧只用参考图 ③ 换纯文字渲染 |
| `has not activated the model` | 当前模型未开通 | ① 自动切到 Fast ② 自动切到 Mini |
| `last frame ... cannot be mixed with reference` | 首尾帧和参考图冲突 | ① 自动去掉参考图（已在后端做，前端补提示） |
| `分段读取失败(403)` / `expired` | 分段链接已过期（>24h） | ① 重新生成整条视频（旧分段无法续拼） |
| 其他 | 渲染失败 | ① 重试 ② 切到更稳的 Fast |

### 4. "一键调整视频内容"入口
在失败卡片下方再加一条 `🪄 让 BOOMER 自动改一版`：直接调 `surprise-marketing-video` 复用当前脚本和素材，但应用上面推荐的修复（换模型 / 换分辨率 / 不用首尾帧），不用你做任何选择。

## 技术细节（给开发看）
- 新增 `supabase/functions/_shared/video-failure.ts`：`classifyVolcError(raw): Failure`，集中维护关键词→code 映射。
- `render-marketing-video`、`poll-marketing-video`、`stitchVideos.ts` 抛错路径统一调用，写入 `meta.failure`。
- 新增 `src/components/marketing/VideoFailureCard.tsx`，被三处复用：`SurpriseVideoDialog`、`MarketingVideo`（分镜行）、`AssetDetailDialog`（素材库视频）。
- 修复按钮统一通过 `useVideoFixActions(jobId, failure)` 触发；`auto` 类直接改参数并 `render-marketing-video` 重渲；`manual` 类只跳转到对应设置位。
- 不改数据库 schema，复用 `meta jsonb`。

## 不做
- 不改脚本/分镜生成逻辑本身。
- 不改 Seedance 调用参数默认值（只在"修复时"才覆盖）。
