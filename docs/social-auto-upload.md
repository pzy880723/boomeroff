# social-auto-upload worker 接入说明

我们的 App 已经把所有多平台发布逻辑接到 `http://aigc.boomeroff.top` 这台 worker。

## 你必须做的事

### 1. DNS

```
aigc.boomeroff.top  →  A  →  150.158.94.248
```
没做这步，Lovable Edge Function 也连不上。

### 2. 强烈建议：给 worker 加一道 Header 鉴权

worker 接口本身**没有任何鉴权**，谁知道域名都能用你的账号池发视频。请在 worker 这台机器的 Nginx 上加：

```nginx
server {
  listen 80;
  server_name aigc.boomeroff.top;

  set $sau_token "请改成一段长随机串";

  # 健康检查 & 二维码图片可以不验，便于排查
  location = /getFile { proxy_pass http://127.0.0.1:5409; }

  location / {
    if ($http_x_sau_token != $sau_token) {
      return 401;
    }
    proxy_pass http://127.0.0.1:5409;
    proxy_http_version 1.1;
    proxy_set_header X-Real-IP $remote_addr;

    # SSE / 大文件 需要的设置
    proxy_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    client_max_body_size 200m;
  }
}
```

然后把这串 token 加到 Lovable Cloud 的 secret：`SAU_WORKER_TOKEN`。Edge Function 会自动带上 `X-Sau-Token` Header。

### 3. （可选但推荐）上 HTTPS

`http://` 也能跑（我们通过 Edge Function 反代），但建议用 Let's Encrypt 给 `aigc.boomeroff.top` 上证书，避免明文传输 cookie。证书装好后把上面 server 块改成 `listen 443 ssl`。

## App 这边已经做了什么（批 1）

- 数据库：`social_accounts` / `social_publish_jobs` / `social_publish_targets` 三张表 + RLS（店员只看自己门店）。
- Edge Functions：
  - `social-login-stream`（SSE 反代，扫码登录）
  - `social-account-list`（按门店列出账号 + 同步 worker 状态）
  - `social-account-delete`（解绑账号，会同步删除 worker 上的 cookie）
  - `social-asset-proxy`（把 worker 的二维码图代理成 HTTPS）
- 前端：
  - 营销中心多了「自媒体账号」入口
  - `/me/marketing/social-accounts` 账号管理页（扫码绑定 / 校验 / 解绑）

## 批 2 待实施

- 视频「一键发布 ✈️」按钮 → 发布工作台
- 后端 `social-publish-create` 把素材库视频流式上传到 worker `/upload` 再调 `/postVideoBatch`
- 发布进度弹窗（可关闭后台继续）
- 不要忘了：worker 不回执，"已提交" ≠ "已发布成功"，UI 文案要明确

## 风险点

- worker 没有鉴权 → 必须按第 2 步加 Nginx token，否则你的账号别人也能用
- 单视频文件上限 160MB
- 平台风控：同号同 IP 短时间多次发布会触发滑块/封号
- 抖音/小红书/视频号/快手以外的平台（B站、TikTok）当前 worker 不支持，UI 已隐藏

## 调试用 curl

```bash
TOKEN="你的SAU_WORKER_TOKEN"
curl -H "X-Sau-Token: $TOKEN" http://aigc.boomeroff.top/getAccounts
```
