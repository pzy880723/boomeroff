## 目标
在"新建/编辑活动"对话框的"活动描述"字段右侧加一个 AI 润色按钮:用户随便写两句,点一下让 AI 帮忙改写成正式、吸引人的活动描述文案。

## 改动

### 1. 新建 edge function `supabase/functions/polish-activity-description/index.ts`
- 校验 JWT(从 Authorization 取 user),拒绝匿名。
- 请求体: `{ name?: string, draft: string }`,用 Zod 校验,`draft` 长度 1-300。
- 用 Lovable AI Gateway,默认模型 `google/gemini-3-flash-preview`,无需用户 key。
- system prompt 要求:
  - 用简体中文(项目硬性规则,UI/AI 全中文,不准出现"主播");
  - 输出一段 80-200 字的活动描述,语气友好、有吸引力,适合日本中古杂货门店的顾客活动;
  - 保留用户提到的事实(优惠/玩法/参与方式),不要瞎编额外赠品/折扣;
  - 不加 emoji、不加 markdown、不要标题,只输出正文一段;
  - 如果给了活动名称,把活动主题贴合该名称。
- 返回 `{ polished: string }`。
- 标准 CORS + 429/402 错误透传给前端。

### 2. `supabase/config.toml` 注册该 function(`verify_jwt = true`,因为只允许登录用户用)。

### 3. 前端 `src/components/voucher/ActivityEditDialog.tsx`
- 在"活动描述"那一块:
  - 把 Label 那一行改成 `flex justify-between`,右边放一个小按钮"✨ AI 润色"(`Sparkles` 图标 + 文字,`size="sm" variant="ghost"`,`h-6 text-xs`)。
  - 按钮 disabled 条件: `description.trim().length < 2 || polishing`。
  - 点击 → `supabase.functions.invoke('polish-activity-description', { body: { name, draft: description }})`。
  - 进行中按钮显示 `Loader2` 动图 + "润色中"。
  - 成功后用返回的 `polished` 替换 `description`,toast.success("AI 已润色,可继续微调")。
  - 失败 toast.error 显示后端 message;401/402/429 各自给中文提示。
- 不改其他字段、不改保存逻辑、不改默认字段。

## 不改动
- 不动数据库 schema,不动 `activities` 表。
- 不动 voucher、字段、时间、状态相关 UI。
- 不动 BOOMER 浮窗、其他 AI 功能。

## 验收
- 打开"新建活动" → 描述框右上角出现"✨ AI 润色"按钮。
- 输入"双十一打卡来店送优惠券" → 点按钮 → 1-3 秒内文本被替换成一段更完整的活动描述。
- 描述为空时按钮 disabled。
- 未登录或 token 过期时给出明确错误提示。
