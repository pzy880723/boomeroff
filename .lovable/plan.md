# 修复 render-marketing-video「Failed to fetch」+ 重构 Boomer 帮我拍 流程

## 一、先解决眼前这个报错

**根因**：前端把整张完整脚本（含每段 600 字符的 storyboard 签名 URL + 全量 image_urls）通过 body POST 给 `render-marketing-video`，payload 体积大 + 函数冷启动，浏览器侧直接 `Failed to fetch`。

**修法（最小改动）**：
1. 前端 `MarketingVideo.tsx` / `surpriseJob.ts` 调用 `render-marketing-video` 时，**只传 `job_id`**（脚本已经存在 `marketing_video_jobs.script` 里），由后端自己 select 出 script，避免重复传几十 KB。
2. 后端 `render-marketing-video/index.ts` 兼容两种入参：
   - 旧：`{ script, ... }` 直传（向后兼容）
   - 新：`{ job_id }` → 从 DB 读 script、character、shop_id
3. 给 fetch 加 30 秒超时 + 一次自动重试，前端 toast 显示「网络抖动，已重试」。
4. 增加一行 `console.log("[render] received job", job_id)` 在函数入口，便于以后看日志确认请求到没到。

## 二、重构「Boomer 帮我拍」流程（按你提的顺序）

目前是：随机挑素材 → 拿素材让 AI 写脚本 → 渲染。问题：脚本被素材绑架，主角不连贯。

**新流程（脚本驱动 → 标签选素材 → 人物分镜）**：

```text
1. 脚本草稿 (LLM)
   输入: 店铺画像 + 主题(自动选 or 用户输) + 时长 + 画风
   输出: scenes[],每段含:
     - subtitle/dialogue/scene/action
     - needed_tags: ["货架","试穿","特写","门头"...]  ← 新字段
     - needs_character: true|false                    ← 新字段
     - shot_type: "wide|medium|closeup|product"

2. 主角选定
   marketing_characters 表里按 auto_anchor 优先 + 随机挑 1 位 → 锁定全片

3. 标签匹配素材  (Edge: pick-assets-by-script)
   for each scene with needs_character=false:
     在 marketing_assets 里按 needed_tags 命中度排序,取最高
   for each scene with needs_character=true:
     → 标记为「需要生成人物分镜」,后面 storyboard 阶段处理

4. 人物分镜静帧 (storyboard-marketing-video,已存在,小改)
   for each needs_character 镜头:
     用 角色参考图 + 该镜 needed_tags 命中到的场景素材
     Gemini image-edit 合成「主角在该场景做该动作」的静帧
   for each 非人物镜头:
     直接用素材库挑到的图作为 first_frame

5. 渲染 (render-marketing-video)
   每段都有 first_frame:
     - 人物段 → 合成静帧(主角一致)
     - 空镜/产品段 → 素材库原图
   character 信息全程跟随,确保主角不变

6. UI 反馈
   SurpriseVideoDialog 顶部:
     主题 chip · 主角 chip(头像+名字) · 模型 · ETA
   分镜卡新增标签徽:
     [人物镜] / [素材:tag1·tag2] / [合成中]
```

## 三、改动清单（技术细节，按文件）

### 后端
- `supabase/functions/generate-marketing-video-script/index.ts`
  - 给每个 scene 强制输出 `needed_tags`(2-4 个)、`needs_character`(boolean)、`shot_type`
  - prompt 里说明: 「先确定故事,再描述需要什么样的画面,不要被现有素材绑架」
- `supabase/functions/_shared/pick-assets-by-tags.ts` (新)
  - 输入: shop_id, needed_tags[], exclude_ids[]
  - 输出: 命中度最高的 asset(按 tags ∩ 数 + 最近上传时间)
- `supabase/functions/surprise-marketing-video/index.ts`
  - 流程顺序改为: 先生成脚本(无图)→ 选主角 → 按 needed_tags 配图 → 写回 script.scenes[].image_url + image_binding
- `supabase/functions/storyboard-marketing-video/index.ts`
  - 对 `needs_character=true` 镜头,把素材图 + 角色参考图一起喂给 Gemini image-edit,promot 强调「保持主角五官一致 + 还原场景」
- `supabase/functions/render-marketing-video/index.ts`
  - 接受 `{ job_id }` 入参(见第一部分)

### 前端
- `src/pages/marketing/MarketingVideo.tsx` & `src/components/marketing/SurpriseVideoDialog.tsx`
  - 分镜卡片增加标签徽:`<Badge>人物</Badge>` / `<Badge>tag</Badge>`
  - 调用 render 时只传 `job_id`
- `src/lib/surpriseJob.ts`
  - 持久化新增字段:`character_id`、`theme_tag`、每段 `needed_tags`

## 四、关于「品牌 logo 字体」(上一轮你提到)

这一项独立拆出来，等你回答 logo 资产是要我生成还是你提供后再做，不在本次 PR 里。

## 五、不在本次改动里的事

- 不动 marketing_assets 表结构(已有 tags 字段)
- 不动 stitchVideos.ts(单段 15s 流程已经不走拼接)
- 不动 AI 自定义视频的手动选图路径(那条流程用户自己挑,不需要标签匹配)

## 六、风险

- needed_tags 命中不到 → 回退到随机挑同 shop 任意素材,toast 提示「该镜没找到完全匹配的素材,已用近似图」
- Gemini image-edit 合成人物可能仍有走形 → 走「角色参考图作为 reference_image」兜底,不阻塞渲染
