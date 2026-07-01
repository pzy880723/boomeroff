## 目标

把腾讯云 COS 上传/HEAD/LIST 的域名从直连上海换成**全球加速域名**，让境外 Serverless 节点跨境上传走腾讯云骨干网，图片视频备份速度显著提升。

## 改动范围（只改 1 个文件 + 1 个可选环境变量）

### 1. `supabase/functions/_shared/tencentCos.ts`
- 修改 `cosHost(cfg)`：
  - 优先读取新环境变量 `TENCENT_COS_ACCELERATE`（值为 `true` 时启用）。
  - 启用时返回 `${bucket}.cos.accelerate.myqcloud.com`。
  - 未启用时保持原样 `${bucket}.cos.${region}.myqcloud.com`（保底可回退）。
- `cosPutObject` / `cosHeadObject` / `cosListPrefix` / `signCos` 不用改——签名算法只跟 pathname 有关，跟 host 无关，全球加速域名兼容 v5 签名。

### 2. 新增运行时 secret（用 add_secret）
- `TENCENT_COS_ACCELERATE = true`
- 想临时关掉时把它删掉即可，无需改代码。

### 3. 前端 `BackupPanel.tsx`
- 面板顶部提示语加一行小字："已启用腾讯云全球加速上传"，让你能一眼看到当前走的是加速通道。

## 不改的地方

- `TENCENT_COS_REGION` 保留为 `ap-shanghai`（签名/日志/文档都还需要它，加速域名不带 region 只影响传输路径）。
- SecretId / SecretKey / Bucket 名 全部不动。
- 已上传成功的文件不受影响，桶内容一致。

## 验证

1. 部署后进入 `/portal → 数据备份`，点"只重试失败文件"。
2. 观察那 100 个超时文件是否能在几秒内补传成功。
3. Edge Function 日志里 URL 应显示 `cos.accelerate.myqcloud.com`。
4. 若某种网络下加速反而更慢，删掉 `TENCENT_COS_ACCELERATE` 即可回退到直连上海。
