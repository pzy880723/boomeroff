## 一、站点标题与文案(`index.html`)

把 `index.html` 改成**中性品牌主标 + 一句覆盖店员/顾客两端的介绍**,这样 /scan(店员)、/u(顾客)被任何 App 转发时,默认抓到的卡片都不再是"中古商品知识系统"那种偏内部的旧名,而是品牌主导的统一外观。店员端进 `MainLayout` 后已有 `<Helmet>` 覆盖成"门店运营辅助系统"内部名,**顾客端 /u 不再覆盖,直接吃 index.html 的中性品牌文案**——这就是用户希望的效果。

### 改动文案(`index.html`)

```html
<title>中古杂货辅助系统｜BOOMER·OFF vintage</title>
<meta name="description"
  content="BOOMER·OFF vintage 出品的中古杂货智能系统：拍一张照,1-3 秒读懂它的名字、年代与故事。" />

<meta property="og:title" content="中古杂货智能系统｜BOOMER·OFF vintage" />
<meta property="og:description"
  content="对准任何中古杂货拍一张,AI 在 1-3 秒内告诉你它的名字、年代与背后的故事。" />
<meta property="og:url" content="https://boomeroff.lovable.app/" />

<meta name="apple-mobile-web-app-title" content="BOOMER·OFF" />
```

> 说明:
>
> - 主标用全角竖线「｜」分隔,符合中文排版习惯。
> - description 同时点到"顾客拍一拍"与"店员日常",对外不暴露内部细节。
> - og:url 改回根域,因为这一份卡片同时给 / 与 /u 用。
> - apple-mobile-web-app-title(添加到主屏幕的图标名)从「门店助手」改为品牌「BOOMER·OFF」,顾客装到桌面更体面。

`MainLayout.tsx` 内已有的店员端 `<Helmet>` 保留不变(店员端 App 内部依旧叫"门店运营辅助系统"),只影响登录后被 JS 爬虫读取的店员端页面,不会污染分享卡片。

---

## 二、识别等待:从"倒计时"改为"叙事式步骤"

现状(`CameraStage.tsx` 行 375–391):识别遮罩只有一个 `Loader2` + 一行"AI 识别中"+ 一个大号 `1.4s` 倒计时。3 秒以上很容易让人焦虑。

新版思路:**让用户始终知道机器在做什么**,即使是"乐观叙事"(后端实际只是一次 AI 调用)。

### 文案脚本(按耗时分段切换)

单张快拍(典型 1-3s):

```text
[01]  正在解析图片细节            0.0–0.8s
[02]  正在比对商品知识库          0.8–1.6s
[03]  正在全网检索同款资料        1.6–2.6s
[04]  正在整理年代 · 产地 · 故事  2.6s 起持续呼吸,直到结果回来
```

多角度合并(典型 3-6s,文案动态带上张数 N):

```text
[01]  正在对齐 N 张图像           0.0–0.7s
[02]  正在解析每张图的关键特征    0.7–1.6s
[03]  正在比对商品知识库          1.6–2.6s
[04]  正在全网检索同款资料        2.6–3.8s
[05]  正在整理年代 · 产地 · 故事  3.8s 起呼吸到结果回来
```

边界处理:

- **真实识别比脚本快**(命中缓存 0.3s 就回):识别成功瞬间把所有步骤一次性标为完成,显示 ~250ms"全部 ✓"再隐藏遮罩,不会"卡在第 2 步突然消失"。
- **真实识别比脚本慢**:最后一步原地呼吸(尾部 `···` 闪烁),不会自己跳完进入"假装结束"。

### 视觉

替换 `isRecognizing` 遮罩为一个步骤列表:

```text
┌─────────────────────────────┐
│   ◐  AI 正在识别             │   ← 顶部小行:小转圈 + 标题
│                              │
│   ✓  正在解析图片细节         │   ← 已完成:对勾 + 文字 60% 亮度
│   ✓  正在比对商品知识库       │
│   ◐  正在全网检索同款资料 ··· │   ← 当前:小转圈 + 末尾闪烁省略号
│   ○  正在整理年代 · 产地      │   ← 未到:空心点 + 文字 30% 透明
│                              │
│              1.4s             │   ← 计时缩为辅助信息,放底部
└─────────────────────────────┘
```

- 颜色用现有 token:已完成 `text-accent`,当前 `text-white` 微 glow,未到 `text-white/35`。
- 步骤切换 200ms 渐显;对勾出现配 `scale 0.6→1` 微弹跳。
- 计时数字从 `text-3xl` 降到 `text-xs text-white/50`,只作辅助。
- 顶部 spinner 从 `w-16` 降到 `w-5`。

### 实现要点(技术段,可跳过)

仅改 `src/components/recognition/CameraStage.tsx`,纯展示层:

- 新增本地常量 `SINGLE_STEPS` / `MULTI_STEPS`,每项 `{ label, at }`(`at` 为该步开始毫秒数)。多角度的第一步 label 用 `${images.length} 张图像`。
- `runRecognize` 已经在跑 `requestAnimationFrame` 更新 `elapsedTime`,直接派生 `currentStepIndex = steps.findLastIndex(s => elapsedTime >= s.at)`,不增加新的定时器。
- `finally` 块识别成功后:`setCurrentStepIndex(steps.length)` → `setTimeout(() => setIsRecognizing(false), 250)`。
- 不动后端、不动调用流程、不动现有计时,只重写遮罩 JSX。

### 影响范围

`CameraStage` 同时被顾客版 `/u`(`PublicScan`)和店员版相关页面复用。改动是纯展示层,默认两端同步生效——店员端也会获得更舒服的等待体验,与"识别要快"并不冲突。如果只想让 /u 启用,告诉我即可加一个 `narrative?: boolean` prop。

---

## 改动文件清单

- `index.html` — 改 title / description / og:* / apple-mobile-web-app-title
- `src/components/recognition/CameraStage.tsx` — 重写 `isRecognizing` 遮罩,加步骤状态机