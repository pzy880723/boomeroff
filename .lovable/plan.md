# 实现计划

## 1. 多图拍摄（两种模式都支持）

修改 `src/components/dashboard/LiveStreamPanel.tsx`：

- 引入 `captureMode: 'single' | 'multi'` 状态，相机预览顶部加分段切换器：「单张快拍」/「多角度合并」
- **单张模式**：保持现有行为（拍一张立即识别）
- **多角度模式**：
  - 新增 `capturedImages: string[]`（最多 5 张），每按拍照按钮把当前帧追加到数组，预览右下角显示横向缩略图条 + 张数徽章（如「3 / 5」）
  - 缩略图支持点击 × 删除单张
  - 新按钮「完成识别（N 张）」点击后把整个数组传给识别流程
  - 切换模式或重置时清空数组
- 文件上传支持 `multiple` 属性（仅多角度模式下开启）

修改 `supabase/functions/recognize-product/index.ts`：

- 入参从 `image: string` 扩展为同时接受 `images: string[]`（向后兼容）
- 多张时把所有图片打包到同一次 Lovable AI Gateway 调用的 `messages[0].content` 数组里，prompt 增加一句「以下为同一件商品的多个角度，请综合判断」
- 缓存 hash 用第一张图（避免多图组合永远不命中缓存）
- 上传到 storage 时只存第一张图作为代表图（封面）

修改 `src/hooks/useProductRecognition.tsx`：扩展 `recognizeProduct` 支持 `string | string[]`。

## 2. 手动「加入知识库」按钮

修改 `src/components/dashboard/LiveStreamPanel.tsx`：

- **移除** `handleRecognition` 里的自动 `product_knowledge` 写入（第 256-272 行）
- 在结果区底部新增按钮「加入知识库」，点击后才执行原写入逻辑
- 按钮带状态：未入库 → 入库中（loading）→ 已入库（disabled + 勾选图标），同一商品不重复入库
- 用本地 state `knowledgeAdded: boolean` 跟踪，每次新识别时重置

## 3. 隐藏后台入口（点 logo 5 次 + 独立密码）

新建 `src/hooks/useAdminPortal.tsx`：

- 提供 `tapLogo()` 计数器：3 秒内累计 5 次触发开锁弹窗
- 提供 `verifyPassword(pwd)` 校验三组硬编码密码（`pzy5565283` / `880723` / `boomer2016`），任一通过即在 `sessionStorage` 写入 `__admin_portal_unlocked = "1"`，并 `navigate('/portal')`
- 提供 `isPortalUnlocked()` 读 sessionStorage
- 关闭浏览器/刷新会话后失效（按用户选项「独立后台密码（与账号无关）」，不持久化设备）

修改 `src/components/layout/Header.tsx`：

- logo `<Link>` 改为 `<button>` 包裹（保留 to "/" 行为：单击跳首页，连续 5 次触发弹窗）
- 弹出 `<Dialog>` 含密码输入框 + 错误提示，验证通过后导航到 `/portal`

新建 `src/pages/PortalGuard.tsx`：包装组件，未解锁时 `<Navigate to="/" />`。

新建 `src/pages/Portal.tsx`：后台首页，含侧边导航：
- 用户管理（迁移自 AdminUsers）
- 邀请管理
- （预留）商品/识别历史管理

注册路由 `/portal`、`/portal/users` 到 `App.tsx`。

## 4. 前端移除「用户管理」入口

修改 `src/components/layout/Header.tsx`：

- 删除 `role === 'admin'` 时显示的「用户管理」按钮（第 47-54 行）
- 删除下拉菜单里 admin 的「系统设置」项

修改 `src/App.tsx`：

- `/admin/users` 路由保留但用 `PortalGuard` 包裹（或直接重定向到 `/portal/users`），避免老链接 404
- 新增 `/portal` 与 `/portal/users` 路由

## 技术细节

**密码安全说明**：三个密码只是「软门锁」，用于在共享设备上隐藏后台入口；由于 RLS 仍以 Supabase auth 角色为准，真正的敏感操作（增删用户/角色）依然要求当前登录账号是 admin。如果当前登录账号不是 admin，进入 /portal 后用户管理 API 会被 RLS 拒绝——会在页面顶部显示提示「请使用管理员账号登录后再进行用户操作」。

**多图 token 成本**：Gemini Flash Lite 多图调用按图计费，限制最多 5 张以控制延迟（仍保持 ~2-3 秒目标）。

**布局**：

```text
[Header  logo(可点5次) ······ 知识 历史 头像]
[相机预览]
  [单张快拍 | 多角度合并]   ← 顶部分段
  [缩略图 1 2 3]            ← 多角度时右下
  [拍照 / 完成识别(3)]      ← 底部
[识别结果]
  ...
  [加入知识库]              ← 手动按钮
  [编辑] [删除] (admin only)
```

## 文件清单

- 编辑：`src/components/layout/Header.tsx`、`src/components/dashboard/LiveStreamPanel.tsx`、`src/hooks/useProductRecognition.tsx`、`src/App.tsx`
- 新建：`src/hooks/useAdminPortal.tsx`、`src/pages/Portal.tsx`、`src/pages/PortalGuard.tsx`
- 编辑：`supabase/functions/recognize-product/index.ts`