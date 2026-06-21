# BOOMER 多模态升级方案

让浮窗里的 BOOMER 在对话中能够：① 遇到不会的问题自动联网搜索 ② 在回复里插入相关图片 ③ 把总结直接生成一张示意图发给你。

## 一、能力清单

1. **联网搜索（已部分具备，需打通到 spirit-chat）**
   - 复用 `web-search-grounding` 里已接入的 Gemini `google_search` 工具
   - 在 `spirit-chat` edge function 中开启 `tools: [{ google_search: {} }]`,模型不确定时自动触发
   - 搜索来源（标题 + URL）通过 SSE 推回前端,在气泡下方显示"参考来源 N 条"折叠列表

2. **图片插入（图文并茂）**
   - 模型输出 Markdown,前端用 `react-markdown` 渲染 `![alt](url)`
   - 图片来源两路:
     - 联网搜索结果里的图片(Gemini grounding 返回的 image refs / 网页 og:image)
     - 知识库 `kb_documents` 关联的 `marketing_assets` 图片 URL(KB 检索时一并带回)
   - 系统提示词新增:"必要时用 Markdown 图片语法插入相关配图,优先用[内部知识参考]里附带的图片 URL,其次用联网搜索结果中的图片"

3. **示意图生成(按需文生图)**
   - 给模型注册一个 `generate_diagram` 工具:
     - 参数:`prompt`(中文描述)、`style`(`illustration` | `infographic` | `flowchart`)、`aspect_ratio`
     - 执行端:edge function 调用 Lovable AI `google/gemini-3.1-flash-image-preview` 生成图,上传到 `chat-images` storage bucket,返回公开 URL
   - 模型在总结时若判断"用图更清楚"会自动调用,把返回的 URL 以 `![示意图](url)` 嵌入回复
   - 也支持用户显式说"画个示意图"/"做成图给我"触发

4. **(可选)用户上图 → BOOMER 看图回答**
   - 浮窗输入框新增 📎 上传按钮,图片转 base64 作为 `image_url` part 传给模型(spirit-chat 已用 Gemini,天然支持 vision)
   - 本轮先做"BOOMER 发图给你",看图能力如需要可一并打开,请确认

## 二、技术改动

### Edge Function: `supabase/functions/spirit-chat/index.ts`
- 在 `tools` 数组里加入:
  - `google_search`(grounding,内置)
  - `generate_diagram`(自定义,带 `execute` 调用图像生成 API + storage 上传)
- SSE 事件类型扩展:
  - `__kb_sources`(已存在)
  - `__web_sources`:`[{title, url, snippet}]`
  - `__tool_call`:`{name, status}` 用于前端显示"BOOMER 正在搜索…/正在画图…"状态条
- 系统提示追加多模态输出规范(Markdown 图片、引用来源、何时画示意图)

### Storage
- 新增 bucket `chat-images`(public read),用于存放 BOOMER 生成的示意图
- RLS:仅 service_role 可写,所有人可读

### 前端: `src/components/spirit/SpiritChatDrawer.tsx`(或对应组件)
- 消息渲染换为 `ReactMarkdown` + `remark-gfm`,允许 `img` 标签;给图片加圆角 + 点击放大
- 气泡下方加两个折叠区:
  - 🔗 参考来源 (`__web_sources`)
  - 📚 品牌知识库 (`__kb_sources`,已存在)
- 工具调用中显示 inline loading:"🔍 联网搜索中…" / "🎨 生成示意图中…"
- "★ 加入知识库"按钮对带图回复同样可用(图片 URL 一并存进 `accepted_output`)

### Portal 开关(管理员)
- `app_settings.spirit_chat_features`:
  - `web_search_enabled`(默认 on)
  - `diagram_generation_enabled`(默认 on)
  - `max_images_per_reply`(默认 2,防止滥用)

## 三、成本与体验保护

- 联网搜索:仅在模型自己判断需要时触发,不每次都搜
- 生成示意图:单次约 1-2 credits,系统提示约束"仅在能显著提升理解时才画,不要为每条回复都画"
- 前端图片懒加载 + 最大宽度,移动端体验优先
- 失败降级:搜索失败 → 纯文本回答 + 提示"暂时联网失败";画图失败 → 文字描述 + 提示"示意图生成失败"

## 四、不在本次范围

- 视频生成回复(后续)
- 用户上传图片让 BOOMER 看图(等你确认是否一起做)
- 把生成的示意图自动回灌到知识库(可在"★ 加入知识库"按钮里手动触发,已支持)

## 五、需要你确认

1. 用户在浮窗里**上传图片**给 BOOMER 看 —— 本轮一起做,还是先只做 BOOMER 发图?
2. 生成示意图默认风格倾向:**插画风(暖萌、贴近 BOOMER 品牌)** 还是 **信息图/流程图(严谨)**?还是让模型按内容自动选?
