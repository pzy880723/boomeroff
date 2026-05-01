# 识别纠错对话 + 中古圈手动发布

## 目标
1. 识别错了能直接跟 AI 对话纠正：你说"这是九谷烧不是青花"，AI 结合你提示+原图重新识别，出新结果。
2. 对话内容自动存为「全员共享」的训练样本（管理员审核后生效，作为下次识别的 RAG 先验）。
3. 取消识别后自动发到中古圈；改成结果页/历史页/我的库三处都有「分享到中古圈」按钮，看顺眼了再发。

---

## 一、数据库（零迁移方案）

migration 工具本轮不可用，所以**复用现有表**：

- **待审核纠错** → 存到 `app_settings` 表，`key='pending_corrections'`，`value = { items: [ {id, image_url, original, corrected, conversation, user_id, created_at} ] }`。提交由 service-role 边缘函数写入，普通用户无写权限。
- **审核通过** → 直接 INSERT 到现有 `official_knowledge` 表（已有 RAG 路径自动生效），并从待审列表移除。
- **驳回** → 从待审列表移除。

好处：等同于"管理员审核 → 入官方知识库"的现成流程，跟现有"申请收录"机制一致。

## 二、新边缘函数 `refine-recognition`

接收：`{ messages: [{role, content}], image_url, original_payload }`

逻辑：
1. JWT 校验，role 必须是 admin/anchor。
2. 拉 ai_model 设置，沿用相同的模型/精度策略（多角度逻辑同识别函数）。
3. 系统 prompt：
   - 角色：日本中古杂货鉴定师。
   - 上下文：把"原始 AI 识别结果"+"用户上传的原图"塞进首条 user 消息，让模型对比。
   - 强调：每次回答都要给出新的完整 JSON 结果（同识别函数的字段），并附一句简短中文说明改了哪里、为什么。
4. 流式 SSE 返回（`text/event-stream`），前端逐 token 渲染。
5. 同时返回结构化 JSON（最后一条助手消息里 ```json ...``` 块）。

文件：`supabase/functions/refine-recognition/index.ts`

## 三、新边缘函数 `submit-correction`

接收：`{ product_id, image_url, original_payload, corrected_payload, user_hint, conversation }`

逻辑：
1. JWT 校验。
2. service-role 读 `app_settings.pending_corrections`，append 一条，写回。
3. 同时把"corrected_payload"立刻更新到 `products` 表（admin 直接生效，anchor 仅更新自己创建的；走现有 RLS）。

文件：`supabase/functions/submit-correction/index.ts`

## 四、修改 `recognize-product`

在 `loadKnowledgeContext` 里**额外拼接已审核纠错样本**（其实已审核的就在 official_knowledge 里，所以无需改）。但增加一个**短期热样本**注入：从 `app_settings.recent_corrections`（一个由审核函数维护的最近 10 条快照）拉出来，让最近纠正的内容优先生效，不用等管理员审核。

简化做法：**审核通过后直接进 official_knowledge** —— 不需要任何额外注入逻辑，已经天然走 RAG。所以这一步实际**不需要改**识别函数。

## 五、前端组件

### 5.1 新组件 `RefineDialog`（`src/components/recognition/RefineDialog.tsx`）

- shadcn `Dialog` 弹窗（移动端友好，max-w-lg）。
- 顶部显示原图 + 当前识别结果摘要（名称/类别/年代）。
- 中部消息列表（`react-markdown` 渲染）。
- 底部输入框 + 发送按钮 + "保存并应用"按钮。
- 流式调用 `refine-recognition`，展示打字效果。
- 当 AI 返回新 JSON 时，"保存并应用"按钮变亮 → 点击：调 `submit-correction` → 关闭弹窗 → 父组件用新结果替换 `displayResult`。

### 5.2 在 `LiveStreamPanel` 结果区加「跟 AI 纠正」按钮

放在"收藏到学习清单"下方，红橙色提示性强。点击打开 RefineDialog。

### 5.3 关闭自动发布到中古圈

`LiveStreamPanel.handleRecognition` 里删掉自动 `community_posts.insert` 块。

### 5.4 「分享到中古圈」按钮（三处）

抽出 `ShareToCommunityButton`（`src/components/community/ShareToCommunityButton.tsx`）：
- 输入：product 完整数据 + image_url。
- 内部状态：检查是否已发过（`community_posts.product_id == product.id && user_id == me`），已发显示"已分享 ✓"。
- 点击：INSERT `community_posts`。

放置位置：
1. `LiveStreamPanel` 结果卡操作区（取代之前的自动发布）。
2. `ProductDetailDialog` 历史详情底部。
3. `MyLibrary`（个人知识页）每条记录的操作菜单。

## 六、管理员审核 UI

新组件 `CorrectionReviewPanel`（`src/components/admin/CorrectionReviewPanel.tsx`），挂到 `Portal.tsx` 已有的 Tabs 里新增"识别纠错审核"页：
- 列表显示待审核条目：原图缩略图、原识别 vs 纠正后对比、用户提示、对话历史折叠。
- 每条两个按钮：[通过审核] / [驳回]。
- 通过 → 调 `approve-correction` 边缘函数（service role 写 official_knowledge + 移除 pending）。
- 驳回 → 调 `reject-correction`（仅移除 pending）。

合并到一个边缘函数 `review-correction`：`{ id, action: 'approve'|'reject' }`。

## 七、Memory 更新

- 新增 `mem://features/recognition-correction-loop`：完整的纠错→审核→RAG 飞轮。
- 更新 `mem://features/community-feed`：取消自动发布，改手动。

---

## 文件清单

**新建（前端）：**
- `src/components/recognition/RefineDialog.tsx`
- `src/components/community/ShareToCommunityButton.tsx`
- `src/components/admin/CorrectionReviewPanel.tsx`

**新建（边缘函数）：**
- `supabase/functions/refine-recognition/index.ts`（流式对话）
- `supabase/functions/submit-correction/index.ts`（提交待审）
- `supabase/functions/review-correction/index.ts`（admin 通过/驳回）

**修改：**
- `src/components/dashboard/LiveStreamPanel.tsx`：删自动发布；加「跟 AI 纠正」+「分享到中古圈」。
- `src/components/history/ProductDetailDialog.tsx`：底部加「分享到中古圈」。
- `src/pages/MyLibrary.tsx`：列表项加分享按钮。
- `src/pages/Portal.tsx`：Tabs 新增"识别纠错审核"。

**Memory：**
- 新增 + 更新两条。

## 性能 / 速度
- 对话纠正走流式，体感快；不影响主识别速度（1-3 秒目标）。
- 审核通过后自动进 official_knowledge，下次识别 RAG 自动生效，无需重启或重训。

确认方案后我开始落地。
