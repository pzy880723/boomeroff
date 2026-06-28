## 目标
把 AI 图片(`ai-smart-ad-images`)的生成风格统一到分镜头静帧(`storyboard-marketing-video` photoreal)那套"纪实 + 实景忠诚 + 无滤镜"的观感,消除目前 AI 图片"电影广告大片"的夸张感。

## 现状对比(已和你讲清,见上方对话)
- **分镜头静帧**:"真实店内自然光、白平衡准确、无滤镜、无暖黄/橙调色、严格参考实景照不要美化"。
- **AI 图片**:"电影艺术大片级、Arri Alexa + 变形宽银幕、三点布光 + Rembrandt 阴影、teal-and-orange 调色、Wes Anderson / 王家卫 导演池、烟雾粒子、只能在光影构图上做电影化升级"。
- 这就是 AI 图片显得夸张的根因 —— prompt 本身在主动要求戏剧化。

## 实施方案(选项 A:最小改动)

### 1. 在 `ai-smart-ad-images/index.ts` 增加 `style_grade` 参数
- 类型:`'documentary' | 'cinematic'`,默认 `'documentary'`。
- 从 request body 读取,透传到 `buildPrompt`。

### 2. 重写 `buildPrompt` 的 photoreal 分支
- 当 `style_grade === 'documentary'`(新默认):
  - 删除 `buildCinematicBaseEn()` 调用(器材池/三点布光/teal-orange/烟雾粒子全部不要)。
  - 删除 `STYLE_MOOD_EN` overlay。
  - 删除场景图的 Wes Anderson / Deakins / 杜可风 导演池。
  - 删除人物图的 王家卫 / 杨德昌 / 是枝裕和 导演池。
  - 改用分镜头静帧 photoreal 同款基底:`真实店内自然光、白平衡准确、色彩还原真实、无滤镜、无暖黄/复古/橙调色`。
  - 把"参考图"那句改成分镜头同款强约束:`严格参考附带的实景照,颜色/陈列/光线还原实拍,不要美化、不要调色`。
  - 三类(scene/product/person)只保留一句话差异化描述,不再叠戏剧化光影词。
  - NEGATIVE 列表保留(门框/街道/AI 网红脸/塑料皮肤这些硬约束有用)。
- 当 `style_grade === 'cinematic'`:走现在这套(给少数想要海报感的场合留口子)。

### 3. 前端 `AiImage.tsx` 加风格切换
- 在比例 Popover 旁边新增小开关:`纪实风(默认) / 电影海报感`,对应传 `style_grade: 'documentary' | 'cinematic'`。
- `localStorage` 记住上次选择。

### 4. 不动的部分
- ❌ 不动 `storyboard-marketing-video`(你明确说过不要动分镜头 prompt)。
- ❌ 不动 stylized 分支(用户选画风时的逻辑独立)。
- ❌ 不动聚类挑图/批量调度/UI 主结构。

## 验证
- 在 AI 图片页用同一张参考图分别跑 documentary / cinematic 各出 1 张场景图、1 张商品图、1 张人物图,肉眼对比统一度。
- 默认 documentary 应该和分镜头静帧观感几乎一致。

## 风险
低 —— 这是 prompt 字符串重排,没碰数据库、没碰 API 协议,前端只新增一个开关。回滚就是把 `style_grade` 默认值改回 `'cinematic'`。