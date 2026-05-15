
# 识别页:三段进度 + 失败一键兜底

## 目标
1. 快门到结果之间,把现在的"4 段时间叙事"换成**真实可对应的 3 段进度**:**读取图片 → 比对知识库 → 生成文案**,每段进入/完成都有明确反馈,不再是按 800ms 节拍假装在干活。
2. 失败遮罩从"重试 / 取消"升级为**3 个一键兜底动作**,让用户在原位修复问题,不用退出重头来。

---

## 一、三段真实进度

### 阶段定义与触发时机

| 阶段 | 文案 | 真实触发 | 完成判定 |
|---|---|---|---|
| ① 读取 | `正在读取这张图片` | 调用 `runRecognize` 起 | 客户端 `computeImageHash` 完成 + edge function `invoke` 已发起 |
| ② 比对 | `正在比对历史与知识库` | 进入阶段 ① 完成后 | 接收到响应 **或** 超过 1.2s 阈值(命中缓存通常 <500ms,超过即说明在走 AI) |
| ③ 生成 | `AI 正在生成文案与定价` | 进入阶段 ② 完成后 | 接收到响应 |

完成后,根据响应里的 `__pipeline.source` 反向修正显示:
- `hash_cache` / `name_cache` → 阶段 ② 直接打勾,阶段 ③ 跳过(显示"📦 命中缓存,秒回")
- `ai` → 三段全打勾

### 实现位置
`src/components/recognition/CameraStage.tsx`

- 删除 `SINGLE_STEPS` / `buildMultiSteps` 时间表 + `forceAllDone`。
- 新增 `phase` 状态:`'reading' | 'matching' | 'generating' | 'done'`。
- `runRecognize` 内部:
  1. `setPhase('reading')` → 把 hash 计算挪进来(目前在 hook 里)或暴露阶段回调。最小改动方案:在 `onRecognize` 里加一个可选的 `onPhase?: (p: Phase) => void` 回调,由 hook 在合适节点调用。
  2. 发起 `invoke` 后 800ms 没回来 → `setPhase('matching')`;1.6s 还没回来 → `setPhase('generating')`。
  3. 响应到达 → 根据 `__pipeline.source` 立即跳到正确终态。
- UI:把现有"步骤列表"替换为**3 项**,每项左侧圆点用 Loader2(进行中)/Check(完成)/灰点(未开始);底部计时器保留(已经是个亮点)。

### Hook 改造
`useGuestRecognition` 与 `useProductRecognition` 同步加 `onPhase` 回调:
```ts
recognize(input, { onPhase: (p) => ... })
```
- `'reading'` 在调用开始时
- `'matching'` 在 `invoke` 开始前(hash 算完)
- 不再额外发,由 CameraStage 用计时器从 `matching` → `generating`
- 响应到达后 CameraStage 自己读 `__pipeline` 决定如何收尾

> 业务逻辑不变,只是新增观察点。

---

## 二、失败一键兜底

### 现状
失败遮罩只有「重新识别」和「取消」。退出后,如果是因为光线/角度差,用户得回到摄像头从零开始。

### 新设计
失败遮罩里给 **3 个并列的次要按钮 + 1 个主按钮**:

```
[识别未成功]
原因可能是:角度不清 / 网络抖动 / 商品过于小众

  ┌──────────────────────────┐
  │  🔁  重新识别(同一张)      │  ← 主按钮
  └──────────────────────────┘
  [📷 补一张铭牌]  [✏️ 加文字描述]  [✕ 取消]
```

### 三个动作行为

1. **重新识别** —— 现有 `retryLast()`,不动。

2. **补一张铭牌(append-and-retry)**
   - 点击 → 触发隐藏 file input(已存在)
   - 选择图片 → 把新图追加到 `lastInputRef.current`
   - 自动切到多角度模式 + 立即调用 `runRecognize(updatedList)`
   - 如果原本就是单张,加完变成 2 张多角度送入

3. **加文字描述(text hint)**
   - 点击 → 弹出 shadcn `Sheet`(底部抽屉,iOS 风格),里面一个 `Textarea` + 提示"写下你看到的文字、品牌、年代等任何线索"
   - 提交 → 调用 `runRecognize(lastInputRef.current, { userHint: text })`
   - 后端 `recognize-product` / `recognize-product-public` 需要接收 `userHint` 字符串并塞进 prompt:`"用户补充信息(高优先级线索):${userHint}"`

### 文件清单
- `src/components/recognition/CameraStage.tsx` —— 主要 UI 改动
- `src/components/recognition/RetryHintSheet.tsx`(新增) —— 文字描述抽屉
- `src/hooks/useProductRecognition.tsx` —— 接收 `userHint` 透传
- `src/hooks/useGuestRecognition.tsx` —— 同上
- `supabase/functions/recognize-product/index.ts` —— 解析 `userHint`,加入 prompt
- `supabase/functions/recognize-product-public/index.ts` —— 同上
- 父级 `Scan.tsx` / `PublicScan.tsx` 的 `onRecognize` 签名:从 `(images) => Promise<boolean>` 改为 `(images, opts?: { userHint?: string }) => Promise<boolean>`

---

## 技术细节

### Phase 状态机
```text
       ┌────────┐  hash done   ┌──────────┐  >800ms or resp  ┌────────────┐  resp
idle → │reading │ ───────────→ │ matching │ ───────────────→ │ generating │ ────→ done
       └────────┘              └──────────┘                  └────────────┘
                                                              ↑ 命中缓存时
                                                              直接 done
```

### 命中缓存的特殊处理
响应到达时,如果 `__pipeline.source !== 'ai'` 且 `phase === 'matching'`:
- 阶段 ② 直接打勾
- 阶段 ③ 显示 `已命中缓存 · 跳过`(灰色,带 ⚡)
- 不闪到 ③ 再打勾,避免视觉跳变

### userHint 在后端的接入点
两个 edge function 都有一段构建 user prompt 的逻辑,在图片 part 之后追加:
```ts
if (typeof body.userHint === 'string' && body.userHint.trim()) {
  parts.push({ type: 'text', text: `用户补充线索(高优先级,请优先采纳):\n${body.userHint.trim()}` });
}
```
不影响缓存命中(缓存只看 imageHash),只在 cache miss 走 AI 时生效。

---

## 不在本次范围
- 不改识别管线本身(还是 hash → name → AI)
- 不改结果页排版
- 不改店员端浮窗
- 不引入流式响应(SSE)—— 阶段切换仍用智能计时器近似,等以后边缘函数支持流式再升级
