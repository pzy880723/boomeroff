# 惊喜一下 DeepSeek 更新交接

## 同步代码

```text
main
```

功能已合并到 GitHub `main`，Lovable 直接同步主分支最新提交即可。

## 必须配置的 Secret

在 Lovable / Supabase Edge Function Secrets 中配置：

```text
DEEPSEEK_API_KEY=<DeepSeek API key>
```

可选：

```text
DEEPSEEK_SCRIPT_MODEL=deepseek-v4-pro
```

不要把密钥写入 `.env`、前端代码或 Git。若未配置 `DEEPSEEK_API_KEY`，代码会保守回退到原 Lovable AI 通道，避免线上功能直接中断。

## 需要重新部署的 Edge Functions

- `generate-marketing-video-script`
- `surprise-marketing-video`
- `render-marketing-video`（共享提示词模块发生变化，需要一并重新部署）

## 验收

1. 打开「惊喜一下」生成脚本。
2. 确认人物年龄会在青年、中年、老年之间变化，不再因“中古/老物件”固定为老人。
3. 确认 7–8 月不会自动出现“暑假”。
4. 确认页面显示五段非空对白和字幕。
5. 确认总口播 90–100 个汉字，五段连接后与连续口播全文一致。
6. 生成视频后确认 0.1 秒内开口、切镜不断声、画面跟随对应对白。
