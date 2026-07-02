## 问题
Me 页底部 BOOMER GO 品牌区（logo + 文字 + 版本号）显示为"褪色红"，不是纯正红色。

## 原因
`src/pages/Me.tsx` L280 外层 `<div>` 加了 `opacity-80`，整块被降到 80% 透明度，红色和白底混色后变淡。

## 修复
去掉该容器的 `opacity-80`，让 logo 显示原图正红色。

若仍希望下方文字（「BOOMER GO」/「门店运营系统 · v0.2.0」）保持稍弱视觉层级，则单独给文字节点加 `text-muted-foreground`，不要压 logo。

改动仅一处：`src/pages/Me.tsx` L280。