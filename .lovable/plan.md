## 问题
1. AI 识别结果出现英文（如 "Yonex Astrox 88D Pro badminton racket"、"NAD+ Booster Serum"），需强制全中文输出
2. 年代标签过于普通，需要在结果卡片中突出显示

## 改动

### 1. `supabase/functions/recognize-product/index.ts` — 强化中文 prompt

把识别 prompt 改写为：
```
你是中古杂货识别助手。仅返回JSON，简洁不啰嗦。

【硬性要求·必须遵守】
所有字段必须使用简体中文输出，严禁出现任何英文单词、英文品牌名、英文型号、拼音或日文假名。
- 商品名(name)：必须中文。如为外文品牌(例如 Yonex、Lego、Snoopy、NAD+)，必须翻译或音译为中文，例如"尤尼克斯羽毛球拍 天斧88D"，"史努比"。型号编号可保留数字+字母。
- 年代(era)：必须中文，例如"昭和后期(1970s)""平成初期""1980年代""明治时期"，禁止只写"Showa"。
- 产地(origin)：必须中文，例如"日本""中国景德镇"。
- 材质/工艺/描述/卖点/贴士：全部中文。
- 若无法确定字段，写"不详"，不要留英文占位。

格式：{...同前...}
sellingPoints要3条短句直击重点，全部中文。
```
部署该函数。

### 2. `src/components/recognition/ProductDetailCard.tsx` — 突出年代标签

把当前年代 badge 抽出，改为独立的强调块：
- 渐变描边卡片（accent 色），带 `年代` 小标签 + 大字号的 era 文本（`font-display text-lg`）
- 放在标题下方、其他 badge 之上
- 其他 badge（品类、产地、置信度）保留为小圆角

## 文件
- 改：`supabase/functions/recognize-product/index.ts`
- 改：`src/components/recognition/ProductDetailCard.tsx`