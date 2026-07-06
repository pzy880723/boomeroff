## 问题

`_shared/persona-generator.ts` 里的 prompt 默认把主角定成"25 岁年轻女生 / 潮牌帅哥",fallback 也是"25 岁高能女生",导致「帮我拍一条」几乎每次都出年轻人,而且服装容易被 AI 玩夸张(oversize 卫衣/时髦…),脸也是典型 AI 塑料感。用户要:

1. 年龄要真正随机 —— 年轻/中年/老年都有机会
2. 支持一家三口、情侣同框(不只单人)
3. 品类合理匹配年龄段(瓷器→老人、玩具→年轻),其他品类各年龄段都可以
4. 外观"普通人"化,不要奇装异服
5. **面部纹理真实自然,不要 AI 塑料感,让人看不出是 AI 做的**

---

## 方案

只改一个文件:`supabase/functions/_shared/persona-generator.ts`。不动调用方、DB、前端。

### 1. 调用 AI 前先随机抽「年龄段 + 组合形式」

新增 `pickPersonaSlot(assetTags, assetCategories)` → `{ ageBucket, groupType }`,按品类给权重:

| 品类关键字 | young | middle | senior |
| --- | --- | --- | --- |
| 瓷器 / 古董 / 文玩 / 字画 / 旗袍 / 茶器 / 老物件 | 5 | 30 | **65** |
| 玩具 / 潮玩 / 盲盒 / 谷子 / 动漫 / 二次元 | **65** | 25 | 10 |
| 母婴 / 亲子 / 绘本 / 童装 | 25 | **60** | 15 |
| 美妆 / 首饰 / 包包 / 穿搭 / 潮牌 / 球鞋 | **60** | 30 | 10 |
| 家居 / 咖啡器具 / 原木 / 北欧 | 35 | **50** | 15 |
| 户外 / 运动 / 装备 / 工具 | 25 | **55** | 20 |
| 食品 / 餐饮 / 烘焙 / 小吃 | 40 | 40 | 20 |
| **默认** | **40** | **35** | **25** |

年龄:young 18-32 / middle 35-52 / senior 58-72,区间内再随机一岁。

groupType 独立抽:solo 65% / couple 20% / family 15%(命中亲子/母婴品类时 family 提到 45%)。

### 2. 把抽中的槽位硬塞进 AI prompt

改写 sys/usr:预先声明"角色档案槽位已抽好,禁止改年龄/组合"。品类只影响气质/口头禅,不再规定性别年龄。删掉所有"25 岁 / 年轻女生 / 时髦帅哥"硬指引。

### 3. 外观 · 真实感 · 反 AI 感硬约束(prompt 原文)

在 sys 里加下面这段(会同时影响 `visual` 字段的写法,和后续 Seedance 渲染时 `formatPersonaDirective` 拼进去的英文约束):

```
【外观 · 硬约束】
- 都要写成"街上真能看到的普通人":合身日常穿搭(T 恤、衬衫、针织、外套、牛仔裤、休闲裙、旗袍等),中性/低饱和配色。
- 严禁:cosplay、二次元造型、夸张假发、亮片、荧光色、汉服写真、舞台服、艺术家浮夸装扮、oversize 到滑稽。
- senior 必须像真正的中老年人:自然银发或花白发,眼角/额头有真实细纹,颈部与手部有年龄痕迹,体态自然不僵。禁止"少女感奶奶"。
- couple/family:各自单独写外观,风格互相协调(不要一个潮牌一个正装)。

【面部质感 · 反 AI 感硬约束】(全部人物都必须满足,写进 visual 字段末尾)
- 皮肤要有真实肌理:可见毛孔、细小绒毛、皮脂反光不均匀、局部小瑕疵(斑点/痘印/晒纹/唇纹)。
- 眼睛要有真实高光和虹膜纹理,眼白略带血丝,不完全对称。
- 头发要有碎发、飞毛、发根颜色深浅过渡,不是一体成型的假发。
- 光线是自然商场/室内混合光,略带阴影,不是柔化磨皮打光。
- 严禁:磨皮塑料感、糖水片美颜、瞳孔完全对称、CGI 般光滑肌肤、无毛孔陶瓷脸、双胞胎脸、AI 通用美女/帅哥脸模、身体比例失真。
```

### 4. `formatPersonaDirective`(英文,Seedance 用)追加真实感锁

```
Photorealistic real human, documentary-style handheld footage, natural imperfect skin with visible pores, fine facial hair, subtle blemishes, uneven skin tone, natural under-eye shadow, realistic hair with flyaways and darker roots, real iris texture with catchlights, indoor mall mixed lighting with soft ambient shadows. Absolutely NOT: airbrushed, plastic skin, poreless CGI face, symmetric AI beauty face, doll-like eyes, over-smoothed, over-lit beauty-cam look, cartoon, anime, cosplay, stage costume. Must be indistinguishable from a real phone-shot vlog.
```

### 5. 类型扩展(向后兼容)

`InfluencerPersona` 新增可选字段:

```ts
group_type?: 'solo' | 'couple' | 'family';
companions?: Array<{ role: string; visual: string }>;
```

`formatPersonaDirective` / `formatPersonaBriefZh` 里,若非 solo,把同伴外观也拼进去,并加"每镜同 1-3 人固定出现,禁止换人"。

### 6. Fallback 池化

`FALLBACK_PERSONA` 从"25 岁女生"改成 4 人小池(年轻女生 / 中年男主理人 / 老克勒大叔 / 宝妈),AI 调不通时随机选一位,不再永远回到 25 岁女生。

---

## 不改的部分

- `surprise-marketing-video/index.ts` 接口不变
- `generate-marketing-video-script/index.ts`(character 字段结构兼容)
- Seedance 渲染流(通过 `formatPersonaDirective` 自动带入真实感锁)
- 前端 UI / 数据库
