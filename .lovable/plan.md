## 只读诊断结论（未改任何代码/数据/cron）

### 日志事实（dispatch-account-login，最近 15 分钟）
```text
2026-07-30T05:55:08Z LOG booted (32ms)
2026-07-30T05:55:07Z LOG booted (25ms)
2026-07-30T05:52:06Z LOG shutdown
2026-07-30T05:52:04Z LOG shutdown
2026-07-30T05:48:46Z LOG booted (31ms)
2026-07-30T05:48:44Z LOG booted (30ms)
```
05:55Z = 13:55 CST，正是你点击的时刻。两个实例启动后**没有 shutdown、没有任何 ERROR/异常栈**——说明请求没有报错，而是仍挂在一个未完成的 await 上（函数只在请求结束后才 shutdown）。日志里没有 fetch 失败或 stream 异常。

### 卡点定位（源码 supabase/functions/dispatch-account-login/index.ts）
1. 平台归一没问题：`wechat_channels → wechat_video`，`PLATFORM_CODE = 2`（_shared/sau.ts:21-47）。
2. 鉴权/ERP 判定通过后，L100-105 先调 `sauListAccounts()` → 打到 Worker `/getValidAccounts`。**这正是 Flask 日志里唯一看到的那条请求**，说明执行确实走到了这里且 Worker 可达。
3. L107-128 依次探测 `/login?type=2` → `/login_qrcode?type=2` → `/loginQrcode?type=2` → `/account/login?type=2`。**这些 fetch 没有 timeout、没有 AbortSignal**。Flask 侧看不到 `/login`，配合函数不退出，说明连接建立后请求没有被 Flask 接受/处理（典型是 Flask 单线程/被前一条长连 SSE 占满 worker 线程，新连接停在 accept 队列），fetch 就永久 pending。
4. **UI 一直停在 connecting 的直接原因**：`send({step:"connecting"})` 写在 ReadableStream 的 `start()` 里（L149），而 stream 只有在探测循环拿到 upstream 之后才创建（L141）。所以探测阶段前端收不到任何 SSE 事件、也没有心跳/超时，只能干等——即使最终 502，也要等所有 4 个候选各自 pending 完。

### 结论
- 不是 wechat_channels 映射问题，也不是鉴权 403。
- 请求卡在「第一个 `/login?type=2` 的无超时 fetch」上；Worker 端未受理该连接（大概率 Flask 并发/长连占用），Edge Function 侧无错误日志、无 stream 异常。
- 次生问题：探测期完全静默 + 无整体超时，故障表现为“永远 connecting”。

### 建议的最小修复（等你确认后再做，本次未执行）
1. 探测每个候选路径加 `AbortSignal.timeout(8000)`，全部失败即刻返回 502 并带 tried 明细。
2. 把 SSE 流提前到探测之前建立：先推 `{step:"connecting"}` 及每 10s 心跳，探测结果再决定继续或推 `{step:"fail"}`。
3. 候选顺序按 Worker 实际实现收敛（先 `/login_qrcode`，再 `/login`），减少无效挂起。
4. 腾讯 Worker 侧需确认 Flask 以多线程/gunicorn gevent 方式运行，否则一条 SSE 长连就会堵死后续所有请求（这条属 Worker 运维，不在本项目内）。
