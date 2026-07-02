## AI 撰稿弹窗改造

### 1. 弹窗改为全屏
- `Notifications.tsx` 中的撰稿 `Dialog` 改为全屏样式：`max-w-none w-screen h-[100dvh] rounded-none p-0 gap-0`，内部用 flex 列布局（顶栏 / 内容 / 底部输入）。
- 顶栏、内容区、底部输入分别固定高度或自适应，聊天/预览区可滚动。

### 2. 关闭按钮与预览切换不再重叠
- 自定义顶栏结构：左侧标题「AI 撰稿」，中间放 Chat/预览的分段切换（Tabs），右侧留出关闭按钮位置。
- 隐藏 `DialogContent` 内置右上角关闭按钮（加一个 `[&>button.absolute]:hidden` 之类的 class），改用我们自己放在顶栏右侧的关闭按钮，保证与 Tabs 不重叠。

### 3. 底部输入框占位文字精简
- 现在的 placeholder 过长导致换行看不见。改成短句，例如：`发一条通知…`（默认）/ `继续告诉我细节…`（追问态）。
- 输入框 `min-h` 保持 2 行左右，避免文本被顶出视野。

### 4. 回车换行 / 点击发送才提交
- 移除 textarea 上的 `Enter 提交、Shift+Enter 换行` 逻辑，改为：Enter 一律换行（不拦截），只有点击右侧「发送」按钮才触发 `sendToAI`。
- 移动端体验一致（避免误触发送）。

### 保持不变
- `compose-notification` edge function、AI 直接出稿逻辑、版本历史、模板 chips、Banner 生成、发布流程、Markdown 渲染均不动。

### 技术细节
- 文件：仅改 `src/pages/Notifications.tsx`。
- Dialog 结构示意：
  ```text
  DialogContent (fullscreen)
   ├─ Header 行: [标题] [Tabs: 对话/预览] [X 关闭]
   ├─ Body: 对话流 或 预览（根据 Tab）
   └─ Footer: [textarea placeholder="发一条通知…"] [发送按钮]
  ```
