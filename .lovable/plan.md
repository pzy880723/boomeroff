## 目标
让「惊喜一下」的探店脚本台词更够听:按 15 秒中速旁白的容量给字数(~70 字),全程一条主线讲清楚这家店;同时关掉「优雅慢悠悠」人设,所有博主至少要带点激动劲儿。

## 字数测算
中速口播 4.5 字/秒,激动口播 ~5 字/秒。15 秒视频留 0.5 秒呼吸 → **目标台词总字数 65–80 字**,按 6 个镜头 ≈ 每镜 10–14 字,hook 与 CTA 各放宽到 ≤10 字。

## 改动清单

### A. `supabase/functions/generate-marketing-video-script/index.ts`
1. L99 → 把"宁可留白,不要塞满 / 每镜 6-10 字 / 总 45-65 字 / 可以留空"改成:
   > 全片必须像真人连续口播,**dialogue 字数加起来 65–80 字**,每镜 10–14 字,**hook ≤10 字、CTA ≤10 字**;**所有镜头都要有 dialogue,不允许空台词**(纯氛围画面会让视频太平)。
2. L100 硬规则改为按 5 字/秒估算(`dialogue 字数 ≤ duration_s × 5`),超出再删。
3. 新增一句「**贯穿主线**」要求:
   > 6 个镜头的 dialogue 串起来要是一段连贯的"探店日记"——从"为什么进店 → 看到了什么 → 上手体验 → 价格惊喜 → 谁适合 → 喊大家来"递进,不要每镜各说各的;反复点名店铺关键词「{店名 / 品类 / 钩子产品}」让观众记得住。
4. L134 字数上限:`dialogue ≤ ${isViralStoreTour ? 16 : 30} 字`(从 14 提到 16,留点缓冲)。

### B. `supabase/functions/_shared/persona-generator.ts`
1. **彻底禁用 `pace: 'slow'`**:`PersonaPace = 'medium' | 'fast'`,`normPace` 把 `slow` 映射为 `medium`,默认值仍是 `fast`。
2. 重写 L60–69 的品类→pace 指引:
   - 古董/瓷器/老物件/文玩/字画/旗袍/茶器 → **medium**,tone 例:沉稳但**带劲**地讲究 / 老克勒掏宝。**禁止"优雅 / 慢条斯理 / 留白冥想"等词**。
   - 家居/咖啡器具/原木 → medium,tone:有质感的安利,不端着。
   - 母婴/绘本 → medium 偏 fast。
   - 其它原本是 fast 的全部保持 fast。
3. `paceEn('medium')` / `paceZh('medium')` 措辞加上 **"with energy and enthusiasm / 带情绪、有起伏、不平铺直叙"**,杜绝 calm/measured 类英文出现在 Seedance prompt 里。
4. AI 生成 JSON 的 schema 描述里 `"pace"` 枚举改为 `"medium" | "fast"`,system prompt 增加一句:"禁止生成 slow 节奏,也不要 elegant/refined/calm 这类形容词,所有人设至少要 medium energy。"

### C. `supabase/functions/surprise-marketing-video/index.ts`
1. L264 风格池保持 `energetic/lively/playful` 不变(已经够激动)。
2. L280【全片要求】里把"4-6 个 2-3 秒小镜头"明确为"**6 个镜头,每镜都带台词,串成一段连贯的探店口播**",并补一句"博主每一镜都要有情绪起伏(惊喜/激动/安利感),不要平铺直叙"。

### D. 不动的地方
- `render-marketing-video` 的 prompt 不动:它读的是脚本里 `dialogue` 字段,字数上调后自然就够说了。
- 其它非 surprise 流程(`store_tour` 之外的 `intent`)仍走原 30 字上限。

## 影响
- 「惊喜一下」生成的视频里博主会从头说到尾,信息密度提升约 50%,且每次都围绕店名/品类做一条主线。
- 老克勒、家居主理人这类原来会被判 `slow` 的人设,现在仍然沉稳但会带情绪、有推进,不再"优雅得像 PPT"。
- 不新增任何前端开关。
