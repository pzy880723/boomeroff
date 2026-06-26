# social-auto-upload worker 对接说明 v2

App 端已经按 SAU 上游协议重写,worker 端只要满足以下几个端点就可以直接用。

## 服务器侧基础设施

### 1. DNS

```
aigc.boomeroff.top  →  A  →  150.158.94.248
```

### 2. Nginx 反代 + Token 鉴权(强制)

```nginx
server {
  listen 443 ssl http2;
  server_name aigc.boomeroff.top;
  # ssl_certificate ...; ssl_certificate_key ...;

  set $sau_token "请改成一段长随机串";

  # 二维码图片本身不验,方便前端展示
  location = /getFile { proxy_pass http://127.0.0.1:5409; }

  location / {
    if ($http_x_sau_token != $sau_token) { return 401; }
    proxy_pass http://127.0.0.1:5409;
    proxy_http_version 1.1;
    proxy_set_header X-Real-IP $remote_addr;

    # SSE + 大文件
    proxy_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    client_max_body_size 200m;
  }
}
```

把这串 token 加到 Lovable Cloud 的 secret:`SAU_WORKER_TOKEN`。Edge Function 会自动带上 `X-Sau-Token`。

## App 期望的接口契约

平台代号:`1=xhs 2=wechat_video 3=douyin 4=kuaishou 5=tiktok 6=bilibili`

| 方法 | 路径 | 用途 | 返回 |
| --- | --- | --- | --- |
| GET | `/getValidAccounts` | 列所有 cookie 仍有效的账号 | `{code:200, data:[[id, type, name, avatar, status], ...]}` |
| GET | `/getAccounts` | 列所有账号(兼容老 worker) | 同上 |
| GET | `/login_qrcode?type=N` | **SSE 流**,每条 `data:` 是 JSON | 见下 |
| POST | `/upload` (multipart `file`) | 上传素材 | `{code:200, data:"<server file path>"}` |
| POST | `/postVideoBatch` (JSON) | 批量发视频 | `{code:200, data?, msg?}` |
| POST | `/postImageBatch` (JSON) | **批量发图文(待实现)** | 同上 |
| POST | `/deleteAccount?id=N` | 删账号 cookie | `{code:200}` |
| GET | `/getTaskStatus?task_id=...` | **查单任务实时状态(待实现,可选)** | `{code, data:{status,progress,url,error}}` |

### SSE 扫码事件格式(关键)

每条 SSE 消息 `data:` 字段必须是 JSON,字段:
- `step`: `qr` / `scanned` / `confirmed` / `success` / `fail`
- `qr`: 二维码图片的 base64(`data:image/png;base64,...`)或 worker 可访问的 URL,在 `step=qr` 时必传
- `account_id`: `step=success` 时回传 worker 内的账号 id
- `msg`: 失败原因(`step=fail` 时)

示例:

```
event: progress
data: {"step":"qr","qr":"data:image/png;base64,iVBORw0..."}

event: progress
data: {"step":"scanned"}

event: progress
data: {"step":"success","account_id":1234,"name":"BOOMER小店","avatar":"https://..."}
```

### `/postVideoBatch` 请求体

```json
{
  "fileList": ["<path returned by /upload>"],
  "accountList": [1234, 5678],
  "type": 3,
  "title": "标题(<=100)",
  "tags": ["夏季", "新品"],
  "category": "可选",
  "enableTimer": false,
  "videosPerDay": 1,
  "dailyTimes": [9, 14, 20],
  "startDays": 0
}
```

非 200 返回必须带 `msg` 字段说明失败原因(中文最好)。

### `/postImageBatch` 请求体(待实现)

```json
{
  "fileList": ["path1.jpg", "path2.jpg"],
  "accountList": [1234],
  "type": 1,
  "title": "<=20",
  "body": "正文/描述",
  "tags": ["..."],
  "category": "可选"
}
```

返回与 `/postVideoBatch` 一致。

## 平台覆盖

我们 UI 已经开了 5 个:抖音 / 小红书 / 视频号 / 快手 / B站。其中 B站(`type=6`)如果 worker 还没接,请告知,我们 UI 临时禁用。

TikTok(`type=5`)海外网络问题大,UI 当前隐藏。

## 风险提示

- 单视频上限 200MB(我们 Edge Function 强校验)
- 同号同 IP 短时间多次发布会触发滑块,建议 `enableTimer=true` 排期
- worker 没有鉴权 → 必须按上面 Nginx token 加 `X-Sau-Token`,否则你的账号别人也能用

## 调试 curl

```bash
TOKEN="你的 SAU_WORKER_TOKEN"
curl -H "X-Sau-Token: $TOKEN" https://aigc.boomeroff.top/getValidAccounts
```
