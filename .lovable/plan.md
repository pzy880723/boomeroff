## 目标
小精灵在 `sending` / `uploading` 阶段（首字未到之前），把现在那个三点跳动的占位符，替换成会随机轮换的"趣味小提示"，让用户不再干等。一旦开始 streaming（有内容了）就自动消失。

## 改动范围
仅前端展示层，**只动一个文件**：`src/components/spirit/SpiritChatPanel.tsx`。
不动 hook、不动 edge function、不动数据库。

## 具体做法

### 1. 新增一个文案池（文件顶部常量）
20 条左右、口吻贴合中古小精灵、Simplified Chinese、每条 8–18 字。分两类：
- 普通思考（`sending` / `streaming` 前）：
  - "翻翻我的小本本…"
  - "让我想想怎么说更清楚～"
  - "正在认真组织语言"
  - "嗯…这个问题有点意思"
  - "脑袋瓜在嗡嗡转 🌀"
  - "稍等，我去货架翻一下"
  - "调出小精灵知识库 📚"
  - "对一对今天的资料…"
  - 等等
- 上传图片时（`uploading`）：
  - "正在偷瞄你拍的图 👀"
  - "图片传输中，别走开～"
  - "在仔细看每一处细节"
  - "把照片送到我面前"

### 2. 新增一个组件 `<ThinkingHint mode="thinking" | "uploading" />`
- 内部 `useEffect` + `setInterval`，每 2.2 秒从对应文案池随机换一句（避免连续重复）。
- 首次挂载随机一句。
- 文案带轻微淡入淡出动画（用 `key` + `animate-in fade-in-0 duration-300` Tailwind 即可）。
- 卸载时清理 interval。

### 3. 替换 `MessageBubble` 里现有空内容三点占位
当前在 `content` 为空且未 streaming 时只显示三个跳动小点。改为：
- 三点小点保留（视觉锚点）
- 旁边/下方追加 `<ThinkingHint mode={...} />` 显示文案
- `mode` 由 `MessageBubble` 新加的 prop `hintMode: 'thinking' | 'uploading'` 决定，由父组件根据 `status` 传入

### 4. 父组件传参
在 `SpiritChatPanel` 渲染最后一条 assistant 消息时：
- `status === 'uploading'` → `hintMode="uploading"`
- 其它情况 → `hintMode="thinking"`

## 不动的地方
- 文案池只在前端，不写数据库
- streaming 一旦开始（有 token 进来），文案自动消失，回到正文 + 光标
- 既有错误态、stop 按钮、图片上传逻辑保持不变
- 不引入新依赖
