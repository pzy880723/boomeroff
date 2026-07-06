## 目标
让视频详情里的"小红书文案"更有小红书味,并新增显眼的一键复制按钮。

## 1. UI 改造 — `src/components/marketing/AssetDetailDialog.tsx`
小红书文案卡片区域(约 686–710 行):

- **视觉活泼化**:
  - 卡片背景改为暖粉渐变(`bg-gradient-to-br from-pink-50/60 via-rose-50/40 to-orange-50/40`,深色模式退回 `bg-card`),边框 `border-pink-300/40`。
  - 顶部标签"📕 小红书文案"加小红书本色 emoji;右侧显示字数徽章 `#XX 字`。
  - 标题前加 ✨,body 段落保留换行,hashtags 用 `bg-pink-100/60 text-pink-600` 的胶囊样式一个个渲染(而不是一整行文本)。
  - 首评前缀改为 `💬 首评`。
- **一键复制按钮**:
  - 在卡片底部新增一个整宽主按钮 `📋 一键复制全文`,粉色实心样式(`bg-pink-500 hover:bg-pink-600 text-white`)。
  - 点击后调用现有 `copy(videoCopyText(videoCopy))`,并使用 `toast.success('小红书文案已复制,快去发布吧 ✨')` 提示。
  - 保留右上角小图标按钮(复制/重生成)不变,避免破坏现有交互。
- 空状态文案改为"还没生成小红书文案 📝",按钮加 ✨ 图标(已有 Sparkles,保留)。

## 2. 生成提示词 — `supabase/functions/generate-marketing-video-copy/index.ts`
在系统 prompt 中追加小红书风格约束(不改字段结构):
- 标题:必须带 1–2 个 emoji,可以使用 ✨🔥📦💖🎁👀🛍️😭🤌 等小红书常见符号;句式偏"姐妹们/家人们/谁懂啊/绝了"这种口播感。
- 正文:每 1–2 句穿插一个相关 emoji,分段用空行,允许使用【】、‼️、⁉️ 等符号;结尾一句 call-to-action 带 emoji。
- Hashtags:6–10 个,覆盖商品品类 + 中古/vintage/二手好物 + 门店/城市相关词;每个 tag 前保留 `#`。
- 首评:一句引导互动的话,带 emoji。
- 明确禁止:淘宝体、生硬广告词、"点击购买"、公众号话术。

## 3. 不动的部分
- 数据结构 `{ title, body, hashtags, first_comment }` 保持不变。
- 15 秒脚本逻辑、折叠脚本面板、视频下载按钮均不动。
- 无数据库改动。