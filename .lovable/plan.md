## 背景

继续上一版改造(惊喜=洗脑探店、9 张参考图、不再分镜绑图),用户追加两条硬需求:

1. **开场镜头必须是门头**:每条探店片的第一个镜头都得展示店招/logo/大门口,不允许 AI 随意写别的钩子开场。
2. **脚本每次都得不一样,且尽量蹭最近的节日**:暑假/端午/国庆/春节/七夕/双十一/圣诞… 自动按当前日期挑最近一个节点,把节日氛围灌进脚本里。

## 改动

### A. 门头封面素材识别(后端 `surprise-marketing-video`)

- 新增 `pickStorefrontAsset(pool)`:从素材池里找一张最像「门头/店招/门口」的实景图,匹配规则:
  - `category` 包含「门头/门店/店面/外观/招牌」之一,或
  - `tags` 含「门头 / 门店 / 招牌 / logo / 店招 / 门口 / 外观」之一,或
  - `meta.summary` 文本里出现上述关键词。
- 命中 → 该图强制放进 `pickedAssets[0]`(后续主题聚拢仍正常跑,但首位锁死)。
- 未命中 → 在 `picked` 上挂 `needs_storefront: true`,前端弹一条提示「补一张门头照片,开场会更带感」,但流程继续(不阻塞)。
- 这张图同时作为 `picked.cover_url`(优先级高于角色板,因为它是探店开场)。

### B. 节日感知(后端,新增 `_shared/holiday-context.ts`)

- 内置一份本土节日表(阳历 + 农历常见节点),字段:`name / startMonth / startDay / windowDays(提前多少天可以开始借势) / vibe(暖民谣/烟花夜色/家庭团聚…) / hookHints(["姐妹冲","端午粽香探店"…])`。
- 包含:元旦、春节、情人节、女神节(3.8)、清明、五一、520、端午、儿童节、暑假(7.1–8.31)、七夕、教师节、中秋、国庆、双十一、双十二、平安夜/圣诞、跨年。
- 农历节日(春节/端午/中秋/七夕)用静态 2026–2028 阳历日期表硬编码,够用就行,不引第三方库。
- 导出 `pickUpcomingHoliday(now = new Date())`:返回距离今天 ≤ `windowDays` 且最近的一个,或 `null`。

### C. 脚本生成 brief 注入(后端 `surprise-marketing-video`)

- 调 `generate-marketing-video-script` 前组装 `briefTranscript`:
  - 强制段:
    > 「第 1 镜(钩子)必须是门口/店招/logo 的特写或推镜,主角站在门口或推门进店;subtitle 可以是『XX 店,走起!』之类。后续镜头才是店内场景。」
  - 节日段(命中时):
    > 「现在距离【中秋】还有 12 天,脚本氛围/对白请蹭中秋:团圆、礼盒、月饼味道的小众淘货… 钩子句可以用『中秋探店,姐妹冲!』之类。」
  - 多样性段:每次随机从 8–10 套钩子句式池里抽 2 个塞进 brief 作 hint(「别再去 XX 了」「我真的会谢」「这家店我能吹一年」…),并把当前 vibe 也写进去,让相同店每次产出不同钩子。
- 顶层 `topic` 改成 `${holiday?.name ?? '探店'} · ${heroSummary}`,影响 KB 检索。
- 在请求 body 加 `temperature_hint: 'high'`(纯标注,Lovable AI Gateway 不会用,但 prompt 里写明「请大胆变体,不要套同一句开头」)。

### D. 渲染 prompt(`render-marketing-video`,one_shot 分支)

- 在 `buildOneShotPrompt` 里把"首镜=门头"这条**再写一遍**(因为 Seedance 只看渲染 prompt,不看脚本对话);如果 picked.cover_url 是门头,prompt 头部固定加:
  > "Opening shot (0–2s): exterior storefront sign + brand logo, character walks toward the door / pushes the door open, hand-held push-in."
- 节日命中时,把 `holiday.vibe` 也并到 style cue 里(例如「mid-autumn warm lantern glow」)。
- 这两段都通过 `surprise-marketing-video` 在 render 调用 body 里新增 `prompt_overrides: { opening, style_cue }` 透传,而不是改 render 的核心逻辑。

### E. 前端 `SurpriseVideoDialog.tsx`

- 顶部 chip 增加:`节日 · 中秋(还有 12 天)`(命中时)。
- 9 张参考图横排,门头那张固定第 1 位,角标改成 `门头` 而不是 `#1`。
- `needs_storefront: true` 时,脚本块上方挂一条琥珀色提示:「还没有门头照片,建议拍一张大门 + 店招,开场会更像探店」。
- 文案里把"洗脑探店口播脚本"保留,loading 时附一行小字:「正在蹭最近的节日…」。

### F. 不动 / 边界

- `generate-marketing-video-script` 的接口不改字段,只通过 `brief_transcript`、`topic`、`highlight` 注入。
- 自定义视频(`MarketingVideo.tsx`)流程**不动**。
- 渲染策略仍是 `one_shot`,reference_image 顺序:门头 → 角色板 → 其余实景(总数 ≤ 9)。

## 验证

- 不同时间打开「惊喜一下」:6 月底显示「节日 · 端午」或「节日 · 暑假」;9 月底显示「节日 · 中秋」;无邻近节日时不显示。
- 同一家店连续刷 3 次:钩子句、subtitle、vibe 三段每次都不重复。
- 9 张参考图第 1 张永远是门头(命中时)或角色板兜底 + 琥珀提示。
- 最终视频 0–2 秒画面是门口/店招特写,主角推门或转身进店;后续镜头才进店内。
- 没有门头素材的店:看到提示,但仍能正常出片,开场退化成「主角推门」泛门口镜。
