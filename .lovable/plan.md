
## 思路调整

同意你的判断：分段拼接一定会崩人物一致性，Seedance 也吃不下那么细的分镜口令。改成"一段话式脚本 + one_shot 直出"更稳。

## 改动

### 1. 15s 脚本生成：内部保留分镜，对外输出"一段话导演稿"
文件：`supabase/functions/generate-marketing-video-script/index.ts`

- 保留现在的 5 段 JSON 结构（前端展示、字幕烧录仍要用），但**新增一个字段** `one_shot_prompt`：一段 120–180 字的中文口语化导演稿，把 hook + 3 中段 + outro 揉成一段自然叙述，只交代：
  - 主角在这家店里做什么（连贯动作串起来，例："走进店里 → 挑起一只中古包 → 试戴一副墨镜 → 拉着镜头喊冲"）
  - 整体情绪、节奏、镜头感（"手持跟拍、明亮色调、节奏轻快"）
  - 一句总台词方向（"全程边逛边对镜头讲这家店多好逛、多便宜、姐妹快冲"），**不写逐字台词**
- prompt 里明确告诉模型："逐镜 dialogue 只给字幕烧录用，`one_shot_prompt` 才是交给视频模型的最终稿，越自然越好，别写分段、别写秒数、别写'镜头 1 / 镜头 2'"。
- 非 15s 视频不受影响，`one_shot_prompt` 可为空字符串。

### 2. 渲染：15s 一律走 one_shot，用 `one_shot_prompt` 当主 prompt
文件：`supabase/functions/render-marketing-video/index.ts`

- `buildOneShotPrompt` 改造：如果 `script.one_shot_prompt` 存在，就用它当"分镜叙述"主体，替代现在按镜头逐条堆砌 `【开场】【镜头1】…` 的写法。人物锁定、店铺环境、风格、真实感、"禁止门/街边/文字水印"这些约束**全部保留**放在前后。
- auto 策略回退到原来的判断：`total ≤15s → one_shot`，不再强推 per_shot；`surprise-marketing-video` 继续 `render_strategy: 'one_shot'`。
- 参考图逻辑保持不变（角色板 + storyboard + 实景照，上限 9 张），继续锁人物。

### 3. `surprise-marketing-video` 无需改
- 它现在就是 one_shot 提交，脚本里多出的 `one_shot_prompt` 会自然带过去。

### 4. 前端字幕（可选，不做也行）
文件：`src/lib/marketingVideoStitch.ts` / `AssetDetailDialog.tsx`
- 15s one_shot 场景下不需要拼接。若想让台词可见，可后处理把 hook/scenes/outro 的 `subtitle` 按时间点烧成底部字幕；这一步独立、失败不影响出片。**先不做，看直出效果再定。**

## 不改
- 角色一致性、参考图、storyboard 流程
- 脚本 JSON 结构对外契约（只是新增 `one_shot_prompt`）
- 20s / 30s 及以上长视频的分段渲染路径

## 技术细节
- `one_shot_prompt` 走同一个 JSON 输出，模型只多写一段字符串，几乎不增成本。
- `buildOneShotPrompt` 优先级：`one_shot_prompt` > 逐镜堆砌（老逻辑保留做兜底，防止旧脚本失效）。
- 总 prompt 长度仍限制在 2000 字符内，超出就截断。
