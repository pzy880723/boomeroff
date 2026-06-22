## 问题
BOOMER 对话(浮窗仪表盘里的聊天)发任何消息都没有回复。

边缘函数日志:
```
[spirit-chat] error ReferenceError: 描述 is not defined
  at .../spirit-chat/index.ts:366:50
```

## 根因
`supabase/functions/spirit-chat/index.ts` 第 284 行 `systemPrompt` 是反引号模板字符串。第 296、297 行的提示文案里写了未转义的反引号:

```
- **多模态输出**:当 web_search 返回了图片 URL,请用 Markdown `![描述](图片URL)` 嵌入...
- **画示意图**:... 调用 generate_diagram,并把返回的 url 用 `![示意图](url)` 嵌入。
```

内联反引号提前关闭了外层模板字符串,`![描述](图片URL)` 被当成 JS 表达式 → 报 `描述 is not defined`,整个函数 500。前端因此收不到任何回复。

## 修复
只改 `supabase/functions/spirit-chat/index.ts` 的 system prompt 文本,把内联的 ` 全部转义为 `\``(或换成中文角标 「 」),不动其它逻辑:

```
用 Markdown \`![描述](图片URL)\` 嵌入到答案中
... 用 \`![示意图](url)\` 嵌入
```

顺手扫一下 prompt 里其它中文括号 / 反引号,确认没有再次破坏模板。

## 验证
1. 重新部署 spirit-chat。
2. 在 /me 浮窗 BOOMER 抽屉里发"你好",应收到流式回复。
3. 看 `supabase--edge_function_logs spirit-chat`,不再出现 `ReferenceError`。

不动前端、不动其它工具/RAG 逻辑,纯字符串转义修复,影响面最小。
