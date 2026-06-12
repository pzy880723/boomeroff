# 修复 BOOMER 形象：透明背景 + 真正不同的姿态

## 问题诊断

你看到的"方块悬浮"和"姿势图没在用",根因是同一个:

- `src/assets/boomer/boomer-*.png` 这 8 张图,全部都生成成了**带 BOOMER-OFF logo + 粉色方块背景**的完整海报(我已确认 `boomer-idle.png` 就是你截图里那张方块)。
- 代码上 `SpiritMascot.tsx` 已经按 8 种 state 映射到 8 个不同文件了 —— 但因为 8 个文件**图像内容其实差不多**(都是同一只合十冥想的小水獭+logo+粉底),所以你看不出"挠头/欢呼/睡觉/鞠躬"的区别,也没法当悬浮 IP 用 —— 一抠到圆形浮窗里就只剩"粉方块"。

也就是说:组件没问题,**素材本身错了**。

## 修复方案

### 1. 重新生成 8 张姿态图(透明背景)

以现有 `src/assets/boomer/boomer-idle.png` 为视觉锚点(锁定身体比例、毛色、眼睛、脸颊),用 `imagegen--edit_image` + `transparent_background: true` 重画 8 张,**每张只有水獭本体,没有 logo / 文字 / 粉色背景 / 方框**,导出为透明 PNG,覆盖原 8 个文件:

| 文件 | 姿态 | 关键差异 |
| --- | --- | --- |
| `boomer-idle.png` | 闭眼合十,盘坐冥想 | 当前姿态,但去掉 logo/背景 |
| `boomer-wave.png` | 睁眼,一只爪子举起挥手 | 招呼 |
| `boomer-think.png` | 一爪托腮,微微歪头,眼睛半睁 | 思考 |
| `boomer-bow.png` | 深鞠躬,双爪合十前伸 | 致谢 |
| `boomer-scratch.png` | 一爪挠头,表情困惑 | 找不到/出错 |
| `boomer-cheer.png` | 双爪举高,张嘴笑,小星星点缀 | 欢呼/打卡成功 |
| `boomer-sleep.png` | 侧躺/趴睡,闭眼,Z 泡泡 | 空状态/打盹 |
| `boomer-avatar.png` | 正脸大头照,微笑 | 聊天小头像 |

锁定描述(每张共享):*same warm brown otter, white belly, black bean eyes, pink cheeks, soft fluffy texture, simple cute illustration, isolated subject only, no text, no logo, no background, no frame, transparent PNG.*

### 2. 微调悬浮窗呈现

`FloatingDashboard.tsx` 的浮窗胶囊目前是 `rounded-full` 的圆按钮加 `SpiritMascot`。素材抠干净后:
- 去掉 `SpiritMascot` 内部那层 `radial-gradient` 圆形光晕(`flat` 模式),让水獭直接漂在按钮上,而不是"方块里的方块"。
- 浮窗按钮自身保留毛玻璃圆形底,只是不再叠两层背景。
- `SpiritGreetingDialog`(首次打招呼那个大图)继续显示透明大水獭 + 简单的 BOOMER 标题(标题用 CSS 文字,不再依赖素材里的 logo)。

### 3. 不动的部分

- `SpiritMascot.tsx` 状态→图片映射逻辑、动画(浮动/弹跳/思考三连点/闪光星)保持原样。
- `spirit-chat` edge function、人设系统提示、聊天 UI 都不动。
- 老的 `mem://design/boomer-canonical` 备忘录会同步更新到"8 张姿态已经是透明 PNG,严禁带 logo/背景"。

## 执行顺序

1. 用 edit_image 以 `boomer-idle.png` 为参考逐张重画 8 张姿态,`transparent_background: true`,覆盖到 `src/assets/boomer/`。
2. 调整 `SpiritMascot`(去掉默认那层粉色光晕,或减淡)+ `FloatingDashboard`(确认胶囊不再像方块套方块)。
3. 更新 `mem://design/boomer-canonical`:8 姿态 = 透明 PNG,带 logo/粉底的版本作废。
4. 视觉验收:截图浮窗 + 抽屉首屏,确认水獭"浮"在界面上,不再是粉色方块。

## 你需要确认的一件事

姿态清单上面那张表 OK 吗?或者你想加/换某些姿态(比如"翻笔记本""举价签""比心")?定了我就开干。
