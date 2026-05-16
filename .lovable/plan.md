## 目标
1. 让小精灵真正"动起来"（角色有肢体动作），而不是整张图缩放跳动
2. 修复点开抽屉里仪表盘 Tab 加载不出来的问题

## 一、验证阶段：先做 2 段透明 WebM 动画

### 资产生成
以 `src/assets/spirit-mascot-canonical.png` 作为首帧，用 `videogen--generate_video` 各出 1 段 5s 1080p 视频：

1. **idle-float.mp4** —— 默认漂浮 + 呼吸 + 偶尔眨眼 + 围巾末端轻飘
   - prompt: "Chibi watercolor mascot in bowler hat gently floating, soft breathing, scarf end swaying, occasional blink. Static background, character stays centered, no camera movement."
2. **wave.mp4** —— 抬手挥手打招呼
   - prompt: "Same chibi mascot raises right hand and waves cheerfully, head tilts slightly, smile, scarf sways. Character centered, no camera movement."

均使用 `camera_fixed: true`、`starting_frame` 锁形象。

### 转码为透明循环 WebM
用 ffmpeg：
- 自动去白底 → alpha 通道（`colorkey=white:0.15:0.05`，必要时叠加 `geq` 羽化）
- 输出 VP9 alpha + opus 静音，循环友好（首尾交叉淡入，避免跳帧）
- 目标 < 400KB/段
- 路径：`src/assets/spirit/idle-float.webm`、`src/assets/spirit/wave.webm`
- 同时输出 GIF 兜底（可选，先不做）

### 前端接入 `SpiritMascot.tsx`
- 把当前的 `<img>` 换成 `<video autoplay loop muted playsinline preload="auto">`
- 保留外层 CSS `spirit-float`/`spirit-sway` 整体轻晃（叠加效果而非替代）
- 根据 state 切 src：`idle` → idle-float.webm，hover/click 触发 → wave.webm 播一次后回 idle
- 加载失败 fallback 回 canonical PNG
- 拖拽态、thinking 态先沿用现有 CSS 动画，等验证 OK 再补齐 4 段

## 二、修复仪表盘加载报错

`useTasks` 在 `FloatingDashboard`（角标用）和 `DashboardInner`（面板用）各实例化一次，两者订阅同一个 Supabase Realtime channel `exp-pending-${user.id}`，第二次 subscribe 静默失败导致面板数据拉不出来。

修复：在 `src/hooks/useTasks.ts` 里把 channel 名加随机后缀
```ts
const channel = supabase.channel(`exp-pending-${user.id}-${crypto.randomUUID()}`)
```

顺手 grep 一遍 `useNotifications` 和其他 hook，确认没有同名 channel 冲突；如有，同样处理。

## 三、验证
- 浏览器预览：打开浮窗 → 看小精灵是否真在挥手/漂浮（而非整图缩放）
- 点抽屉里的"仪表盘"Tab → 4 个子 Tab 应能正常加载
- console 无 "channel already subscribed" 类报错

## 后续（本轮不做，验证通过后再做）
- 补齐 nod / jump / camera-shoot / talk 4 段
- 加预加载、状态机 transition、点击彩蛋随机播放

## 技术细节
- 视频文件放 `src/assets/spirit/`，ES6 import 即可
- WebM VP9 alpha 在 Chrome/Edge/Firefox/Safari 16+ 全支持；老 Safari fallback 到 PNG
- 视频元素需 `muted` 才能 autoplay；`playsinline` 防止 iOS 全屏
