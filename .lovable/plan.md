# 惊喜一下 → 博主人设「按品类动态生成」

## 核心修正

不再用预设博主库，改为**让 AI 根据本次素材的品类/主题，先动态生成一位最匹配的探店博主人设**，再用这个人设去写脚本和渲染视频。

例如：
- 素材是瓷器/老物件 → AI 生成「55 岁老克勒大叔，旗袍马甲，文气稳重」；
- 素材是潮玩/盲盒 → AI 生成「22 岁年轻女生，发色挑染，活泼跳脱」；
- 素材是户外装备 → AI 生成「30 岁登山男，冲锋衣，硬朗低音」。

---

## 改动 1：新建「博主人设生成器」步骤

文件：`supabase/functions/surprise-marketing-video/index.ts`

在素材打标 / 选图完成、写脚本**之前**插入一个轻量 AI 调用：

输入：
- 该批素材的 `category / tags / summary`（已有的 AI 打标结果）；
- 店铺名 + 主营品类（来自 shop_context）；
- 当前节日 vibe。

让 Gemini 输出严格 JSON：
```json
{
  "label": "55岁老克勒大叔",
  "gender": "male",
  "age": 55,
  "visual": "灰白短发、圆框眼镜、棉麻立领衬衫、稳重儒雅",
  "vibe": "慢条斯理、带点上海口音的文气探店",
  "opener": "各位看官",
  "catchphrase": ["这件东西可不得了", "我跟你讲", "懂行的都明白"],
  "cta": "地址放评论区，识货的来"
}
```

约束：必须跟素材品类匹配（瓷器/古董→中老年；潮玩/美妆→年轻；亲子→宝妈；户外→硬汉）；禁止真人姓名。

把结果存在 `persona` 变量里向下传。

## 改动 2：persona 注入脚本与渲染

- `generate-marketing-video-script` 调用时把 `persona` 透传，system prompt 用 persona 的 `visual / vibe / opener / catchphrase / cta` 替换上一版固定句池；
- `render-marketing-video` 的 `prompt_overrides.persona_directive` 用 persona.visual 拼一行强约束（同一人/同一发型/同一服装贯穿全片）。

## 改动 3：删除预设博主库

不再创建 `_shared/influencer-personas.ts`。改为新建 `_shared/persona-generator.ts`，导出 `generatePersona({ assetTags, shop, holiday })`，内部封装上述 AI 调用 + JSON 解析 + 兜底（AI 失败时回退到一个通用「年轻女生」人设，保证流程不断）。

## 改动 4：前端展示

`SurpriseVideoDialog.tsx` 顶部 chip 改为：
- 「🎬 今日博主：{persona.label}」
- 鼠标 hover / 点击展开显示 `visual` 与 `vibe` 全文，方便店主理解 AI 为什么挑这个人。

## 不动

- 角色板（character）在惊喜流程里依旧不使用；
- 门头锁开场、节日借势、9 张参考图封顶、台词 ≤14 字/镜、one_shot 策略、`render-marketing-video` 主体逻辑全部保留；
- 「帮我拍」自定义流程不受影响。

---

## 技术细节

- 新增的 persona AI 调用走 `google/gemini-3-flash-preview`，temperature 0.9，无图片输入，单次 ~300 tokens，延迟可忽略；
- persona JSON 进 `surprise_jobs.result.persona` 字段持久化，便于复盘和前端展示；
- 若素材打标信息为空，退化为按店铺主营品类生成，仍能跑通。
