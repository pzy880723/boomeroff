
## 功能定位（你的口头表达 → 产品语言）

你的原话："我刚刚为什么要随意生成一段视频" —— 翻译成产品场景就是：

> 店员/店长没灵感、懒得一步步配脚本，又想发点新内容到中古圈/短视频平台。点一下，系统自动从这家店的素材库里挑商品，按店铺调性写脚本、选风格，直接出一条 15 秒竖屏小视频。

定位为 **"快速产出 / 灵感激发"** 入口，而不是替代现在的精细化分镜流程。

### 文案 & 命名（建议默认值，可在 build 阶段微调）

- 主按钮：**「惊喜一下」** （副标题：随机给我来一条 15s 竖版视频）
- 入口卡片标题：**"没灵感？让 BOOMER 替你拍一条"**
- 入口卡片说明：**"自动选品 · 自动写脚本 · 自动配画面，30 秒内拿到一条 9:16 / 15s 的推广视频"**
- 生成中状态：**"BOOMER 正在你的素材库里翻找灵感…"** / **"在写脚本…"** / **"在生成画面…"**
- 完成提示：**"惊喜出炉，喜欢就一键分享到中古圈"**
- 不满意的二次按钮：**「再来一条」**（保留同一商品换风格）/ **「换个商品再来」**（重新随机选品）

## 入口位置

1. `/marketing` 营销首页：在现有"AI 文案 / AI 图 / 视频"卡片旁，新增一张 **"惊喜一下 · 随机视频"** 卡片，主 CTA。
2. `/marketing/video` 页面顶部：加一个轻量的 **「✨ 惊喜一下」** 小按钮，等价于"跳过所有配置，直接随机"。

## 用户流程

```text
点「惊喜一下」
  → 弹出 1 个轻量确认弹窗（展示这次随机到的：商品封面 + 风格标签 + 视频路线，2 秒倒计时自动开始，也可点"换一组"重摇）
  → 后台串行执行：随机选品 → 生成脚本 → 渲染视频
  → 完成后跳到结果页（复用现有 MarketingVideo 结果区），带"再来一条 / 换商品 / 分享到中古圈 / 保存到素材库"
```

不让用户填任何字段。所有参数都由系统按规则随机 + 按店铺调性匹配。

## 随机规则（核心业务逻辑）

读取当前 `shopId` 对应的 `shop_marketing_profiles`（selling_points / tone / target_audience / 选品风格）作为"调性锚点"，不可被随机覆盖。其余字段在白名单中随机：

| 字段 | 取值来源 | 随机策略 |
|---|---|---|
| 商品 | `marketing_assets`（当前店铺 / 最近 90 天 / 有封面图）| 加权随机：未用过 > 用过；高赞 > 普通；排除已下架 |
| 视频路线 vtype | `VIDEO_TYPES` 现有 4 种 | 根据商品类型轻微加权（如服饰→product_showcase，杂货→store_ambience）|
| 风格 style | `STYLES` 现有 6 种 | 与店铺 tone 做映射表过滤后再随机（如 tone=高冷→elegant/steady；tone=年轻→playful/lively）|
| 时长 | 固定 **15s** | 不随机 |
| 比例 | 固定 **9:16** | 不随机 |
| 角色出镜 | 50% 概率使用店铺已有 `marketing_characters` 默认角色，50% 纯产品镜头 | |
| 镜头数 | 15s ≈ 3 段，每段 5s | 由现有 `planSegments` 处理 |

## 技术实现

### 1. 新增 edge function：`surprise-marketing-video`

职责：服务端一次完成 **选品 + 脚本生成 + 投递渲染任务**，避免多次 round-trip。

```text
POST /functions/v1/surprise-marketing-video
body: { shop_id, exclude_asset_ids?: string[] }   // exclude 用于"再来一条"

步骤:
  1. 读 shop_marketing_profiles → 拿调性
  2. 读 marketing_assets（filter shop, has cover_url, not in exclude）→ 加权随机选 1 个
  3. 读 marketing_characters → 50% 取默认角色
  4. 服务端按映射表选 vtype + style
  5. 调 generate-marketing-video-script（duration=15, aspect=9:16, 注入随机参数 + 调性）
  6. 调 render-marketing-video（带 first_frame = 商品封面, reference_image = 角色封面）
  7. 返回 { job_id, picked: { asset, character, vtype, style } }
```

### 2. 前端

- `src/components/marketing/SurpriseVideoCard.tsx`（新）：营销首页入口卡片。
- `src/components/marketing/SurpriseDialog.tsx`（新）：摇号确认弹窗，含"换一组"按钮（前端重新触发选品，但走 edge function 的 dry-run 模式 `?preview=1` 只返回 picked 不渲染）。
- `MarketingVideo.tsx`：
  - 顶部加 `✨ 惊喜一下` 按钮 → 直接调 edge function，拿到 job_id 后复用现有 `poll-marketing-video` 轮询逻辑展示进度和结果。
  - 结果区追加 **「再来一条」/「换个商品再来」** 两个按钮。

### 3. 不动的东西
- 不改数据库 schema（job 表已有 `meta` jsonb，把 `surprise: true` + picked 信息塞进去就行）
- 不改 `render-marketing-video`、`poll-marketing-video`、`marketingSegments.ts`
- 不改 `MarketingVideo` 现有手动流程

## 边界情况

- 素材库为空 / 商品 < 1：禁用入口卡片，提示 **"先去素材库上传几张商品图，BOOMER 才能帮你随机"**。
- 未设置 `shop_marketing_profiles`：降级用通用调性，并在结果上方加一条提示 **"补充店铺调性后，惊喜会更准 →"**。
- 渲染失败：保留 picked 信息，按钮变为 **「重试这一组」**。
- 防刷：edge function 内对同一用户做 10s 节流。

## 验证方式（build 阶段）

1. 在素材库准备 ≥3 个商品后，点首页"惊喜一下"，确认弹窗显示选中商品+风格。
2. 点开始，30~60s 内出现 9:16 15s 视频。
3. 连点 3 次"再来一条"，确认每次商品/风格至少有一个变化。
4. 把店铺 tone 改为"高冷"，多次随机，确认 style 不会出现 playful/energetic。
