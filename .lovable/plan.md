我查到卡住点了：不是前端按钮没生效，也不是后台选择是摆设。当前数据库里确实保存的是「豆包 + 联网搜索」：`provider=doubao`、`enableWebSearch=true`、`model=doubao-seed-1-6-250615`。

真正卡住在后端识别函数调用豆包联网接口时：

```text
Doubao Responses failed: 404 ToolNotOpen
Your account has not activated web search.
```

也就是说，豆包普通识别接口可用，但这个豆包账号/火山方舟侧还没有开通 `web_search` 插件权限。当前代码会先等豆包联网接口超时/失败约 31 秒，再降级到普通豆包识别，导致用户看到“AI 识别中”像卡住；降级后还返回了“未知商品”，所以体验就是无法识别。

修复计划：

1. 让“豆包联网未开通”快速失败并自动降级
   - 在 `recognize-product` 后端函数里识别 `ToolNotOpen`、`web_search` 未开通、404 插件错误。
   - 不再让用户等几十秒；发现该错误后立即切到豆包普通视觉识别。
   - 返回 `__pipeline.degradedReason = '豆包联网搜索未开通，已改用普通识别'`，前端能明确显示原因。

2. 给豆包联网调用加超时保护
   - 对豆包 Responses API 增加较短超时，例如 8-10 秒。
   - 超时后自动降级到普通豆包识别，避免无限“识别中”。
   - 普通豆包识别也加合理超时，最终失败时给明确错误。

3. 在识别结果卡上显示真实路径
   - 如果命中降级，结果卡显示类似：`豆包普通识别 · 联网未开通`。
   - 如果真正联网成功，显示：`豆包联网核验`。
   - 如果缓存/名称命中，也继续显示当前已有路径，避免误以为每次都跑了联网。

4. 在 `/portal` 当前生效配置里增加健康提示
   - 当选择「豆包 + 联网搜索」时，明确提示：需要火山方舟账号已开通 web_search 插件，否则会自动降级普通识别。
   - 增加“测试当前配置”按钮的错误解释：如果返回 `ToolNotOpen`，提示不是本应用没调用，而是账号侧未开通联网搜索。

5. 保留后台选择功能的有效性
   - 后台选择仍然决定主识别模型：豆包就走豆包。
   - 只是“联网搜索”这个能力依赖豆包账号插件权限；未开通时不能假装联网成功，必须清晰告知并降级。

涉及文件：
- `supabase/functions/recognize-product/index.ts`
- `src/components/recognition/ProductDetailCard.tsx`
- `src/components/admin/AISettingsPanel.tsx`
- 可能补充 `src/types/index.ts` 的 pipeline 元数据字段

完成后我会再查后端日志，确认失败点不再长时间卡在豆包联网接口，并且前端能显示到底是“联网成功”还是“因未开通联网而降级”。