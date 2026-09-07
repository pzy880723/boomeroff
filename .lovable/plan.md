# ERP 授权刷新间歇超时：只读诊断结论 + 最小修复建议

只读排查，未改任何代码、权限、租约开关，未触发任何模拟身份或旧任务。

## 事实证据（时间为 UTC，括号内 CST = UTC+8）

erp-scope-sync 函数日志（同一总部账号）：

```text
23:07:21.103 (07:07)  done   applied        scope_version=1  ack=ok
23:07:48.159 (07:07)  done   lease_renewed  scope_version=1  ack=ok
23:11:33.208 (07:11)  done   lease_renewed  scope_version=1  ack=ok
23:12:01.443 (07:12)  done   lease_renewed  scope_version=1  ack=ok
23:12:36.071 (07:12)  pending  erp_timeout        <-- 你观察到的那次
23:13:01.728 (07:13)  done   lease_renewed  scope_version=1  ack=ok
23:13:36.829 (07:13)  pending  erp_timeout        <-- 第二次，同一模式
23:14:02.037 (07:14)  done   lease_renewed  scope_version=1  ack=ok
```

对应 edge 请求耗时（全部 HTTP 200，函数本身没有崩溃、没有平台级超时）：

```text
成功轮次：3986 / 4127 / 4840 / 4905 / 6008 / 6103 ms
失败轮次：9009 ms、10206 ms
```

数据库回读（未修改）：唯一被治理的映射当前 `link_status=active`、`scope_version=1`、
`sync_error=NULL`、`scope_synced_at=23:14:29`；另两条为从未接入 ERP 的历史行，未被触碰。
近 3 天该函数只有今天这 2 次 pending、6 次 done。

## 分类结论

- 不是「整体函数超时」：edge 请求都以 200 结束，耗时 9.0s / 10.2s，远低于平台上限，
  也没有 shutdown/BOOT_ERROR/CPU 超限日志。
- 不是「响应体读取被漏掉」：现有 `erpFetchJson` 用同一个 AbortController 覆盖握手 +
  `resp.text()` 完整读取，超时会统一归为 `timeout`。
- 是「拉取阶段整体超过 8 秒预算被主动 abort」：`ERP_TIMEOUT_MS = 8000`
  （`supabase/functions/_shared/erp-http.ts` + `erp-scope-sync/index.ts`），
  abort 后 `decidePullOutcome` 返回 `erp_timeout`，函数按设计只写 `sync_error`、
  不写镜像、不续租，随后仍要走 `verifier()`，所以函数总耗时 = 8s + 1~2s ≈ 9~10s，
  与观测完全吻合。
- 关键风险点：**成功轮次本身已经在 4~6 秒**。也就是说正常情况下就用掉了 8 秒预算的
  50~75%，只要腾讯侧多花 2~4 秒（冷启动、连接池新建、TLS 握手、上游抖动）就会被 abort。
  这是「边缘余量不足」，不是权限问题。
- 腾讯 nginx 无 GET authorization 记录，与「请求已到达但被客户端提前 abort」并不矛盾：
  被 abort 的连接通常记为 499 或按配置不落 access log；仅凭缺记录不能断定请求未到达。
  这一条目前**未被证实**，需要两侧联合验证（见下）。
- fail-closed 行为符合设计：单次 `erp_timeout` 即让 App 退回未同步页，下一轮 pull 成功
  自动恢复 HQ，与你在真机看到的现象一致。

## 最小修复建议（本次不实施，等你确认）

1. 先联合定位「到没到腾讯」：让 ERP 侧临时打开 `log_format` 里的 `499` 记录与
   `$request_time`/`$upstream_response_time`，并在 GO 侧对 pull 请求加一个随机
   `X-Request-Id` 头，仅用于日志比对。这是唯一能把「未到达」和「上游慢」分开的证据。
2. 分阶段计时日志（无敏感字段）：在 `erp_scope_sync_pending` 日志里补 `phase`
   （pull/ack）与 `elapsed_ms`，让后续判断不再靠推断。
3. 余量而非放宽：把 pull 超时从 8s 提到 12s，并对 `timeout`/`unreachable` 做
   **一次**立即重试（ack 不变）。这不放宽任何权限判定 —— 失败仍然 pending、
   仍然不写镜像、不续租。
4. UI 抖动收敛：连续 2 次同类网络失败才切到未同步页（或直到租约到期），
   单次抖动不弹排班。权限边界仍由 RLS/租约决定，不因此延长任何有效权限。
5. 腾讯侧长期项：确认该接口是否存在冷启动/无连接复用；启用 keep-alive 后
   4~6 秒基线应显著下降，才是根治点。

租约保持 OFF，直到 1、2 拿到证据且 3 上线验收。
