## 游客版首次引导：分步气泡 Coachmark

在 `/u`（PublicScan）页面叠加一层轻量的引导：依次高亮三个真实区域，配气泡说明 + 「下一步 / 跳过」按钮，最后一步是「我知道了」。每次进入 `/u` 都展示，用户可随时跳过。

### 引导步骤

1. **拍照按钮**（CameraStage 内的快门）
   - 标题：对准它，按下快门
   - 说明：让物件占满画面 2/3，AI 1-3 秒告诉你它是什么
2. **底部「中古圈」tab**
   - 标题：逛逛中古圈
   - 说明：识别完可以匿名分享，看看别人都淘到了什么
3. **顶部 Logo / 关于**（指向 header 区域或「关于」tab）
   - 标题：来自 BOOMER-OFF
   - 说明：一家专注日本中古杂货的小店，欢迎到店逛逛
   - 按钮文案：开始体验

### 交互细节

- 进入 `/u` 后延迟 ~400ms 出现遮罩，避免与首屏渲染抢资源
- 半透明遮罩 + 高亮区域「打孔」：用绝对定位的 4 块 `bg-black/55` 拼出目标矩形周围的暗区，目标区本身保持原样可见（也响应点击直接触发）
- 气泡：紧贴高亮区，显示步骤指示「1 / 3」、标题、说明、`跳过` `下一步` 两个按钮；最后一步右键是「我知道了」
- 进入下一步时 100ms 淡入；ESC 或点击遮罩外不关闭，必须点按钮（避免误关）
- 若窗口尺寸变化（旋转屏幕）重新测量目标位置
- 完全不写 localStorage —— 每次进入都展示（按用户选择）

### 技术方案

- 新建 `src/components/public/GuestOnboarding.tsx`：
  - props: `steps: { targetId: string; title: string; desc: string }[]`，`onDone: () => void`
  - 内部用 `useState(stepIndex)`，`useLayoutEffect` 通过 `document.getElementById(targetId).getBoundingClientRect()` 计算高亮位置
  - 监听 `resize` / `scroll` 重新测量
  - 使用 portal（`createPortal` to `document.body`）渲染遮罩层，`z-50`，置于 PublicLayout 的 nav 之上
- 给被引导元素加 `id`：
  - CameraStage 的快门按钮：`id="onboard-shutter"`（需查看并最小改动 `CameraStage.tsx`）
  - PublicLayout 的「中古圈」NavLink：`id="onboard-community-tab"`
  - PublicLayout 的 logo 链接：`id="onboard-logo"`
- 在 `PublicScan.tsx` 顶部：
  ```ts
  const [showOnboarding, setShowOnboarding] = useState(true);
  ```
  渲染 `{showOnboarding && <GuestOnboarding steps={...} onDone={() => setShowOnboarding(false)} />}`
- 全部使用 design tokens（`bg-background`, `text-foreground`, `bg-primary` 等），不硬编码颜色

### 不在范围内

- 不动登录版（Scan/MainLayout）
- 不修改识别逻辑、edge function、数据表
- 不引入新依赖（不用 react-joyride 等）
