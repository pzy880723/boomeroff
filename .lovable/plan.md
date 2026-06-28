## 问题

你看到的 `Edge Function returned a non-2xx status code` 是 supabase-js 抛出的原生英文报错。我们其实早就写了一个翻译器 `src/lib/invokeFn.ts` 来把它转成中文（"服务暂时不可用，请稍后再试"），但**全项目 84 处 edge function 调用里只有 2 处走了这个翻译器**，剩下 82 处直接用了原生 `supabase.functions.invoke(...)`，于是英文就漏到你眼前了。

视频生成这条链路 (`MarketingVideo.tsx` / `SurpriseVideoDialog.tsx` / `surpriseJob.ts` / 轮询) 就在这 82 处里，所以渲染失败时你看到的是原始英文，而不是上次给你做的 `videoFailure.ts` 中文映射。

## 要做的事

### 1. 强化翻译器 `src/lib/invokeFn.ts`
- 在 `humanize()` 里追加视频/渲染场景常见英文：
  - `WORKER_RESOURCE_LIMIT` → "渲染服务繁忙，请稍后重试（系统已自动降级）"
  - `not having enough compute resources` → 同上
  - `RUNTIME_ERROR` / `EarlyDrop` → "渲染任务异常，已记录，请重试"
  - `Edge Function returned a non-2xx status code` → "服务暂时不可用，请稍后再试"（已有，但要确保兜底命中）
- 同时调用 `mapVideoFailureToZh()`（已有的 `src/lib/videoFailure.ts`）做二次兜底，把火山引擎的英文错误码再翻一遍。

### 2. 全量替换 82 处 `supabase.functions.invoke(...)` → `invokeFn(...)`
两者签名一致，可机械替换：
```ts
// 旧
const { data, error } = await supabase.functions.invoke('xxx', { body });

// 新
import { invokeFn } from '@/lib/invokeFn';
const { data, error } = await invokeFn('xxx', { body });
```
影响文件清单（共 50+ 个）：所有 `src/pages/marketing/*`、`src/components/marketing/*`、`src/components/admin/*`、`src/hooks/use*Recognition*`、`src/lib/surpriseJob.ts` 等。逐个文件加 import + 替换调用，不动业务逻辑。

### 3. 重点链路加"看得懂的失败卡片"
视频生成失败时（轮询发现 `status=failed`），不再只 toast 一行字，改为在 `MarketingVideo.tsx` / `SurpriseVideoDialog.tsx` 直接复用现成的 `VideoFailureCard.tsx`，把以下信息摊开给你看：
- 第几段失败、失败原因中文化
- 一句"我们已经做了什么"（例如：已自动去掉首帧/已自动降级到 Fast 模型）
- 一个明显的"重试这一段"按钮 + 一个"换个策略重试"按钮

### 4. 顺手修后端的根因
本次 `WORKER_RESOURCE_LIMIT` 真正的根因是 `render-marketing-video` 里 `face-gateway` 字体加载失败循环重试，上一轮已经改掉。这次只补一行兜底：当 face-gateway 整体失败时，跳过软通过、直接用原图（已有逻辑，但要保证抛出的错误是中文）。

## 你最终看到的效果

之前：
> Edge Function returned a non-2xx status code. WORKER_RESOURCE_LIMIT...

之后：
> 渲染服务暂时繁忙（第 3 段处理超时），系统已自动重试一次仍失败。建议：① 重试这一段；② 换"一镜到底"策略再试一次。

## 不在范围内

- 不动数据库结构
- 不改视频生成本身的算法
- 不动 i18n 框架（项目还是中文硬编码，全量上 i18n 太大）
