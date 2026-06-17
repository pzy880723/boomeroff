## 修复方向

上次我误把 `ratio/duration/resolution/watermark` 拼进了 prompt 文本（`--rs --rt --dur --wm`），但官方文档示例明确显示它们是 **顶层字段**：

```json
{
  "model": "doubao-seedance-1-0-pro-250528",
  "content": [{ "type": "text", "text": "..." }],
  "ratio": "16:9",
  "duration": 5,
  "watermark": false
}
```

需要回退。

## 改动

**`supabase/functions/render-marketing-video/index.ts`**

1. `buildPrompt` 产出的 prompt 不再追加 `--rs/--rt/--dur/--wm` 后缀，回到纯文案。
2. `arkBody` 恢复顶层字段：
   ```ts
   const arkBody = {
     model,
     content,                 // [{type:"text",text}, 可选 {type:"image_url", image_url:{url}, role:"first_frame"}]
     resolution: "720p",
     ratio,                   // 9:16 / 16:9 / 1:1 ...
     duration,                // 4-12 整数秒
     watermark: false,
   };
   // 仅 1.5 pro / 2.0 支持音频,默认模型是 1.5 pro 所以加上
   if (/seedance-(1-5|2)/i.test(model)) arkBody.generate_audio = true;
   ```
3. 保留 `console.log("[render] ark request", ...)` 日志,出错时把 `arkRes.status + arkJson` 一起打到日志方便排查。

## 仍要确认的运行环境（不改代码）

- 方舟控制台已为当前模型（默认 `doubao-seedance-1-5-pro-251215`）开通调用权限,否则会 404 `ModelNotOpen`。
- 账户余额或资源包充足。
- 如想换模型,去 `/portal` → AI 模型设置 改 `video_model`,例如改成已开通的 `doubao-seedance-1-0-pro-250528`。

确认后切到 build 模式我就改。