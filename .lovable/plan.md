# 中古小精灵 · 系统 Agent 改造方案

把右下角的胶囊换成一只会动的拟人小精灵，点击展开「对话 ↔ 仪表盘」两个 Tab 的抽屉，原有 6 个面板全部保留。

---

## 一、视觉与动效

### 1.1 小精灵形象
- 用 imagegen 生成一张 **透明背景 PNG**：拟人小精灵，戴小礼帽 / 围巾，怀里抱着一台小相机或老茶杯，柔和水彩 + 描边风格，与项目 `bg-gradient-primary` 色调一致。
- 尺寸 ~256×256，约 30-60KB。文件落到 `src/assets/spirit-mascot.png`。
- 同时生成 **眨眼帧 / 张嘴帧** 备用（可选，若一张图够灵动就先省）。

### 1.2 动效（全部 CSS，零依赖）
- **idle 漂浮**：3s 周期上下 ±4px + 轻微旋转 ±2°。
- **眨眼**：每 4-6s 一次 scaleY(0.05) 100ms。
- **说话时**：上下抖动加快到 0.8s 周期，头顶冒出 1-2 个小气泡（`<span>` + ping 动画）。
- **未读 / 提醒**：头顶挂红色小圆点（沿用现在的徽标）。
- **首次出现**：fade + scale-in，停 2s 自动说一句"你好呀～"气泡（沿用现在的 `showLabel` 机制）。
- 拖拽、贴边、记忆位置 → 沿用 `FloatingDashboard` 现有逻辑。

---

## 二、交互结构

```
┌─ 小精灵胶囊（拖拽 / 提醒徽标）
└─ 点击 → 底部抽屉（85vh）
       ┌─ 顶部：小精灵头像 + "中古小精灵" + 关闭
       ├─ Tabs:  [💬 对话]  [📊 仪表盘]
       │
       ├─ [💬 对话] Tab
       │   - 消息流（AI Elements: Conversation/Message/MessageResponse）
       │   - 顶部一排 chip 快捷：今日排班 / 我的等级 / 待办 / 帮我打气
       │   - 输入框（PromptInput + Submit + 📎 拍照按钮）
       │   - 拍照走现有 CameraCapture，图片以 image part 发给 agent
       │
       └─ [📊 仪表盘] Tab
           - 现有 ProfileHeaderCard / TodayPanel / TasksPanel /
             MessagesPanel / SchedulePanel 原样塞进来
```

抽屉是同一个，Tab 用 `localStorage` 记忆上次选择。

---

## 三、AI Agent 后端（edge function）

新建 `supabase/functions/spirit-chat/index.ts`，用 AI SDK + Lovable AI Gateway：

- 模型：`google/gemini-3-flash-preview`
- `streamText` + `toUIMessageStreamResponse`
- system prompt（中文）：温暖、幽默、像店里一位懂行的老前辈，会主动鼓励、偶尔讲个冷知识；不用"主播"，称呼"你"。
- 工具集（AI SDK `tool({ inputSchema, execute })`）：

| 工具 | 作用 | 数据源 |
|---|---|---|
| `get_my_schedule` | 今日 / 本周班次 + 同班同事 | `shift_schedules` + `shop_shifts` |
| `get_my_progress` | 经验值 / 等级 / 连续打卡 | `user_experience` + `user_check_ins` |
| `get_pending_todos` | 我的待办（识别纠错、未读、审核） | 现有 `useTasks` / `useNotifications` 同源表 |
| `search_knowledge` | 中古知识 RAG | `official_knowledge` 全文检索 |
| `search_shop_kb` | 门店 SOP / 顾客 Q&A | `shop_kb_entries` |
| `daily_pep_talk` | 抽取一条打气文案 | 内联模板 + 当日日期 / 用户连胜 |
| `recognize_image` | 把图转交识别管线 | 调 `recognize-product` |

- 鉴权：从 `Authorization` 取 JWT，校验 `user_roles`，把 `user_id` 注入工具上下文。
- `stopWhen: stepCountIs(50)`。
- CORS、`verify_jwt = false`、错误 (429/402/500) 一律以可读 JSON 返回。

---

## 四、前端实现

### 4.1 新文件
- `src/assets/spirit-mascot.png`（生成）
- `src/components/spirit/SpiritMascot.tsx` — 纯 CSS 动效的小精灵组件（接收 `state: idle|talking|alert`）
- `src/components/spirit/SpiritChatPanel.tsx` — 对话 Tab 内容，`useChat` + AI Elements
- `src/components/spirit/QuickChips.tsx` — 顶部快捷指令
- `src/components/spirit/SpiritDrawer.tsx` — 两 Tab 抽屉

### 4.2 改造文件
- `src/components/dashboard/FloatingDashboard.tsx`：
  - 胶囊视图换成 `<SpiritMascot />`
  - 抽屉内容替换为 `<SpiritDrawer />`
  - 拖拽 / 位置记忆 / 自动打开 / 提醒徽标逻辑保留
- `MainLayout.tsx`：不变
- `useDashboardData.ts` / `useNotifications` / `useTasks`：仪表盘 Tab 复用，不动

### 4.3 依赖
- `bun add ai @ai-sdk/react @ai-sdk/openai-compatible zod`
- AI Elements：`bunx ai-elements@latest add conversation message prompt-input shimmer tool`
- 已存在 `react-markdown` 渲染 MessageResponse。

### 4.4 对话不持久化
- `useChat` 不传 `id`，刷新即清空（用户已选「不保存」）。
- 关闭抽屉不清空；切 Tab 不清空；点"清空对话"按钮清空。

---

## 五、安全 / 性能

- LOVABLE_API_KEY 已在 secrets 中，无需新增。
- 工具内所有 DB 调用走 service-role client 但只读用户自己的数据（`.eq('user_id', user.id)`）。
- 小精灵 PNG 走 pngquant 压缩，控制在 50KB 内。
- 抽屉懒加载（仅打开后 import `SpiritChatPanel`），不增加首屏体积。
- 对话流即时显示（status='submitted' → shimmer "小精灵在想..."）。

---

## 六、不在本轮做

- 持久化历史（用户明确不要）
- 多会话切换
- 主动 push（已选要，但需配合现有 `useNotifications` 红点 + 抽屉打开时由小精灵主动开口；不做服务端推送）

---

## 七、验证清单

1. 登录后右下角出现会动的小精灵，3s 内自动说"你好呀～"气泡。
2. 拖动小精灵 → 松手贴边 → 刷新位置仍在。
3. 点小精灵 → 抽屉打开 → 默认在对话 Tab，输入框自动 focus。
4. 输入"今天我和谁一起上班"→ 工具调用 → 流式输出班次 + 同事。
5. 切到仪表盘 Tab → 现有 6 个面板完整显示。
6. 关掉抽屉再打开 → 对话仍在，刷新页面 → 对话清空。
7. 顶部 chip "帮我打气"→ 输出一段温暖鼓励文案。
8. 点 📎 拍照 → 拍一张 → 小精灵识别后用自然语言回答。

确认这个方案后我开工。
