## 修复 + 动作设计方案

### 1. 修复脚下白色色块
当前 `src/assets/spirit-mascot.png` 底部有一个白色矩形（AI 生成时残留的"展示底座"）。两步处理：

- 用 `imagegen--edit_image` 重新出图：保留小精灵主体，去掉脚下白底/影子方块，输出真正透明背景的 PNG（"remove the white pedestal/box under the feet, fully transparent background, keep the character identical"）。
- QA：本地把 PNG 渲到棕色/深色背景上自检一遍，确认无白边、无残底，再覆盖原文件。

### 2. 动作系统设计（纯前端，不动业务逻辑）

把单一 `idle / talking / alert` 升级为一套"会做小动作"的状态机：

**基础常驻动作**（无操作时随机循环，每 4-8s 触发一个）
- `float`：上下浮 6px（已有，调更柔）
- `blink`：眨眼（已有）
- `breathe`：整体 scale 1 → 1.03 → 1（呼吸感）
- `sway`：左右轻摆 ±2°

**小彩蛋动作**（idle 时随机抽一个播放，每个 ~1.2s）
- `wave`：右手挥手（整体 rotate + 轻微 translateX）
- `peek`：探头，头部短暂前倾 + 放大
- `spin`：原地转 360°（罕见，~5% 概率）
- `nod`：点头同意
- `shake`：左右小摇头
- `jump`：开心小跳 + 落地压扁回弹

**交互触发动作**
- hover：`bounce`（轻跳一下 + 光晕加亮）
- 点击打开抽屉：`spin` + sparkle 加密
- 拖动：`wiggle` 持续摆动
- `talking`（AI 回复中）：嘴部区域上下抖 + 头部小幅点动（替换现在过于机械的整体抖）
- `thinking`（等待首 token）：头顶冒 3 个小点 "…" 渐显
- `alert`（有未读/提醒）：耳朵抖 + 头顶 ✦ 闪烁加快
- 新消息到达：`jump` + 临时气泡 "有新消息哦～"

**情绪气泡**（每天首次出现 / 长时间无操作）
随机轮播：「今天也辛苦啦～」「要不要喝口水？」「你最棒了 ✨」「来摸摸我？」点击精灵触发情绪鼓励气泡（不调用 AI，纯本地文案池）。

### 3. 技术实现

**CSS**（`src/index.css` 追加 keyframes）
```text
spirit-breathe / spirit-sway / spirit-wave / spirit-peek
spirit-spin / spirit-nod / spirit-shake / spirit-jump
spirit-bounce / spirit-wiggle / spirit-thinking-dots
```
所有动画都尊重 `prefers-reduced-motion`。

**组件**（重写 `src/components/spirit/SpiritMascot.tsx`）
- 扩展 `SpiritState`：`'idle' | 'talking' | 'thinking' | 'alert' | 'hover' | 'dragging'`
- 内部新增 `actionRef`：idle 时用 `setInterval` 每 5-8s 随机挑一个彩蛋动作，给主体 div 临时加 class，动画结束移除。
- 多层叠加：外层 `sway` + 中层 `breathe` + 内层 action class，互不干扰。
- talking 状态：嘴部 mask 区单独抖动（绝对定位一个透明 div，仅播 mouth 动画），不让整体抖。
- thinking 状态：头顶渲染 3 个 `<span>` 点，按 0/200/400ms 错峰淡入。
- 新增 `<SpiritBubble>`：小气泡，自动 3s 后消失；情绪文案池放 `src/components/spirit/spiritMoods.ts`。

**接入点**
- `FloatingDashboard.tsx`：把 mascot 包一层 `onMouseEnter→hover`、`onClick→spin+open`、拖动时 `dragging`。
- `useSpiritChat.ts`：streaming 中 → `talking`；等待首 token → `thinking`。
- 抽屉关闭后 30s 无操作 → 触发一次情绪气泡。

### 4. 验收
- 不同尺寸（28/40/56/72）下精灵无白底、无裁切
- idle 一分钟内能看到至少 2 种不同小动作
- talking / thinking 状态视觉可区分
- 点击精灵能看到情绪气泡
- 开启系统"减少动态效果"后所有动画停止

不涉及后端、数据库、edge function 变动。