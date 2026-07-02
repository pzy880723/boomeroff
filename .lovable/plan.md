## 一、明确修复项（先执行确定的调整）

### 1. 底部导航栏 `BottomTabBar.tsx`
- 文字换行原因：`min-w-[48px]` 太窄 + 三字标签 → 收窄标签为 2 字：
  - 「仪表盘」→「首页」
  - 「知识库」→「知识」
  - 「通知」保留
  - 「我的」保留
  - 中间相机按钮下方加回「AI 识图」小字标签（不换行）
- 图标 + 文字垂直居中：调整 `py`、去掉 `items-end`，改为 `items-center`，整体胶囊高度略降。
- 相机主按钮：进一步凸起（`-mt-6`），保留红色 + 呼吸光晕，下方留出「AI 识图」小字位置，避免"下方空"。

### 2. 首页顶栏 & 排版 `Home.tsx`
- 顶栏改为标准 `PageHeader` 布局：左「仪表盘」标题，右侧红色 BOOMER-OFF logo。
- 「你好，陆哥」下方鼓励语左对齐（当前 `text-center` 改为 `text-left`）。
- 应用网格上方补回「我的应用」小标题（与其他 section 一致的 h2 样式），铅笔编辑按钮移到标题最右侧同一行。

### 3. 门店手册 / OKR 罗列到首页
- 在「我的应用」区块下方新增 Section「门店手册」：从 `store_okrs`（或 `okrs`）读该门店记录，纵向 list 排列（图标 + 标题 + 进度条 + 右侧箭头），点击进 `OkrDetail`。查看更多跳 `/okrs`。

### 4. 二级页面顶栏统一
- 巡检 `PageHeader.tsx` 使用点：确保右上角挂 `BrandLogoRed`（新的红色 BOOMER-OFF logo），删除残留 vintage logo 引用。

### 5. 发通知入口迁移
- 从 `Notifications.tsx` 顶栏移除「发布通知」按钮。
- 改为管理员可见的 FAB 浮标（右下方，避开 BOOMER 浮标），点击打开一个 **AI 对话式撰稿弹窗**：
  - 输入需求 → 调用 Lovable AI 生成 title/body/category 草稿 → 用户可继续对话细化 → 确认发布。
  - 发布后走既有 `generate-notification-banner` 流程。
- 使用 usePermissions().can('notifications.manage') 判定可见性。

### 6. 字体升级
- 换掉当前 `Noto Sans SC` 主导的字体栈，改用更"高级"的组合：
  - 中文：`HarmonyOS Sans SC` / `PingFang SC` / `思源黑体` 系（本地系统字体优先）；
  - 数字/西文：`Inter Tight` 或 `Geist` 作为 display，配 `Inter` 作为 body；
  - `.font-display` 权重从 900 降到 700 + 加大 tracking 收紧，避免"厚重廉价感"。

---

## 二、液态玻璃风 UI 设计稿（需要你先选方向）

你提到「苹果 iOS 26 Liquid Glass 光影玻璃」+ 红色主调 + 更高级感。这类视觉需要先看效果稿再实现，不能直接改。

**下一步我会做的事：**
1. 用 Playwright 截当前 `/` 首页真实效果作为参照；
2. 调用 `design--create_directions` 生成 3 个 **液态玻璃 + 朱红主色** 的首页方向稿：
   - 例如 A) 全透玻璃卡片 + 红色高光边；B) 深色玻璃暗底 + 红色霓虹反射；C) 白瓷 + 红色液态高光。
3. 用 `questions--ask_questions`（type: prototype）把 3 个稿子摆给你选；
4. 你选中后再落地到 `index.css` + Home/卡片组件。

液态玻璃需要 `backdrop-filter`、多层高光渐变、半透边框、镜面反射。技术上都可行（tailwind + CSS 变量），关键是先定视觉方向。

---

## 三、执行顺序

1. 先落地「一」里的 6 项确定修复（不涉及视觉大改）；
2. 再进入「二」的 UI 设计稿流程 → 你确认方向 → 全站视觉升级。

确认这个计划后我就开工，先做第一批修复，然后马上截图 + 生成 3 个液态玻璃方向让你选。
