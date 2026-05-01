## 目标

把现有「识别不对？跟 AI 纠正」从弹窗按钮改为**直接嵌在商品详情下方的常驻 AI 对话框**，店员看完识别结果就能直接发问、追加新照片，AI 实时给出更准确的判断；如果产生新结果，仍走管理员审核流程进入官方知识库。

## 用户体验

```
┌─────────────────────────────────┐
│   ProductDetailCard（不变）     │
│   张口就讲 / 卖点 / 小抄        │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ 💬 有疑问？或发现识别错误？     │
│ 直接跟 AI 聊，可补拍新角度      │
│                                 │
│  [对话气泡区，初始为空状态提示] │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 📎 加图  [输入框]      → 发 │ │
│ └─────────────────────────────┘ │
│ [若 AI 给出新结果] ✅ 应用并提交 │
└─────────────────────────────────┘
[官方收录 / 收藏 / 分享 按钮（不变）]
```

- 默认折叠为一个**轻量入口横条**（"有疑问？跟 AI 聊一聊 ⌄"），点击展开成对话框，避免一进来就被一大块占据屏幕。
- 展开后即可：
  - 文字输入提问/纠错；
  - 点回形针图标追加 1 张以上新照片（侧面、底款、包装等），缩略图显示在输入框上方，可删除；
  - 发送后流式渲染 AI 回复，已有的 RefineDialog 解析逻辑（提取 JSON、剥离代码块、生成 pendingResult、提交审核）原样复用。
- 产生新结果时，对话框底部出现绿色"AI 给出新结果"卡 + 「应用新结果，并提交训练样本」按钮（与现弹窗一致）。

## 实现步骤

1. **新建 `src/components/recognition/InlineRefineChat.tsx`**
   - 从 `RefineDialog.tsx` 抽出对话/流式/JSON 解析/提交逻辑（不再用 Dialog 包裹）。
   - 顶部一个可展开/收起的 header（lucide `MessageSquareWarning` + `ChevronDown`）。
   - 输入区新增**多图附件**：
     - 文件 input（`accept="image/*"` `multiple`），点附件按钮触发；
     - 选中后压缩（复用 `src/lib/imageCompression.ts`，若已存在；否则用 canvas 简单缩到 1280px JPEG）→ 转 base64；
     - 缩略图条 + ✕ 删除；
     - 发送时把 base64 列表通过 body 传给 edge function。

2. **改造 edge function `supabase/functions/refine-recognition/index.ts`**
   - body 增加 `extraImages?: string[]`（base64 数组）。
   - 拼装首条 user message 时，把额外图片以多个 `image_url` part 追加到 content（在原图之后），并在 text 中提示"以下追加图片是店员补拍的细节"。
   - 其余流式输出/system prompt 保持不变。

3. **接线 `LiveStreamPanel.tsx`**
   - 删除"识别不对？跟 AI 纠正"按钮 + `RefineDialog` 渲染 + `refineOpen` state。
   - 在 `<ProductDetailCard />` 之后、官方收录按钮之前，渲染 `<InlineRefineChat current={displayResult} imageUrl={productImageUrl} productId={currentProductId} onApplied={...} />`。
   - `onApplied` 沿用现有的 `setDisplayResult` 逻辑。

4. **保留旧 `RefineDialog.tsx`**
   - 暂不删除，避免破坏可能的其它入口（已 grep 过仅 LiveStreamPanel 用，但留作过渡，下个清理迭代再删）。

5. **部署 edge function** `refine-recognition`。

## 技术细节

- 多图发送大小：每张压缩后约 150-300 KB，限制最多 4 张，总 base64 < 2 MB（避免函数 body 过大）。
- base64 在前端 toast 提示压缩中、压缩失败回退跳过。
- `extraImages` 仅在当前轮发送时携带，不持久化（与现 `imageBase64` 行为一致）。
- 发送后清空附件，保持对话气泡对应一次提问。
- 折叠状态用 `useState(false)`，首次拿到识别结果不自动展开；店员点击才展开。
- 对话历史在 `displayResult.id` 变化（新识别）时清空。
- 移动端（440px 视口）：附件缩略图条 48×48，输入区 `gap-2`，整卡 `rounded-2xl border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20`，与"店员小抄"色系呼应但更克制。

## 文件改动清单

- 新建：`src/components/recognition/InlineRefineChat.tsx`
- 编辑：`src/components/dashboard/LiveStreamPanel.tsx`（移除按钮+Dialog，挂载内联对话）
- 编辑：`supabase/functions/refine-recognition/index.ts`（支持 `extraImages`）
- 部署：`refine-recognition`
