## 为什么 6 个全失败、而且只用了 2 秒

我查了网关日志(`function_edge_logs`),你这次「一键预检」**6 次调用全部返回 404**,而且全部停在 `OPTIONS` 这一步:

```
OPTIONS | 404 | .../functions/v1/character-preflight   ×6
```

意思是:浏览器发 CORS 预检的时候,边缘网关说"找不到 `character-preflight` 这个函数"。这是新建的 edge function **还没完成首次部署/路由生效**(Lovable 自动部署有几十秒~一两分钟的传播窗口),所以根本没跑到我写的 `softPassFaceImage` 那一步——这也是为什么 2 秒内 6 个全挂、并且 `edge_function_logs` 里 `character-preflight` 一条业务日志都没有。

## 流程是不是合理 —— 不太合理,有两个真问题

1. **前端把一次"批量预检"拆成了 6 个独立 HTTP 调用**(`for` 循环里逐个 `invoke`),每个都要付一次冷启动 + CORS 预检的代价。函数 server 端我设计的时候是支持一次最多 50 个 id 的(`character_ids.slice(0, 50)`),前端没用上。
2. **失败提示太粗暴**:`Failed to send a request to the Edge Function` 这种 `FunctionsHttpError` 没翻译成"函数刚部署还没生效,过 30 秒重试",用户看到的就是 6/6 全失败,以为是"我的角色都不行"。

## 改动计划(只改前端 + 函数内部并发,不动数据)

### A. 前端:一次 invoke 跑全部
- `BatchPreflightButton.tsx`:删掉 `for` 循环,改成**一次** `supabase.functions.invoke('character-preflight', { body: { character_ids: pending.map(c=>c.id) } })`。
- 进度条由"已 invoke 几次"改成"服务端返回的 results 数 / 总数",更准。
- 大于 50 个时按 50 一批分批调用(目前店里只有 6 个,基本一次就够)。

### B. 前端:错误说人话
- 在 catch 里识别 `FunctionsHttpError` / 状态码 404 / `Failed to send a request`,toast 提示:
  > "预检函数刚部署、还在生效,请等 30 秒后再点一次。" + 一个「30 秒后自动重试」的倒计时按钮。
- 单个角色失败时,把后端返回的 `error` 字段(比如 "fetch source image failed: 403"、"upload soft-pass failed: ...")直接显示在「重试失败 (N)」展开的小列表里,而不是只给一个数字。

### C. 函数:服务端并发 + 软超时
- `character-preflight/index.ts` 把 `for` 顺序处理改成 `Promise.allSettled`,并发上限 5(避免一次性把 imagescript 跑爆内存)。
- 每个 id 加 25 秒软超时,超时则记为 `failed: 'soft pass timeout'`,继续处理下一个,绝不让整批因为一张图卡死。
- 在最外层加一条 `console.log('[character-preflight] start ids=…')`,这样下次再失败,`edge_function_logs` 里就能直接看到分布。

### D. 立刻验证
- 改完后,先用 `supabase--curl_edge_functions POST /character-preflight` 带一个真实 `character_ids` 试一下,确认 200,再回到 UI 点「一键预检」复测。

## 技术细节
- 现存 6 个未认证角色的 `cover_url` 有 5 个是 `product-images` 公开桶(可直接 fetch),1 个是 `marketing-videos` 的 sign URL(`642560da…`),已经在 24h 有效期内,后端可以直接 fetch。所以问题**不是 cover 失效**,纯粹是函数还没生效。
- 这次改动不动 `_shared/face-gateway.ts`、不动 `marketing_characters` 表结构、不动 RLS。
- `face_pass_level` 持久化 & `VideoJobDetailPanel` 已经做完,本次只补"批量预检"的可靠性。
