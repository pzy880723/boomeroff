## 现状诊断

现在 AI 给店员的话术只有三段扁平内容：
- `sellingPoints[3]` —— 三句不分类的"卖点"，AI 经常一锅炖（年代+工艺+品牌+稀缺性混在一起）
- `description ≤80 字` —— 客观描述，店员要从中自己提炼
- `tips` —— 一段"小贴士"，定位模糊

店员看完不容易"一秒抓住要点"，也不容易记忆。需要把话术**结构化分类 + 控制每段字数 + 给固定的口语模板**，让它一眼能扫、张口能讲。

## 优化方向

### 1. 把"卖点"重构成 4 类带标签的话术结构

把 `sellingPoints` 从纯字符串数组升级为带类型的对象数组。每条最多 18 个汉字，便于店员瞄一眼背下来。固定四个分类槽（按重要性自动选 3 条返回，不强求每类都有）：

| 标签 | 内容定位 | 例子 |
|---|---|---|
| `身世` (origin) | 年代 / 产地 / 窑口 / IP | 「昭和中期九谷烧赤绘」 |
| `工艺` (craft) | 关键技法 / 材质亮点 | 「手绘金彩、细描笔触」 |
| `稀缺` (rarity) | 限定 / 绝版 / 存世量 | 「2003 年限定，已绝版」 |
| `场景` (use) | 使用建议 / 收藏定位 | 「茶席摆件，送礼有面」 |

JSON 结构：
```json
"sellingPoints": [
  {"tag": "身世", "text": "昭和中期九谷烧赤绘"},
  {"tag": "工艺", "text": "手绘金彩，细描笔触"},
  {"tag": "稀缺", "text": "完整带原盒，越来越少"}
]
```

### 2. 把"description"拆成两句模板话术

不再返回一段散文，而是返回两个固定槽位，店员看到就能直接念：

```json
"pitch": {
  "opener": "一句话开场（≤22 字，先报身份）",
  "highlight": "一句话亮点（≤28 字，讲为什么值得）"
}
```

例：
- opener: 「这是昭和年间的九谷烧赤绘小皿。」
- highlight: 「红绘金彩全手绘，盘底有匠人落款，老件里少见的好品相。」

合起来恰好 ~50 字，对应原来的 10 秒讲解节奏。原 `description` 字段保留为可选的"长描述"（≤80 字），用于详情页/复制全文，不在主卡片显眼位置。

### 3. 把"tips"明确分成两类

现在 `tips` 一段话什么都装。拆成结构化两栏：

```json
"tips": {
  "memory": "记忆锚点（≤20 字，给店员的小抄）",
  "objection": "顾客常问应答（≤30 字）"
}
```

例：
- memory: 「认准盘底"九谷"二字红款」
- objection: 「问真假？盘底落款+金彩磨损是真品标志」

### 4. 提示词补强专业度

在 `recognitionPrompt` 里追加：
- **专业用词清单**：要求使用行业术语（如"釉下彩 / 描金 / 包浆 / 落款 / 限定再版 / 完品"），禁用空话（"非常精美""值得收藏""极具价值"列入禁用词黑名单）。
- **数字优先**：能给年份就给年份（"昭和 40 年代"优于"昭和年间"），能给尺寸/容量就给。
- **断言克制**：仍延续现在的"不确定写不详"原则；新增——分类槽位若无证据，**整条省略**，不要硬凑。
- **口语化校验**：opener / highlight 必须是完整可朗读的口语句，结尾带句号，不出现冒号、括号、引号、JSON 残片。

### 5. 前端 UI 适配

`ProductDetailCard.tsx`：
- 「核心卖点」区改成带彩色标签 chip 的列表：每条左侧一个圆角小 badge 显示 `身世/工艺/稀缺/场景`，右边是话术正文。视觉上一秒能扫。
- 新增「一句话开场」+「一句话亮点」两行大字卡片（替代原 description 卡片的主位），用引号包裹，做成"可直接念"的样子。原 `description` 折叠到「展开详情」里。
- 「店员小贴士」卡片内部再分成两个小段：「记忆口诀」+「顾客常问」，左侧各自一个图标。
- 朗读按钮念的内容改成 `opener + highlight + sellingPoints` 拼接，控制总长 ~100 字（保留现有 ~10 秒话术约束）。

### 6. 兼容历史数据

历史 `products` 表里旧记录的 `selling_points` 仍是 `string[]`、`description` 仍是长文本。前端渲染时：
- 若 `sellingPoints[0]` 是字符串 → 按旧格式渲染（无 tag）；
- 若是对象 → 按新格式带 tag 渲染。
- `pitch` 不存在时回退到 `description` 整段显示。
- `tips` 是字符串时回退到旧的单段显示。

不做数据迁移，旧数据自然继续可读，新识别开始用新结构。

### 7. 同步改动

- `recognize-product` Edge Function：更新 prompt + JSON schema 模板。
- `refine-recognition` Edge Function：JSON 输出结构同步升级（保持两端一致，纠错对话也能产出新结构）。
- `submit-correction` / `review-correction`：透传新字段即可，无需改逻辑。
- `src/types/index.ts`：`RecognitionResult.sellingPoints` 改为 `(string | {tag: string; text: string})[]`；新增可选 `pitch?: {opener: string; highlight: string}`；`tips` 改为 `string | {memory?: string; objection?: string}`。
- `ProductDetailCard.tsx`、`ProductDetailDialog.tsx`、`ShareToCommunityButton.tsx`、`LiveStreamPanel.tsx`：渲染层适配 + 兼容回退。

### 8. Memory 更新

更新 `mem://features/script-length-refined`：
- 新结构由 `pitch.opener + pitch.highlight` 承担 ~50 字开场+亮点；`sellingPoints` 三条带标签，每条 ≤18 字；总朗读量仍控制在 ~100 字 / 10 秒。
- 增加禁用词黑名单（"非常精美/极具价值/值得收藏/匠心独运"等）。

## 不动的东西

- 数据库 schema：`selling_points jsonb`、`description text`、`tips text` 字段类型不变（jsonb 直接存对象数组即可，text 字段在新结构下存 JSON 字符串或保留原文都可——计划在 `tips` 上保持 text，存 JSON 字符串，前端 `try/parse`，避免迁移）。
- 识别速度约束：1-3 秒不变，prompt 增量很小，不影响速度。
- `confidence`、`category` 等核心字段不变。

## 验收清单

- 识别一件瓷器，结果里能看到带"身世/工艺/稀缺/场景"标签的卖点。
- "一句话开场"读起来像店员张口就能讲的人话，不超过 22 字。
- 不出现"非常精美""极具价值"等空词。
- 旧的历史商品仍能正常打开，无报错。
- 朗读按钮念出来 ~10 秒，节奏和现在一致。
