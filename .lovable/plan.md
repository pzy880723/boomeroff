## 目标

系统的真实用户是**门店店员**，不是直播主播。需要把 UI 文案和 AI 对话里出现的"主播"全部去掉，改用第二人称"你/您"；同时更新项目记忆，让后续功能默认按门店场景理解。数据库角色 `anchor` 保留不动（避免迁移枚举和 RLS 的回归风险），仅做"内部技术名"使用。

## 改动范围

### 1. 前端 UI 文案（把"主播"替换为"你 / 您"或去掉）

排查并替换以下文件里出现的"主播"字样（基于代码库搜索，逐个核对上下文，让句子读起来自然）：

- `src/components/recognition/RefineDialog.tsx`
  - "告诉 AI 哪里错了…"区域、占位提示等。
- `src/components/dashboard/LiveStreamPanel.tsx`
- `src/components/recognition/CameraCapture.tsx`
- `src/components/recognition/ProductDetailCard.tsx`
- `src/components/dashboard/Dashboard.tsx`
- `src/components/dashboard/DailyKnowledgeCard.tsx`
- `src/components/history/ProductDetailDialog.tsx`
- `src/components/history/ProductEditDialog.tsx`
- `src/components/community/ShareToCommunityButton.tsx`
- `src/pages/Scan.tsx` / `src/pages/History.tsx` / `src/pages/Me.tsx` / `src/pages/Community.tsx` / `src/pages/MyLibrary.tsx` / `src/pages/OfficialLibrary.tsx`
- `src/components/auth/*`（登录/注册/忘记密码里若有"主播注册"等字样）
- `src/components/admin/*`（用户管理、邀请、知识管理、纠错审核等面板里的提示文字）
- `src/components/layout/Header.tsx` / `BottomTabBar.tsx` / `PageHeader.tsx`
- `index.html` 的 `<title>` 与 meta description（如果含"直播/主播"字样，调整为门店场景）

替换原则：
- "主播" → "你"（动作主语）/"您"（敬称提示）/直接删掉（如"主播的纠正" → "纠正提示"）。
- 不要机械全局替换，逐句调整让中文通顺。
- 角色徽章/下拉里如果显示"主播"，改成"店员"（仅显示文案；数据库值仍是 `anchor`）。

### 2. AI 系统提示词（Edge Functions）

把发给模型的 system prompt 里"主播"改成"门店店员"或"你"，让 AI 的回复也不再出现"主播"：

- `supabase/functions/refine-recognition/index.ts` —— SYSTEM_PROMPT 里多处"主播"。
- `supabase/functions/recognize-product/index.ts` —— 如有相关提示词。
- `supabase/functions/generate-daily-knowledge/index.ts` —— 每日知识生成的语气提示。
- `supabase/functions/compute-importance/index.ts` —— 如有。

同时把"10 秒话术 / 直播话术"这类 wording 调整为"门店讲解 / 接待话术"（保持~100 字长度约束不变）。

### 3. 角色映射层（不动数据库）

- 在 UI 里显示角色名时统一加一个映射函数（如 `roleLabel(role)`），`admin → 管理员`、`anchor → 店员`。
- 数据库 `app_role` 枚举、RLS、`has_role` 函数、`handle_new_user` 触发器全部保留 `anchor`，不做迁移。
- 代码里的变量名/类型名（`anchor`、`Anchor`）保持不变，只改用户可见文案。

### 4. 项目记忆更新

- `mem://index.md` Core 第一行改为：
  `Misc-goods recognition tool for in-store staff (门店店员) at Japanese second-hand shops. 10s rotation, unique items.`
- Core 里 `Roles: Admin (manage users/history), Anchor (read-only history). Both scan/price.` 改为：
  `Roles: Admin (管理员, manage users/history), Anchor=店员 (in-store staff, read-only history). Both scan/price. UI never shows the word "主播".`
- 新增一条 constraint 记忆 `mem://constraints/no-anchor-wording`：
  - 内容："UI 与 AI 回复中禁止出现"主播"二字。**Why:** 真实用户是门店店员，称呼错误会让用户困惑。**How to apply:** 文案用"你/您"或"店员"；数据库 `anchor` 枚举仅作内部技术名保留，不动。"
- 更新 `mem://accounts/user-roles-simplified`：把"Anchor (主播)"描述改成"Anchor = 店员 (in-store staff)"，说明这是历史遗留命名。

### 5. 验证清单（实施后）

- 全局搜索 `主播` 应只在以下位置允许：`mem://` 里描述历史遗留命名时的注释；其余所有 .ts/.tsx/.html/.md 中应为 0 命中。
- 走一遍主要页面（首页 / 扫描 / 历史 / 中古圈 / 我的 / 登录 / 管理后台）截图确认。
- 触发一次"识别 → 纠错对话"，确认 AI 回复里也没有"主播"。

## 不改什么

- 数据库 schema、RLS、`app_role` 枚举、Edge Function 的角色校验逻辑（`role !== 'anchor'`）—— 一概不动。
- 代码里的变量名 `anchor` / 类型 `'anchor'` —— 不动。
- 路由、组件文件名 —— 不动。

这样能用最小风险完成"换称呼"，未来如果真的要把数据库也迁成 `staff`，可以单独再做一次完整迁移。
