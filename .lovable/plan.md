# BOOMER 禅意小水獭融入方案

把现有的"中古小精灵"全套形象替换为用户上传的 BOOMER（禅意合十小水獭），并让他在多个关键场景"活起来"。

## 人设档案

**名字**：BOOMER（产品里统一露出英文大写 BOOMER；旁白/对话中自称"BOOMER"）  
**身份**：禅意小水獭，门店里的"修行型店员搭子"  
**语气**：慢悠悠、温柔、偶尔带一句轻量小哲理（"急不来的，我们一件一件鉴"／"心定了，眼自亮"）  
**禁忌**：不喊"主播"、不甩鸡汤长句，每句 ≤ 20 字

## 一、视觉资产（核心工作）

以上传图为唯一参考基底，统一画风（暖棕毛绒 + 米白胸腹 + 黑豆眼 + 粉色腮红），用 Nano Banana / Gemini Image 生成 8 张姿态：

| 文件 | 用途 |
|---|---|
| `boomer-idle.png` | 合十冥想（用户图原姿态，作为兜底）|
| `boomer-wave.png` | 睁眼挥手打招呼 |
| `boomer-think.png` | 歪头托腮思考（识别中）|
| `boomer-bow.png` | 双手合十微鞠躬（识别成功）|
| `boomer-scratch.png` | 抓头疑惑（识别失败/为空）|
| `boomer-cheer.png` | 双手举起撒花（升级/打卡）|
| `boomer-sleep.png` | 闭眼睡觉打 zzz（加载/空状态）|
| `boomer-peek.png` | 半身侧露偷看（登录页/引导）|

另外生成：
- `boomer-logo-mark.png`（圆形头像，用于聊天小头像）
- `boomer-splash.png`（登录页主视觉，含 BOOMER 字样）

## 二、代码改动

### 1) 资产与常量
- `src/assets/spirit/` 目录改为 `src/assets/boomer/`，新建 8 个姿态 PNG（透明背景）
- 旧的 `spirit-mascot-canonical.png` / `idle-anim.png` / `wave-anim.png` 保留备份但不再引用
- 更新 mem 中的 `spirit-mascot-canonical` 锁定规则 → 改为 `boomer-canonical`

### 2) `SpiritMascot.tsx` → 重写为 `BoomerMascot.tsx`
- 新增 state 类型：`idle | wave | thinking | bowing | scratching | cheering | sleeping | peeking | dragging | hover | alert`
- 每个 state 映射一张 PNG，不再用 APNG（性能更好，画风也更统一）
- 微动效保留：浮动 / hover 放大 / 拖拽倾斜 / alert 时头顶光晕脉冲
- 撒花/冥想等"动作型"姿态额外加一层 CSS 粒子（小樱花飘落）

### 3) 浮窗与抽屉（必做）
- `FloatingDashboard.tsx`：aria-label 改"召唤 BOOMER"；alert 状态用 `scratching`（带未读时挠头）
- `SpiritDrawer.tsx` / `SpiritChatPanel.tsx`：抽屉头部标题改"BOOMER · 你的禅意搭子"
- 聊天气泡小头像用 `boomer-logo-mark.png`
- `useSpiritChat` / `spirit-chat` edge function 的 system prompt 改 BOOMER 人设：自称 BOOMER、禅意短句、不喊主播

### 4) 识别过程动画（新做）
- `RecognitionProgress.tsx`：右上角加 BOOMER 小角色
  - 上传中 → `thinking`（歪头）
  - hash/name 命中 → `peeking`（笑着探头）
  - AI 调用中 → `thinking` + 思考气泡
  - 成功 → `bowing` + "鉴毕，请过目"
  - 失败 → `scratching` + "这件...我也拿不准"

### 5) 打卡 / 升级彩蛋
- `CheckInCard.tsx`：打卡成功时 BOOMER `cheering` 从卡片底部蹦出 1.5s 后回落（用 framer-motion 或纯 CSS keyframe）
- `LevelUpWatcher.tsx`：升级 toast 改成全屏覆盖层，BOOMER `cheering` + 撒花粒子 + "恭喜升至 Lv.N"

### 6) 登录页 & 空状态
- `AuthPage.tsx`：BOOMER-OFF logo 下方加 `boomer-peek.png`（半身侧探，呼应"hobby"调性）；保留"门店运营辅助系统"标题
- 空列表（History / Community / Tasks / Notifications 等通用 EmptyState 组件）：BOOMER `sleeping` + 文案"BOOMER 在打盹...这里还空着"
- `NotFound.tsx`：BOOMER `scratching` + "BOOMER 也找不到这个页面"

### 7) PWA / 启动
- `public/manifest.json` 的 `theme_color` 改粉米 `#F8D7D5`（与 BOOMER 主色呼应）
- `public/icon-192.png` / `icon-512.png` 用 `boomer-logo-mark` 重新导出（圆形头）

## 三、文案触达

`spirit-chat` edge function 的 system prompt 关键改动：
```
你是 BOOMER，一只在中古门店打坐修行的小水獭。
- 自称 BOOMER（不要说"我是 AI"或"小精灵"）
- 语气温柔慢悠悠，每句 ≤ 20 字
- 偶尔甩一句轻量禅句："急不来的"/"心定眼自亮"
- 称呼用户"店员"或"你"，绝不用"主播"
- 帮店员处理：商品鉴定建议、排班、知识、闲聊
```

## 四、记忆更新

- 移除 `mem://design/spirit-mascot-canonical`
- 新增 `mem://design/boomer-canonical`：锁定 BOOMER 形象 + 8 张姿态映射 + 严禁凭空重画
- 更新 `mem://features/floating-dashboard`：mascot 名 BOOMER
- 更新 Core：把"中古小精灵"统一改为"BOOMER"

## 实施顺序

1. 先生成 8 张姿态 PNG（最耗时，先开工）
2. 重写 `BoomerMascot` 组件 + 替换浮窗/抽屉所有引用
3. 改 `spirit-chat` system prompt
4. 注入识别进度 / 打卡 / 升级 / 登录页 / 空状态
5. 更新 PWA icon + manifest 主题色
6. 更新记忆文件
7. 旧资产保留备份，不删除（用户随时可回滚）

---

确认这个方向后我开干。是否要调整人设语气、姿态清单或场景优先级？
