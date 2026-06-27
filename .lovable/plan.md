## 目标
30 秒视频 = **正好 2 段 × 15 秒** Seedance 渲染 + 1 次拼接,不再出现 3 段/4 段。20 秒同理走 1 段直出或 2 段(10+10),15 秒维持单段直出。

## 现状问题
- 当前 `planSegments` 用「贪心装箱、每段 ≤15s」的算法。脚本里每镜 2-3s,经常出现 6s+9s+9s+6s = 4 段,或 14s+8s+8s = 3 段,渲染调用次数翻倍,token 成本翻倍。
- 前后端共用同一份切段逻辑(`src/lib/marketingSegments.ts` / `supabase/functions/_shared/marketing-segments.ts`),所以只需要改一处算法,两边一起跟上。

## 方案:按目标段数等分,而不是贪心装箱

新增一个「目标段数」概念,根据 `total_duration_s` 直接定死:

| 总时长 | 目标段数 | 每段预算 |
|--------|---------|---------|
| ≤15s   | 1       | 全部     |
| 16–20s | 2       | ~10s/段  |
| 21–30s | 2       | ~15s/段  |
| 31–45s | 3       | ~15s/段  |
| >45s   | ceil(总时长/15) | ~15s/段 |

切段时:
1. 先算 `targetSegments` 和 `budgetPerSeg = totalDur / targetSegments`。
2. 顺序遍历分镜,累加 `duration_s`;当累加 ≥ `budgetPerSeg` 且还没到最后一段,就关掉当前段、开新段。
3. 保留 hard cap:任何一段实际时长不得超过 `MAX_SEG_DUR (15s)`;若某一镜本身就超 15s,把它单独成段(罕见,sanitize 已经 clamp 过)。
4. 最终段数若因 hard cap 被迫多出 1 段,允许;但绝不会比 `targetSegments` 少。

这样 30s 脚本无论有 8 镜还是 12 镜,都正好分成 2 段,每段约 15s,Seedance 调用从 3-4 次降到 2 次。

## 代码改动(2 个文件,镜像同步)

**1. `src/lib/marketingSegments.ts`**
- 新增 `function targetSegmentCount(totalDur: number): number`(上表逻辑)。
- 重写 `planSegments`:先算 `total = Σ duration_s`、`target = targetSegmentCount(total)`、`budget = total / target`,按预算切段,保留 15s hard cap。
- 导出 `targetSegmentCount` 供 UI 文案使用。

**2. `supabase/functions/_shared/marketing-segments.ts`**
- 同步加 `targetSegmentCount` + 重写 `splitScript`(或当前后端切段函数,需要确认实现位置,如果是在 `render-marketing-video/index.ts` 里也一起改)。
- 顺手把这个文件里残留的 `export const MAX_SEG_DUR = 10` 改成 `15`,与前端 / Seedance 单段上限一致。

**3. `src/pages/marketing/MarketingVideo.tsx`**
- 分段预览头部文案更新:"30 秒视频固定切为 2 段 × 15 秒,共调用 Seedance 2 次"。让用户清楚省了钱。

## 不动的部分
- 脚本生成端 (`generate-marketing-video-script`) 不变:它只负责出分镜,不关心怎么切段。
- 拼接逻辑 `stitchVideos.ts` 不变。
- 单段直出路径(≤15s)不变,「惊喜一下」仍然 0 次拼接。

## 验收
- 选 30s + 生成脚本 → 分段预览显示 **2 段**,每段时长 13-15s。
- 后端 `render-marketing-video` 日志里 Seedance 任务数 = 2,触发 1 次 stitch。
- 选 20s → 显示 2 段(10+10);选 15s → 仍单段直出。
- 选 45s → 显示 3 段。
