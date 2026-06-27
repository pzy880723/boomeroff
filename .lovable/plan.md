## 目标

1. 「帮我拍 / 惊喜一下」每次都把 9 张参考图塞满，让 Seedance 有更多素材自己思考。
2. 缩短脚本台词字数，避免 15 秒被塞太满、AI 念糊。

---

## 改动 1：参考图固定 9 张封顶

文件：`supabase/functions/surprise-marketing-video/index.ts`

- 把 `ASSET_SLOT_FOR_SCENES` 由 7 改为按「9 - 已占用槽位」动态计算：
  - 门头占 1 张（命中时）。
  - 角色板 `cover_url` 在 `render-marketing-video` 里会作为额外参考图注入，预留 1 张。
  - 所以实景目标 = `9 - (storefront?1:0) - (character?1:0)`，并和 `remainPool.length` 取小。
- `targetCount` 改为 `Math.min(remainPool.length, 9 - usedSlots)`，下限 3。
- 池子素材不够 9 张时按现有数量拿（不报错、不阻塞）。
- 前端 `SurpriseVideoDialog.tsx` 横排不用改，已经按返回的 `assets` 长度铺。

## 改动 2：脚本台词减字、留白优先

文件：`supabase/functions/generate-marketing-video-script/index.ts` 中 `viralBlock`（只动洗脑探店分支，不影响其它视频类型）。

调整以下硬约束：

- 每镜 `dialogue`：从「10-20 字」改为「6-10 字，可留空」。
- 全片 `dialogue` 总字数：从「80-110 字」改为「45-65 字」，并明确「宁可留白也不要塞满，留 2-3 镜纯画面 + 字幕」。
- 中段 `scenes` 数量：从「5-7 段」改为「4-6 段」，每镜 `2-3 秒`（之前 1.5-2.5 秒），给口播留呼吸。
- 新增一条硬规则：「台词必须能在该镜 `duration_s` 内自然念完（按 4 字/秒估算），超出就删字或改成字幕」。
- `subtitle` 上限保持 24 字不动（字幕快读没问题，主要卡住的是口播）。

同时在 sanitize 阶段把 `dialogue` 的 `max` 由 60 收到 14，硬截断防止模型不听话。

## 不动的部分

- Seedance 2.0 渲染、`reference_image` 通道、`one_shot` 策略、门头锁开场、节日借势逻辑全部保持。
- 非「洗脑探店」的脚本生成路径（自定义视频等）不受影响。

## 技术细节

- `SEEDANCE_MAX_REFS = 9` 已存在于 `_shared/seedance-models.ts`，无需改动。
- `render-marketing-video` 在拼参考图时会自动用 `character.cover_url + extra_reference_urls + image_urls` 合并后截前 9 张，所以后端「实景预留 7」的旧算法在有角色板时实际只送 8 张进 Seedance —— 这次按「实槽位 = 9 - 已用」修正后就能稳定打满 9。
- 台词长度收紧后，`generate-marketing-video-script` 内的等比缩放逻辑不变，总时长仍约 15 秒。
