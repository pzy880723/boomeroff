## 删除小精灵的随机说话气泡

用户指的是悬浮小精灵（FloatingDashboard）旁边每隔 30 秒冒出来的那种心情气泡（"记得抬头看一眼天哦" 之类）。完全去掉，不再说话。

### 改动文件

**`src/components/dashboard/FloatingDashboard.tsx`**
- 删除 `import { randomMood } from '../spirit/spiritMoods'`
- 删除 `labelText` / `setLabelText` state 以及 `labelTimerRef`
- 删除两个相关的 `useEffect`（一个 4.5s 自动消失，一个 30s 触发 `randomMood()`）
- 删除底部 JSX 中 `{labelText && !dragging && (...气泡 div...)}` 整块
- 删除 `bubbleSide` / `bubbleStyle` 这两个只为气泡服务的局部变量

**`src/components/spirit/spiritMoods.ts`**
- 整个文件删除（已无引用；`IDLE_ACTIONS` 也未被其它地方 import，一并清掉）

### 不动的地方
- `SpiritGreetingDialog`（首次进入的大问候弹窗）保持不变 —— 它是显式的引导弹窗，不是"碎碎念"
- 小精灵其它动画（漂浮、挥手、提示点）保持不变
