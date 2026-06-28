## 目标

修两件事(都在「一键智能广告图」`ai-smart-ad-images` 里):

1. **场景图/人物图必须符合商场 B1 开放式店面物理约束** —— 复用视频那套 `storefront-constraints.ts`,禁止出现门框/卷帘门/玻璃门/街边/推门。
2. **出图要有电影艺术感** —— 不要"普通人随手拍"的纪实感,要让人一眼觉得"这是专业团队拍的大片"。

---

## 一、门店物理约束:跟视频对齐

当前 `ai-smart-ad-images/index.ts` 虽然 import 了 `STOREFRONT_CONSTRAINT_ZH`,但:
- 只在 `scene`/`person` 里塞了 ZH 一段,**没有塞英文硬约束 + 负向词**(Gemini 对英文 NEGATIVE 词更敏感)。
- 商品特写(`product`)没塞 —— 如果参考图带店面背景,模型会自由发挥成街边店。
- 没有"开场镜头"那种位置硬指令(因为是单图,不需要),但需要补充"画面里如果出现店面,必须是商场走廊视角 + 开放式无门"。

改动 `supabase/functions/ai-smart-ad-images/index.ts` 的 `buildPrompt`:

- 三种类型**全部注入** `STOREFRONT_CONSTRAINT_ZH` + `STOREFRONT_CONSTRAINT_EN`。
- 末尾的"严禁"列表追加英文负向词:`door frame, glass door, door handle, roll-up shutter, door curtain, street view, sidewalk, road, traffic, outdoor sky, push door, pull door, store entrance with door, shop front gate`。
- 场景图/人物图额外加一句:"如果画面出现店面,必须呈现商场 B1 室内走廊视角看向 8 米宽开放式店面,顶部门楣有 logo 灯箱,**不能出现任何门框/玻璃门/卷帘门/门把手/门帘**;背景必须是商场走廊/中庭/对面商铺/商场天花板灯,不能是街道/人行道/户外天空。"
- 商品特写补一句:"若背景隐约可见店面环境,必须是商场室内开放式店面,无门、无门框。"

不动 video 流程(已有约束)。

---

## 二、电影艺术感升级

当前 `buildPrompt` 的 photoreal 分支偏"真实纪实"(35mm f/2.0 ISO 400 + 自然光 + "无滤镜无调色"),效果就是"店员手机随手拍升级版"。用户要的是"艺术品级"。

把 `buildPrompt` 改造成**三档可选** + **默认升档**:

### 1. 新增「电影感强度」隐式提升
photoreal 不再是单一档,而是默认走 **"cinematic-pro"** 档:
- 器材:`Arri Alexa Mini LF / RED Komodo, anamorphic lens 40mm T2.0, 1.5x squeeze, subtle lens flare, organic film grain`(电影机 + 变形宽银幕)
- 光线:`motivated three-point lighting, rim light separating subject from background, soft key from window/practical lamps, deep shadows with detail retention, Rembrandt or split lighting on faces, golden hour or blue hour color temperature when appropriate`
- 色彩:`teal-and-orange cinematic color grade (subtle, not Instagram), high dynamic range, rich shadow detail, filmic highlight roll-off`(取消之前"无滤镜无调色"的硬规则 —— 那条让画面寡淡)
- 构图:`rule of thirds, leading lines, foreground bokeh elements, layered depth (foreground / midground / background), shallow depth of field f/1.4-f/2.0, intentional negative space`
- 氛围:`atmospheric haze, dust particles in light beam, practical light sources visible in frame (neon sign / shelf LED / pendant lamp), reflections on glossy surfaces`
- 后期:`shot on film emulation (Kodak Portra 400 / Fuji 400H look), subtle halation around highlights, cinematic letterbox-friendly framing`

### 2. 三种类型差异化电影手法

- **场景图**:Wes Anderson 式对称构图 / Roger Deakins 式自然光大场景 二选一(随机),强调货架灯带、商品反光、暖色卤素灯 vs 冷色顶灯的色温对比。
- **商品特写**:静物广告大片(Apple keynote / 无印良品 lookbook 质感),硬光 + 柔光混合,商品边缘有 rim light,背景虚化成柔和色块,可加一缕侧逆光打出体积感。
- **人物图**:电影剧照感(《花样年华》/《重庆森林》/《一一》参考),人物不直视镜头,有"被偶遇"的故事感;面部一定要有 motivated light(从货架灯/窗外/招牌透出),禁止平光证件照。

### 3. 风格 chip 仍然生效
现有 `VIDEO_STYLE_LABELS` 继续作为"情绪基调"叠加在 cinematic-pro 之上(治愈 = 暖色低饱和 + 柔光;高级 = 冷色高对比 + 硬光;活力 = 高饱和 + 动感虚化),不再被 cinematic-pro 完全覆盖。

### 4. 负向词补充
追加:`amateur snapshot, phone photo, flat lighting, harsh on-camera flash, oversharpened, HDR halo, Instagram filter preset, washed out, overexposed sky, plastic AI skin, uncanny face, generic stock photo aesthetic`。

### 5. stylized 档同步升级
stylized 分支也升级为"电影海报级"(Mondo poster / Criterion Collection cover 质感),不再只是"略带插画"。

---

## 三、技术细节

只改一个文件:`supabase/functions/ai-smart-ad-images/index.ts`

- `buildPrompt(opts)` 整段重写,拆出内部 `buildCinematicBase()` / `buildSceneDirective()` / `buildProductDirective()` / `buildPersonDirective()` 几个小函数,便于后续调。
- 中英文双语注入(中文给 Gemini 理解品牌/品类,英文给 Gemini 锁电影术语和负向词)。
- 不改前端、不改对话框、不改额度、不改入库逻辑。

---

## 不做

- 不动「分镜静帧」(`storyboard-marketing-video`) —— 视频流程暂时保持不变。
- 不加新 UI 开关(电影感是默认行为,不让用户选档,避免选择困难)。
- 不改模型(继续 `google/gemini-3.1-flash-image-preview`)。
