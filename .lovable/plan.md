# 切换到「全 reference」模式 —— 分镜静帧不再锁首帧

## 背景

目前 `render-marketing-video` 把每个分镜的 storyboard 静帧塞进 `first_frame`,同时角色板 + 段内绑定照塞 `reference_image`,触发 Seedance 2.0 的「首尾帧与参考帧互斥」拦截,首段必败。

用户实际诉求:分镜静帧只是「这一镜大概长这样」的提示,不需要锁第 0 帧 —— 这正是 `reference_image` 通道的语义。

## 修复方案(仅 `supabase/functions/render-marketing-video/index.ts`)

### 1. `resolveSegmentImages` 改为「全 reference」

不再返回 `firstImage` / `lastImage`,只返回 `referenceImages`,按优先级合并去重(Seedance 上限 4 张参考):

1. 当前镜的 **storyboard 静帧**(最强信号,排第一)
2. **角色身份板** —— 已通过火山真人认证的 `verified_asset_uri` 优先,否则 `cover_url`
3. **角色额外参考** `extra_reference_urls`
4. **段内绑定的实景照**(image_index 指向的原始素材)

取前 4 张,顺序保留(模型对第一张权重更高)。

### 2. `submitArkTask` 简化

- 移除 `firstImage` / `lastImage` 参数与 `first_frame` / `last_frame` content 块
- 只发 `text` + 最多 4 个 `reference_image`
- `mode` 标签固定为 `reference2video`(无参考时为 `text2video`)
- 删除互斥判定相关注释和分支

### 3. 降级链同步

三级安全降级改为:
- L0: 全量 reference(4 张)
- L1: 只留角色板 1 张
- L2: 纯文本

去掉「去首尾帧」这档(不再有首尾帧概念)。

### 4. meta 标记

`marketing_assets.meta.render_mode` 从 `per_shot` 升级为 `per_shot_reference`,方便后续排查老任务。

## 不动的部分

- 前端 UI、分镜面板、静帧合成流程(`storyboard-marketing-video`)、拼接、轮询均无需变动
- 分镜静帧仍然合成、仍然显示在「分镜静帧 · X/Y 张已合成」面板里 —— 只是喂给 Seedance 的通道从首帧改为参考
- `image_ref.role`(first/last/reference)字段在前端保留,但后端渲染时统一当作 reference 使用;后续如需用户手动指定"这一镜必须锁首帧",可以再加开关

## 验证

1. 重跑「惊喜一下」,确认 6 段全部 `submitArkTask` 返回 `ok:true`
2. edge function 日志确认 body 里只含 `text` + `reference_image`,无 `first_frame` / `last_frame`
3. 成片观感:镜头进入应该更自然,不再每镜开场都僵硬定格在静帧上

## 备注 · 后续可选

如果后面发现某些镜头(比如开场/收尾的品牌镜)还是希望严格锁画面,可以加一个「该镜锁首帧」的勾选 —— 勾上时该镜走 first_frame 模式,但当镜的 reference 自动清空(满足互斥)。默认全 reference。
