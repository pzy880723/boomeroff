## 「惊喜一下」升级:出完整脚本 + 分镜头 + 每镜配图

### 现在的问题
- 弹窗只展示一张封面 + "中古好物"占位标题,信息量太少。
- 没生成脚本,用户不知道这条 15 秒视频到底拍什么、说什么。
- "标题/内容"字段其实是素材的 meta,不是视频内容,容易误导。

### 目标
点开"惊喜一下",BOOMER 直接出一份**可拍摄的完整脚本**:
- 1 个钩子镜头 + 2–3 个中段镜头 + 1 个收尾镜头(总时长 15s,9:16)
- 每个镜头都绑定一张**素材库里真实存在的实景商品/店铺图**(因为是实体店,必须用真实素材,不凭空生成)
- 每镜显示:画面缩略图 + 场景描述 + 镜头动作 + 口播/字幕 + 时长
- 顶部仍然展示:路线/风格/主角 tag,但去掉误导性的"中古好物"标题块

### 改动点

**1. `surprise-marketing-video` edge function**
- **挑多张素材而不是一张**:按 vtype 在素材库里加权挑 3–5 张图(主图权重最高,其余作分镜补充);全部来自该店铺 `marketing_assets` (kind=photo),真实实景。
- **preview 模式也生成脚本**:复用现有 `generate-marketing-video-script`,把所有挑出的图喂进去(`image_urls` + `image_descriptions`),让 AI 把每个 scene 的 `image_index` 绑到合适的素材上。
- 返回结构升级:
  ```
  {
    picked: {              // 主图(仍作为封面展示)
      asset_id, cover_url, summary, tags, category
    },
    assets: [              // 本次入选的所有素材,带原始 url/描述
      { asset_id, url, summary, category }
    ],
    script: { hook, scenes[], outro, total_duration, ... },  // 完整脚本
    vtype, vtype_label, style, character, duration: 15, aspect: '9:16'
  }
  ```
- 正式提交(preview=false)时:复用同一份 script 调 `render-marketing-video`,不再二次生成,**避免预览和实际渲染不一致**。
- "换一组":重新挑素材 + 重新生脚本(整体洗牌)。

**2. `SurpriseVideoDialog.tsx` 重做内容区**
- 顶部:封面缩略 + 9:16·15s 角标 + 路线/风格/主角三个 chip(去掉"中古好物"那行无意义标题)。
- 中部:**分镜头时间线**(滚动列表),每条:
  ```
  [缩略图]  钩子 · 0–2s
            场景:店门口暖光招牌特写
            动作:手推门,镜头跟进
            口播:"东京下北泽淘到的小秘密"
  ```
  视觉上参考 MarketingVideo 里现有的 SegmentPreview / SceneRow 风格(已有组件可借鉴 UI 语言)。
- 底部按钮不变:`换一组` / `就拍这条`。
- 加载态文案改成"BOOMER 正在挑素材、写脚本…"(因为现在确实更慢一点,3–8s)。
- 提交后过渡页保持不变(去素材库等渲染)。

**3. 文案细化**
- 去掉 dialog 里 "中古好物" 这一类占位标题,改成统一的小标题"BOOMER 拟好的脚本"。
- 每镜下方加一行小灰字:"实景素材来自你的素材库",强调实拍属性。

### 不动的部分
- 数据库 schema、`render-marketing-video`、`poll-marketing-video`、`MyMarketing.tsx` 入口卡、`marketingSegments.ts`。
- 9:16 / 15s / 调性映射 / 角色 50% 概率等业务规则。

### 验收
- 打开"惊喜一下",3–8s 内出现:封面 + 完整脚本(钩子+2–3 中段+收尾),每镜都有缩略图、动作、口播、时长。
- "换一组"会同时换素材组合和脚本。
- "就拍这条" → 入队 → 去素材库能看到对应视频,内容跟预览的脚本一致。
- 没有任何镜头使用素材库以外的图。
