## 你看到的提醒是什么意思

`Edge Function returned a non-2xx status code` 是 Supabase 客户端 SDK（supabase-js）在调用后端云函数失败时抛出的原始英文提示，字面意思是「后端函数返回了非成功状态码」。这只是个"外壳"——真正的原因（例如「请填写：XX」「截图上传失败」「活动已结束」「手机号格式不正确」等）都在响应 body 里。

代码现在的写法是：

```ts
const { data, error } = await supabase.functions.invoke('activity-apply', { body: … })
if (error || data?.error) toast.error(data?.error || error?.message || '报名失败')
```

但当后端返回 4xx/5xx 时，`data` 是 `null`，`error` 是 `FunctionsHttpError`，它的 `message` 永远就是那句英文，所以用户根本看不到我们后端精心写好的中文原因（比如这次活动领券失败大概率是「请填写：XX 必填项」或「截图上传失败」），只看到一段乱码似的英文。

后端日志确认最近 `activity-apply` 有两次 400 响应——错误确实发生在「活动报名/领券」这一步，但 body 没被读出。

## 我要做的事

### 1. 新建统一调用工具 `src/lib/invokeFn.ts`
- 包装 `supabase.functions.invoke`，当返回 `FunctionsHttpError` 时自动 `await error.context.json()` 把后端 body 里的 `error` 字段读出来；
- 网络层错误（断网、超时、CORS、`Failed to fetch`、`non-2xx status code` 等英文）映射成中文：
  - `Failed to fetch` / `NetworkError` → `网络连接异常，请检查网络后重试`
  - `timeout` → `服务器响应超时，请稍后再试`
  - `non-2xx status code` 且 body 解析失败 → `服务暂时不可用，请稍后再试`
  - 其它未知错误 → `操作失败，请稍后再试`
- 返回统一结构 `{ data, error: { message: string } | null }`，调用方只需 `toast.error(error.message)`。

### 2. 替换关键链路里直接 `toast.error(e?.message)` 的写法
重点是优惠券/活动相关页面，这是用户最容易撞见英文报错的地方：

- `src/pages/public/PublicActivity.tsx` — 活动报名（`activity-apply`）+ 手机号查券（`activity-feedback`）
- `src/pages/public/PublicClaim.tsx` — 短链领券页（`voucher-claim-status`）
- `src/pages/public/PublicClaimByPhone.tsx` — 手机号落地页（`voucher-claim-by-phone`）
- `src/components/voucher/VoucherDetailDialog.tsx` — 后台手动派券（`voucher-claim-create`）
- `src/pages/VoucherRedeem.tsx` — 店员核销（`voucher-redeem`）
- `src/components/public/ActivityFeedbackView.tsx` — 活动反馈提交

### 3. 顺手补一条 toast 文案
活动报名按钮点击后失败时，除了显示后端原因，还把按钮重置回"立即报名"，避免卡在 loading。

## 不做的事

- 不动其它 invoke 调用点（识别、营销视频、扫码登录等），它们目前的错误展示尚可，避免一次大范围回归。
- 不改后端 edge function 的业务逻辑，本次只是让前端把后端已经写好的中文原因显示出来。

## 技术细节

`FunctionsHttpError` 在 supabase-js v2 里暴露 `error.context: Response`。可以 clone 后 `.json()`：

```ts
let msg = ''
if (err?.context && typeof err.context.json === 'function') {
  try {
    const body = await err.context.clone().json()
    msg = body?.error || body?.message || ''
  } catch {/* body 不是 JSON */}
}
```

之后再走中文映射兜底。这样一次包装即可解决所有「英文 non-2xx」类报错。