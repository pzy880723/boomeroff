## 问题原因

排队失败报错 `violates check constraint "marketing_video_jobs_status_check"`。

数据库 CHECK 约束只允许 5 个值:
`queued / rendering / done / failed / cancelled`

但 edge function 代码里硬编码了一个**不在白名单内**的状态 `"running"`,所以 INSERT 一进数据库就被拒绝 → 前端显示"排队失败"。

出错位置(都是 `"running"`):
- `supabase/functions/render-marketing-video/index.ts` 第 254、305、312 行
- `supabase/functions/poll-marketing-video/index.ts` 第 20、29、31、153、155、158 行

## 修复方案

两条路二选一,推荐**方案 A**(改代码,数据库语义更清晰):

### 方案 A:把 `running` 统一改成 `rendering`(推荐)

把上面两个 edge function 里所有 `status: "running"` / 字面量 `"running"` 改成 `"rendering"`,与已存在的 CHECK 约束、其余约定保持一致。
- `render-marketing-video/index.ts`: 3 处
- `poll-marketing-video/index.ts`: 6 处(包括 `mapArkStatus` 的返回值,把内部 `"running"` 映射也改成 `"rendering"`)

不影响前端 — `MarketingLibrary.tsx` 没有按 `running` 过滤的逻辑(只读 status 用于展示)。

### 方案 B:迁移扩展 CHECK 约束加入 `running`

写一个 migration 把 `running` 加进白名单。但这样数据库里会同时存在 `running` 和 `rendering` 两种语义相同的值,后续易混乱,不推荐。

## 验证

修完后再点一次"开始生成",观察:
1. 不再报 check constraint 错误
2. `marketing_video_jobs` 新行 status = `rendering`
3. 轮询能正常推进到 `done` / `failed`
