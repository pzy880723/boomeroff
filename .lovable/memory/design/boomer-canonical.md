---
name: BOOMER canonical
description: BOOMER 形象 + 8 姿态资产 + 严禁凭描述重画的规则
type: design
---

BOOMER = 禅意小水獭。形象资产锁定在 `src/assets/boomer/`,**全部为透明背景 PNG,只有水獭本体,不带 BOOMER-OFF logo / 粉色方块底 / 文字 / 装饰边框**。

姿态清单 (state → file):
- `idle` → boomer-idle.png — 闭眼合十盘坐冥想
- `wave` (= talking/hover) → boomer-wave.png — 站姿挥手,睁眼笑
- `think` (= thinking) → boomer-think.png — 一爪托腮歪头,眼睛半睁
- `bow` → boomer-bow.png — 深鞠躬,双爪合十前伸
- `scratch` (= alert) → boomer-scratch.png — 一爪挠头,困惑张嘴
- `cheer` → boomer-cheer.png — 双爪举高,张嘴笑
- `sleep` → boomer-sleep.png — 侧躺蜷睡,Z 泡泡
- `avatar` → boomer-avatar.png — 正脸大头照,聊天小头像专用

规则:
- 禁止凭描述从零生成。需要新姿态时必须用 `imagegen--edit_image` 以 `boomer-idle.png` 为视觉锚,锁定五官比例 / 毛色 / 白肚 / 粉腮 / 黑豆眼。
- 任何新姿态必须 `transparent_background: true`,且 prompt 中明确 "no text, no logo, no background, no frame, isolated subject only"。
- 旧名"中古小精灵"已弃用,UI 文案与品牌均使用 "BOOMER"(全大写)。
- 组件 `SpiritMascot` 仅做 state → image 映射 + 浮动/弹跳/思考三连点/闪光星动画,不要把背景色块加回素材里。
