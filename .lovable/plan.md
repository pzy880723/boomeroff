# 品类生成失败：生产诊断报告（只诊断，不修改）

## 1. 最近失败的直接证据

- 后端 Edge Function 日志：`surprise-script-job` 与 `surprise-marketing-video` 在保留窗口内 **查不到任何日志**（含 error/boot），说明近期这两支函数几乎没有被成功调用到，或日志已随昨天的数据库/网关故障丢失。函数本身在线：无 token POST 返回 `401 {"ok":false,"error":"未授权"}`（0.95s）。
- 数据库中最近 10 天只有 4 条 `video_generation_jobs`，**没有任何一条 status=failed**：

| 创建时间(UTC) | scope | status | stage | error_message |
|---|---|---|---|---|
| 09-01 02:12 | all | done | completed | 无 |
| 08-31 08:33 | music | done | completed | 无 |
| 08-31 02:35 | (无) | done | completed | 无 |
| 08-30 11:27 | (无) | script_ready | script_ready | 无 |

- 失败记录查不到不代表没失败：`surprise-script-job` 的 `clearFailedDrafts()` 会在**下一次点击“开始写脚本”时物理删除**该用户该门店所有 `status=failed` 的 surprise 草稿。用户点第二次生成时，第一次失败的 `error_message` 就永久消失了。这是当前无法给出“最近一次失败精确时间/HTTP 状态”的根本原因。
- 因此：**shop_id 已确认为 `0d2fdb41-2c16-469e-aee7-c976dc2edec9`（唯一在用门店），但精确失败时间、content_scope、HTTP 状态与 error_message 已被系统自身清除，不可追溯。**

## 2. 失败落在哪一步（已用数据复现判定）

失败不在建任务、不在门头识别、不在 DeepSeek、也不在 `validateSurpriseScript`，而在 **竖版素材筛选 + 品类筛选的交叉处**。

该门店 54 张真实上传照片的实测统计：

| 指标 | 数量 |
|---|---|
| photo 素材总数 | 54 |
| 已缓存尺寸（meta.image_width） | **12** |
| 判定为竖版 portrait | 12 |
| 竖版且命中「瓷器餐具」关键词 | **0** |
| 竖版且命中「唱片音响」关键词 | **0** |
| 竖版且命中「首饰配饰」关键词 | **0** |
| 竖版且命中「玩具公仔」关键词 | 4 |

链路成因：

```text
surprise-marketing-video
  pool(54) → prepareAssetsForVideoAspect(9:16)
      循环里每探测一批 12 张就检查一次：
      portraitReady >= 9 且已找到门头 → break
      → 只探测了前 12 张，其余 42 张尺寸未知
  selectAssetsForVideoAspect 丢弃尺寸未知的素材 → pool = 12
  resolveStorefrontAsset 命中门头 → remainPool = 11
  filterAssetsForSurpriseContentScope(ceramics/music/accessories) → 0
  → HTTP 409 "当前门店没有识别到“瓷器餐具”竖版实景素材…"
```

`surprise-script-job` 收到 409 后在 `runScriptGeneration` 的 catch 中把任务写成 `failed`，前端显示失败；用户再点一次，`clearFailedDrafts` 把这条证据删掉。**这与用户“切品类后必失败、全品类/玩具能成功”的现象完全吻合**（09-01 的 `all` 与 08-31 的 `music` 成功，是当时缓存到的 12 张恰好覆盖到）。

## 3. 生产部署是否包含 category-first 逻辑

包含。本地 HEAD = `ce9bb273`，工作区干净；仓库中 `surprise-script-job/index.ts` 第 382–401 行确有 `resolveSurpriseContentScope(body.content_scope)`，并把 `content_scope` 写入 `source_pick_json.content_scope`、`meta.content_scope`，再透传给 `surprise-marketing-video`。数据库侧亦有实证：08-31 的任务 `source_pick_json->>'content_scope' = 'music'`，证明线上函数确实是含 category-first 逻辑的版本（早于 `ce9bb273` 的部署已包含该链路，`ce9bb273` 本身只改手机登录）。**问题不是版本没同步。**

## 4. 建议的最小修复点（本轮不执行）

1. `surprise-marketing-video` 的 `prepareAssetsForVideoAspect` 早停条件：当 `content_scope !== 'all'` 时，早停应改为「已找到门头 **且** 命中该品类的竖版素材 ≥ 3」，否则继续探测剩余批次。这是唯一必需的改动。
2. 兜底：品类竖版为 0 时，先对**该品类关键词命中的全部素材**（不论是否已知尺寸）补探一次尺寸，再判 409；仍为 0 才返回提示。
3. 可观测性：`clearFailedDrafts` 改为只清理 24 小时前的 failed 草稿，或删除前把 `error_message`/`content_scope` 落到一张审计表，否则失败永远无法复盘。
4. 建议顺带补一次全量尺寸回填（54 张里 42 张无尺寸），可显著降低首次生成耗时与 409 概率。
5. 关键日志缺失也应补：`surprise-marketing-video` 在返回 409 前打印 `shop_id / content_scope / pool / portrait / scoped` 计数。

不涉及数据库结构、前端布局与 DeepSeek 提示词。
