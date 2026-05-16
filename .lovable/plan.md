## 目标
小精灵的聊天窗口支持**拍照**和**发送图片**，小精灵能"看到"图片并回答（如「这是啥」「这个年代/产地」「能卖多少」）。

## 改动概览

### 1. `src/components/spirit/SpiritChatPanel.tsx`（输入区 + 消息渲染）
- 输入框左侧新增两个圆形小图标按钮：
  - 📷 **拍照** → `<input type="file" accept="image/*" capture="environment">`，触发系统相机
  - 🖼️ **相册** → `<input type="file" accept="image/*" multiple>`
- 选择后进入「待发送区」：输入框上方显示缩略图横排（最多 4 张），每张右上角 ×可移除。
- 发送时：若有图片，调用 `send(text, images)`；允许仅图片无文字（自动补一句「帮我看看这个？」作为提示词兜底）。
- `MessageBubble` 支持渲染 user 消息里的图片：文字 + 缩略图网格（点击放大用现有 Dialog 或简单新窗）。
- 流式过程中按钮禁用。

### 2. `src/hooks/useSpiritChat.ts`（消息结构 + 上传）
- `SpiritMessage` 扩展：`images?: string[]`（公开 URL 数组）。
- `send` 签名改为 `send(text: string, files?: File[])`：
  - 压缩 → 上传到 `product-images` bucket 下 `spirit-chat/{uid}/{ts}-{rand}.jpg`（已有 bucket 是 public，直接拿 publicUrl，零迁移）。
  - 上传并行 `Promise.all`，失败给 toast 并中止。
  - 把 publicUrl 数组放进 userMsg.images，并按 OpenAI vision 多模态格式发给 edge function。
- 压缩复用现有 `src/lib/imageThumb.ts`（若签名不匹配则内联一个 `canvas` 压到长边 1280、jpeg 0.82）。

### 3. `supabase/functions/spirit-chat/index.ts`（多模态透传）
- 接收的 `messages[i]` 允许 content 为 string **或** OpenAI 多模态数组 `[{type:'text',text},{type:'image_url',image_url:{url}}]`。
- 对 user 消息做归一化：若客户端传了 `images: string[]` 附在 message 上，则在 server 端拼成多模态数组再喂给 gateway。
- 透传 `google/gemini-3-flash-preview`（已支持 vision）。
- `extractQuery` 兼容非字符串 content：拿 text 部分。

### 4. 复用与不动
- 上传：直接复用现有 `product-images` 公共 bucket（已 public、已有 RLS），无需新 migration。
- 不动浮窗胶囊、问候弹窗、`SpiritMascot`。

## 技术细节
- 图片压缩用浏览器 Canvas，长边 ≤1280px，输出 jpeg quality 0.82，单张控制在 ~200KB 内，减少上传时间和 token 成本。
- 多模态消息结构示例：
  ```json
  { "role": "user",
    "content": [
      {"type":"text","text":"这个能值多少？"},
      {"type":"image_url","image_url":{"url":"https://.../a.jpg"}}
    ]
  }
  ```
- 历史消息持久化只保留在内存（保持现状不入库），但 user 消息的 images URL 跟着 messages 在前端保留，重发上下文时一并发出去。
- 移动端 iOS Safari 相机：`capture="environment"` 在 input file 上即可弹出后置相机，无需额外原生权限。

## 边界
- 单次最多 4 张图，超过提示「最多 4 张」。
- 单文件 >10MB 直接拒绝（防误触）。
- 仅图片无文字时，前端在发送给 server 的 text 里塞默认 "帮我看看这个？"。
