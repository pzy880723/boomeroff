# 修复前后端视频分段不一致

## 问题

「分段预览」UI(前端 `src/lib/marketingSegments.ts`)用 **10s** 单段上限做规划,但 `render-marketing-video` 后端用 **15s**(Seedance 真实上限)。导致用户看到的段数 / 每段镜头组成 / 首尾帧落点跟实际渲染对不上。

例:当前脚本预览显示 8s+9s+9s+5s = 4 段,后端会重切成 8s / 9s / 14s = **3 段**。

## 方案

**单一真相源** = Seedance 单段上限(15s),前端预览贴着后端走。

### 改动 1:统一常量

- `src/lib/marketingSegments.ts`:`MAX_SEG_DUR` 从 `10` 改为 `15`,与 `src/lib/seedanceModels.ts` 里的 `SEEDANCE_MAX_SINGLE_SHOT` 对齐(import 引用,别再写魔数)。
- 同步检查 `src/pages/marketing/MarketingVideo.tsx` 里所有写死的「10 / 12 秒拆段」文案,改为基于 `MAX_SEG_DUR` 动态计算:
  - 「超过 12 秒的视频会自动拆成 N 段生成」→「超过 15 秒才会拆段,N 段...」
  - 「每段 ≤10s」提示 → 「每段 ≤15s」
  - 「多段视频如果不选...」的判断阈值改为 `duration > MAX_SEG_DUR`

### 改动 2:让前后端拆段算法走同一份代码

目前前端 `marketingSegments.ts` 的贪心拆段和后端 `render-marketing-video/index.ts` 的贪心拆段是两份独立实现,容易再次跑偏。

- 抽出纯函数 `splitScriptIntoSegments(script, maxSegDur)`,放在 `src/lib/marketingSegments.ts`,逻辑严格复刻后端那份贪心。
- 后端 `render-marketing-video` 不动(Deno 不能直接 import 前端文件),但在文件顶部加注释明确指向 `src/lib/marketingSegments.ts` 为「真相源」,以及 `MAX_SEG_DUR` 必须等于 `SEEDANCE_MAX_SINGLE_SHOT`。
- 加一个 dev-only 自检:在 `MarketingVideo.tsx` 调用 `splitScript` 时 `console.assert` 前后端常量一致,防止以后又分叉。

### 改动 3:UI 说明

在「分段预览」头部 chip 旁补一行小字:「按 Seedance 单段 15s 上限切分,真实渲染段数 = 预览段数」,让用户知道这就是实际会发生的事。

## 不做的事

- 不改后端 `MAX_SEG_DUR`(15 是 Seedance 真实物理上限,改小只会徒增成本和拼接缝)。
- 不改默认总时长 / 默认渲染流程。
- 不动「≤15s 单段直出、>15s 才走多段并行+拼接」的整体架构。

## 验证

1. 当前这条 30s 脚本预览应从 4 段(8/9/9/5)变成 **3 段(8/9/14)**,与后端日志 `[render multi] split into 3 segments` 对齐。
2. 进度条「分段 x/3」与后端 `segment_total = 3` 对齐。
3. 每段「开头帧 / 结尾帧」标签所标的那张图,正是后端 `pickSegmentImages` 实际拿去做 `first_frame / last_frame` 的那张。
