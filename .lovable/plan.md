## 问题诊断

**1. 素材库里很多视频"脚本已过期或未保存"**
- 走"惊喜一下 / Director"链路的视频,脚本存在 `video_generation_jobs.script_json`,素材 `meta.director_job_id` 指过去。
- 但 `AssetDetailDialog` 和 `generate-marketing-video-copy` 只会去 `marketing_video_jobs.script`(通过 `meta.job_id`)找脚本,找不到就报"过期"、"找不到视频脚本"。
- 结果:所有 Director / Surprise 出的片子在素材库里都看起来"脚本丢了",再生成文案也会 404。

**2. 广告文案太"干"**
- 上一版为了绕开视频侧版权拦截,把「本店 / 门店名 / 交通信息」全部禁掉了 —— 但文案不进 Seedance,不会触发版权,规则误伤到了文案侧。
- 结果:文案里没有分店名、没有营业时间,种草感不足,标题也不够"钩子"。

---

## 方案

### A. 脚本兜底读取(修复"过期")

**`src/components/marketing/AssetDetailDialog.tsx`**
- 加载脚本时,若 `asset.meta.job_id` 拿不到,则回退用 `asset.meta.director_job_id` 去 `video_generation_jobs.script_json` 取,并做字段归一化(hook / scenes / outro / total_duration_s / title / topic / style_label)映射到现有 `VideoScriptPanel` 需要的结构。
- `regenerateVideo` 也走同一套兜底,拿到脚本再决定走 `render-marketing-video`(原路径)还是提示"该视频来自惊喜一下,暂不支持一键重跑"(Director 链路是编排 worker,前端不该直接重推)。
- 面板底部小字从"脚本已过期或未保存"改成更准确的"该视频没有可回放的分镜脚本"。

**`supabase/functions/generate-marketing-video-copy/index.ts`**
- 找不到 `marketing_video_jobs.script` 时,回退用 `asset.meta.director_job_id` 读 `video_generation_jobs.script_json`。
- 再兜底:用 `asset.meta.publish_copy` / `summary` / `topic` / `title` 拼一个最小脚本摘要,保证一定能生成文案,不再直接 404。

### B. 文案更活泼(允许分店名 + 营业时间 + 标题党 + 网红感)

**`supabase/functions/generate-marketing-video-copy/index.ts`(只改这一个,不动视觉脚本链)**

- 重新加载店铺信息:`shops.name` + `address`(不再做 `scrubThirdPartyBrands`),塞进 system prompt 的 `【店铺信息 —— 只用于文案,不进画面】` 块,并明确说明"这些真实商场名/地址允许出现在正文和 hashtag 里"。
- 硬性规则改为:
  - **标题** ≤22 字,更"钩子":悬念 / 反差 / 数字冲击 / 身份代入 / "谁懂啊家人们" 类小红书体,允许 1–2 个 emoji,不要感叹号轰炸。
  - **正文** 140–200 字,分 2–3 短段(段间空一行),网红种草口吻;
    - 首句 3 秒 hook(反差 / 私藏感 / "刷到别划走");
    - 中段拿视频里的真实画面/台词种草,可以点出商场位置(如"中信泰富 B1");
    - 末段带一句自然的营业时间:「每天 10:00–22:00,路过随时来逛」这种口吻,不要生硬列时刻;
    - 结尾 CTA:评论 / 收藏 / 到店 / 私聊。
  - **emoji** 全文 4–7 个,允许小红书式点缀,但别堆成一片。
  - **hashtags** 6–10 个,顺序:品类词 → 中古/vintage/二手好物 → 城市/商圈/商场(如 `#中信泰富` `#静安中古` `#上海中古店`) → 人群相关。首个仍为 `#BOOMEROFF`。
  - **首评** 一句,可含地址/营业时间/互动引导。
  - **禁写**:地铁线路号、地铁站名、公交、路名、门牌号、"步行 X 分钟"等导航;虚假承诺(保真 / 秒杀 / 全网最低 / 拍卖行级别);"点击购买 / 扫码下单"淘宝体。
- `sanitize()` 精简:
  - 去掉 `我们门店 / 本店 / 小店 → BOOMER·OFF` 这条替换(允许出现商场名,但仍不希望品牌被稀释);改成只把裸的"本店 / 小店"替换成品牌名,`我们的门店` 之类保留。
  - 保留:`主播→店员`、`直播间→店里`、`保真 / 秒杀 / 限时抢 / 全网最低 / 拍卖行级别` 抹除。
  - 保留:连续品牌名去重。
- 生成参数微调:`temperature` 0.9,鼓励更"网感"。

### C. 不动的部分

- `_shared/brand-scrub.ts` / `render-marketing-video` / `director-*` / Seedance 提示词:视觉侧继续屏蔽第三方品牌招牌,防止再次触发版权拦截。
- 素材库其他字段、UI 布局、发单流程、`marketing_video_jobs` schema。

---

## 技术细节

- Director 侧 asset 的 meta 里目前没有 `topic` / `title`,兜底时用 `publish_copy.cover_title` 或 `summary`。
- 前端脚本面板需要处理两种脚本 shape:
  - `marketing_video_jobs.script`: `{ hook, scenes[], outro, total_duration_s, title, topic, style_label }`
  - `video_generation_jobs.script_json`: 结构相似但字段命名可能是 `scenes[{scene, subtitle, dialogue}]`,直接复用现有渲染逻辑即可,缺字段就跳过。
- 营业时间目前没有落到 `shops` 表字段;先在 prompt 里硬编码 "每天 10:00–22:00",后续如果不同门店时间不同再加 `shops.opening_hours` 字段(本次不做)。

---

## 验收

1. 打开一条"惊喜一下"生成的老视频 → 素材详情能展开看到分镜脚本,不再显示"过期"。
2. 对同一条视频点"生成广告文案":
   - 正文自然出现「中信泰富 B1」或对应分店名;
   - 末段带「每天 10:00–22:00」;
   - hashtags 含 `#BOOMEROFF` + 商场/城市标签,无地铁站/线路;
   - 标题明显更"钩子",不再是干巴巴陈述。
3. 视频重新渲染流程(render-marketing-video)行为不变,画面里仍然不出现第三方品牌。