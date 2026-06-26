# 发布服务器(SAU worker)接入问题诊断

## 1. 网络层是通的 ✅
从 Lovable 沙箱直接 `curl http://aigc.boomeroff.top/getAccounts`:
- DNS 解析正常 → `150.158.94.248`
- HTTP 200,返回 `{"code":200,"data":[],"msg":null}`
- Nginx (`nginx/1.24.0 Ubuntu`) 已挂上,CORS `Access-Control-Allow-Origin: *` 也开了

所以"连不到"**不是 DNS / 防火墙 / 端口问题**。

## 2. HTTPS 不能用 ⚠️(次要)
访问 `https://aigc.boomeroff.top/` 返回的证书 `CN=admin.boomeroff.top`,SAN 里没有 `aigc.boomeroff.top`,所以 TLS 握手会被浏览器/Edge 拒。
现在我们走的是 `http://`,Edge Function 反代到客户端是 https,能跑,但 cookie/二维码明文传输。建议给 `aigc.boomeroff.top` 签个独立证书或加到 SAN。

## 3. 真正的 bug:`/login` 的 SSE 不是 JSON ❌
我直接 `curl -N "http://aigc.boomeroff.top/login?type=3&id=shop_test_main"`,服务器返回的 SSE 帧是这样:

```
data: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAg...
```

也就是直接把**二维码 data URL** 塞进了 `data:` 字段。

但是我们 Edge Function (`supabase/functions/social-login-stream/index.ts`) 和前端 (`AddSocialAccountDialog.tsx`) 都期待 JSON:

```ts
// Edge Function
try { payload = JSON.parse(json); } catch { continue; }   // ← 直接被吞掉
if (payload?.status === "qrcode" && typeof payload?.image === "string") { ... }

// 前端
const p = JSON.parse(ev.data);
if (p.status === 'qrcode') { setStatus('qrcode'); setQr(p.image); }
```

→ 结果:每一帧都 `JSON.parse` 失败被 `continue` 掉,前端永远收不到 `status:'qrcode'`,过几秒上游断流 `onerror` 触发,UI 报"连接中断,请重试"。**这就是你看到的"连不到发布服务器"的真实原因。**

同时 Edge Function 里那段把 `?filename=xxx.png` 改写成 `social-asset-proxy` 的逻辑也作废了 —— worker 根本没用 `/getFile?filename=...` 这种格式,直接给的 base64。

## 你要问服务器端 AI 的问题(直接抄给他)

> 我们的 Edge Function 期望 `/login` 的 SSE 每帧是 **JSON**,形如:
> ```
> data: {"status":"qrcode","image":"/getFile?filename=xxx.png"}
> data: {"status":"waiting","message":"等待扫码"}
> data: {"status":"success","account":{...}}
> data: {"status":"error","message":"..."}
> ```
> 但实际抓到的格式是 `data: data:image/png;base64,....`,不是 JSON,也没有 status 字段。请确认:
>
> 1. `/login` 当前 SSE 协议字段定义是什么?是否有 status / message / success / error 事件?能否切回 JSON?
> 2. 如果坚持发 data URL,**扫码成功怎么通知客户端**?现在 stream 直接断,我们无法知道 success 还是超时。
> 3. `/getAccounts` 和 `/getValidAccounts` 返回 `data` 数组里每行的字段顺序是不是 `[id, platformType, ?, accountName, status]`?status==1 表示 cookie 有效对吗?
> 4. `/upload` 返回体的成功字段名是 `data` 还是 `path` / `file`?我们三种都试了。
> 5. `/postVideoBatch` 接受哪些参数?定时(timer) 和 多平台分组 怎么传?是否同步返回成功失败,还是需要轮询?
> 6. worker 的 Nginx 是否开了 token 鉴权?现在 Lovable 这边 `SAU_WORKER_TOKEN` secret 没设,我直接裸调 `/getAccounts` 也通,说明没开。要开请告诉我 token,我把 secret 加上。
> 7. HTTPS:`aigc.boomeroff.top` 现在的证书 CN 是 `admin.boomeroff.top`,匹配不上。能否给 aigc 子域名单独签证书 / 加 SAN?

## 我这边等服务器端答复后要改的代码

- 如果协议改回 JSON:不用动代码,直接能跑。
- 如果协议保持 data URL:改 `social-login-stream/index.ts` 的解析逻辑 —— 把 `data:image/...` 帧识别成二维码、把后续约定字符串(如 `success`/`login success`)识别成成功事件。
- 同步更新 `_shared/sau.ts` 里 `/getAccounts` 行的字段索引,如果服务器端确认顺序不同。

## 自检建议

加一个临时的 `social-debug` Edge Function,把 worker `/login` 前 20 帧原样回传给前端,方便后续抓格式;协议确认后再删。
