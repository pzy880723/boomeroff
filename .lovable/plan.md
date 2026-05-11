# 顾客版 `/u` 拍照界面对齐店员版

## 问题
当前 `/u`（PublicScan）用的是早期的 `CameraCapture` 组件——4:3 比例的小卡片 + 普通「启动摄像头/上传图片」按钮。店员版 `/scan`（`LiveStreamPanel`）已经升级成专业相机 UI：方形大取景框、四角准星、白色快门键、前后置切换、单张/多角度切换、识别中遮罩 + 计时器等。

两者完全不一样，所以顾客打开 `/u` 看到的体验跟店员版差距很大。

## 方案

把 `PublicScan` 的取景区域改造成与 `LiveStreamPanel` 一比一的视觉与交互，但识别链路仍走顾客通道（`useGuestRecognition` → `recognize-product-public`，无需登录、无写库、有 IP 限频）。

### 1. 新建可复用的相机壳子

新建 `src/components/recognition/CameraStage.tsx`，把 `LiveStreamPanel` 里 lines 608-873 的纯相机 UI 抽成独立组件，对外暴露：
- props：`onRecognize(images: string[]): Promise<void>`、`isRecognizing: boolean`、`recognitionTime?: number`、`elapsedTime?: number`、`onRetry?: () => void`、`recognitionFailed?: boolean`
- 内部管理：`isStreaming` / `capturedImage` / `capturedImages` / `captureMode` / `facingMode` / 相机启停 / 压缩 / grabFrame / 文件上传

这个组件不依赖 `useAuth` / `useProductRecognition` / `supabase`，纯 UI + 媒体 API。

### 2. 店员版 `LiveStreamPanel` 接入新组件
把上述 lines 608-873 替换为 `<CameraStage onRecognize={handleRecognition} ... />`，业务逻辑（上传到 storage、insert products、enrich、收藏等）全部保留。识别完成后店员版仍展示 `ProductDetailCard`。

### 3. 顾客版 `PublicScan` 重写
- 顶部那张「拍一拍，AI 帮你认中古」渐变 banner 保留（带剩余次数提示）
- 把现在那张小相框换成 `<CameraStage />`，传入：
  - `onRecognize={async (imgs) => { const r = await recognize(imgs); if (r) { sessionStorage.setItem(...); navigate('/u/result'); } }}`
  - `isRecognizing` / `recognitionFailed` / `onRetry` 来自 `useGuestRecognition`
- 底部「拍摄小贴士」卡片保留
- 因为顾客版识别完直接跳 `/u/result`，CameraStage 在跳转前的「识别中」遮罩 + 计时器照常工作

### 4. `useGuestRecognition` 小补
为了支持失败重试，hook 增加：
- `lastInputRef` 记录上次入参
- `retry()` 方法
- `recognitionFailed` 状态 + `setRecognitionFailed`
- `elapsedTime` rAF 计时

这样 `CameraStage` 的失败遮罩、计时器在两端表现一致。

### 5. 不动的部分
- `recognize-product-public` 边缘函数、限频逻辑
- `GuestProductCard`、`PublicResult`、`PublicCommunity`、`PublicAbout`
- 店员版的业务流程（仅替换相机 UI 壳子）

## 文件改动

**新增**
- `src/components/recognition/CameraStage.tsx`（约 280 行，纯 UI 相机壳子）

**修改**
- `src/components/dashboard/LiveStreamPanel.tsx`：删除 lines 608-873 的相机 JSX + 相关 useState/useRef/handler，改为引入 `CameraStage`
- `src/pages/public/PublicScan.tsx`：换成 `CameraStage`
- `src/hooks/useGuestRecognition.tsx`：补 `retry / elapsedTime / recognitionFailed`

## 验收

1. `/u` 打开后取景区域和 `/scan`（已登录店员）视觉一致：方形大取景框、四角准星、白色快门键、前后置切换按钮
2. 顾客版同样有「单张快拍 / 多角度合并」分段切换
3. 识别中显示同款黑色半透明遮罩 + 计时器
4. 识别失败显示同款重试遮罩
5. 识别成功后顾客版跳 `/u/result`、店员版原地展开结果卡（行为差异保留）
6. 店员版 `/scan` 的所有业务功能（上传/入库/收藏/enrich/refine/分享中古圈）完全无回归
