## 优化两个相似按钮的文案与图标

### 改动 `src/components/dashboard/LiveStreamPanel.tsx`

**1. 第 9 行 import** — 添加 `RotateCcw` 图标
```
Camera, Upload, X, Loader2, Sparkles, Trash2, Edit, SwitchCamera, BookmarkPlus, Check, Layers, Image as ImageIcon, RotateCcw,
```

**2. 第 657-658 行**（拍完未识别时显示）
- 图标：`Camera` → `RotateCcw`（旋转/重做语义）
- 文案：`继续拍摄` → `重拍这一张`

**3. 第 686-687 行**（识别完成后吸顶按钮）
- 图标保持 `Camera`
- 文案：`继续拍摄下一件商品` → `识别下一件商品`（强调"识别"动作，区别于上面那个"重拍"）

效果：
- 重拍这一张（白底 + 旋转图标）：当前照片不满意，重新拍
- 识别下一件商品（渐变色 + 相机图标）：完成本次，开始下一轮