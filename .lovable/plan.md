## 问题诊断

素材库视频详情里「下载视频」按钮点击没反应,根因基本可以定位:

视频文件托管在火山方舟 / Supabase Storage 的 CDN 上,跨域响应头不允许浏览器端 `fetch()` 直接读取二进制流。当前 `downloadVideo()` 走的是:

```
fetch(asset.output_url) → blob() → <a download>
```

在发布后的 `boomeroff.lovable.app` 域名下,跨域 fetch 会被 CORS 直接拒掉并抛异常,进入 catch 后虽然有 `window.open` 兜底,但浏览器对火山的 mp4 直链多半会内联播放而不是触发下载,看起来就是"点了没反应"。另外 `<a download>` 属性对跨域链接也会被浏览器忽略。

## 修复方案

### 1. 新增后端代理下载 Edge Function `download-marketing-asset`
- 输入:`asset_id`(校验 RLS / shop 权限,避免被人当公共代理用)
- 在服务端 fetch 远端视频流,设置:
  - `Content-Type: video/mp4`
  - `Content-Disposition: attachment; filename="boomer-<id>.mp4"`
  - `Cache-Control: private, max-age=0`
  - 标准 CORS 头
- 用 `ReadableStream` 透传,不在内存里缓存整段视频,避免大文件 OOM
- 同时支持图片素材(自动按 mime 透传)

### 2. 前端 `AssetDetailDialog.downloadVideo()` 改造
- 优先调用 `supabase.functions.invoke('download-marketing-asset', { body: { asset_id } })` 拿到 blob
- 用 blob URL 触发 `<a download>`,保证文件名为 `boomer-视频-<日期>.mp4`
- 失败时:
  - 先尝试老路 `fetch(output_url)` (Supabase Storage 自家文件其实是允许的,不用浪费代理调用)
  - 再失败才 fallback 到 `window.open(..., '_blank')` 并 toast 提示"请长按保存"
- 下载过程显示 Loader 与进度提示,避免用户以为"点了没反应"
- 文案复制逻辑保留(成功下载后一并复制)

### 3. 图片素材的下载按钮同步修复
当前图片用的是 `<a href download>`,跨域同样失效。统一改走代理函数,行为与视频一致。

### 4. 验证
- 在预览域名 (`id-preview--…`) 和发布域名 (`boomeroff.lovable.app`) 下分别点击「下载视频」,确认能拿到 mp4 文件且文件名正确
- 看 Network 面板:第一次走 edge function,响应头带 `Content-Disposition: attachment`
- 控制台无 CORS 报错

## 不动的部分

- 视频生成/分镜/文案生成等逻辑全部保持不变
- 数据库 schema 不动
- 「复制链接」按钮保留原样(就是给用户复制原始 URL 用的)

## 技术细节(给开发参考)

- Edge function 用 `Deno.serve` + `fetch(remoteUrl)` + `new Response(remoteResp.body, { headers })`,流式转发
- 鉴权:复用 `supabase.auth.getUser()` 校验调用者,再查 `marketing_assets` 限定 `shop_id` 在用户可见范围内
- 大文件:Supabase Edge Function 单次响应上限约 6 MB? 否则要直接返回签名 URL 让前端跳转。先实测,如果命中限制,改为后端生成一个短期 signed URL + `?download=filename.mp4` 参数,Supabase Storage 支持 `download` query 强制 attachment
- 实际上 Supabase Storage 公开桶 URL 加 `?download=boomer.mp4` 就能强制下载头,**如果视频实际存的是 Supabase Storage(不是火山外链),这一招就够,不需要 edge function**。需要先 view `meta.storage_path` 与 `output_url` 来源确认走哪条路
