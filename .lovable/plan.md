## 目标

1. 把之前「分镜静帧」里那套高质量出图 Prompt（真人级电影感 / 风格化海报）迁移到 AI 图片，做成「**一键智能广告图**」入口：自动从素材库挑原图 + 自动写 Prompt + 批量出图。
2. 收窄底部输入区，让对话气泡区有更多视觉空间。

---

## 一、新功能：一键智能广告图

### 入口
- 在 `AiImage.tsx` 空状态 `EmptyState` 顶部 + 顶部模板行新增一个醒目按钮 **「✨ 一键智能广告图」**（金色/主色描边）。
- 点击打开新弹窗 `SmartAdGenerateDialog.tsx`，三步走：

  **Step 1 选类型**（必选，可多选）
  - **场景图** — 店内氛围/陈列/货架，不强调单个商品，无人。
  - **商品特写** — 单个或一组商品居中，柔光、干净背景。
  - **人物图** — 真人写实店员/顾客逛店瞬间，电影感。

  **Step 2 数量与比例**
  - 张数：3 / 6 / 9 / 12（默认 9）。
  - 比例：1:1 / 3:4 / 9:16 / 16:9（默认 3:4）。
  - 风格：复用现有 `VIDEO_STYLE_LABELS`（治愈 / 高级 / 活力 …），默认「治愈日杂」。
  - 真人模式开关（仅在选了「人物图」时显示）：写实 / 风格化。

  **Step 3 主题（可选）**
  - 一句话主题，例如「周末新到货」「夏日清凉」。空着也行，由 AI 自由发挥。

### 后端：新建 `supabase/functions/ai-smart-ad-images/index.ts`

逻辑：

1. 校验登录 / shop_id / 每日 50 张额度（沿用 `ai-image-chat` 的限额表）。
2. **自动选图**：从 `marketing_assets` 拉该 shop_id 下 `kind='photo'` 且非 `category='分镜头'`、非 AI 合成（meta.source 非 `ai-image-chat` / `storyboard`）的真实素材，按 `tags` 与所选类型聚类：
   - 场景图 → 标签含 `店内/陈列/货架/氛围/门头`。
   - 商品特写 → 标签含 `商品/单品/服饰/杯子/玩具…`。
   - 人物图 → 标签含 `人物/店员/顾客`。
   - 没命中标签时退化为「最近 50 张里随机抽」，保证总能出图。
3. **批量构 Prompt**：把 `storyboard-marketing-video` 里 `buildFramePrompt` 抽到 `_shared/ad-image-prompts.ts`，按「类型 + 风格 + 真人模式」生成。每张图：
   - 场景图：复用 `realism='photoreal'` 分支（去掉「主角必须出现」段），refs = 1 张实景图。
   - 商品特写：极简白底 / 自然光 + 单品锁定，refs = 1 张商品图。
   - 人物图：复用 photoreal 全套约束 + character 卡（如果该 shop 选了默认角色），refs = 角色封面 + 1 张实景图。
4. **并行 Gemini 3.1 Flash Image** 出图（同 storyboard，最多并发 4），上传到 `product-images` bucket，写 `marketing_assets`（kind=`photo`、category=类型名、tags=[`AI智能广告`, 风格, 类型]，sha256 去重）。
5. 返回 `{ ok, items: [{ output_url, category, asset_id, source_asset_url }] }`，失败的单张只标记错误不影响其他。

### 前端结果展示
- 弹窗内进度条「正在生成 3 / 9 …」，已完成的图实时插入对话流（以 AI 气泡呈现，标签：「智能广告 · 场景图 1」）。
- 全部完成后弹窗关闭，对话流自动滚到底。
- 用户可以继续在输入框对话 `@img1` 改图（沿用现有 mention 逻辑）。

---

## 二、输入区瘦身（仅视觉调整，逻辑不动）

当前底部约 220px 高，目标压到 ~110px。改动都在 `src/pages/marketing/AiImage.tsx`：

1. **左侧两个图标按钮（📎 附件 / 🖼 素材库）下移合并**
   - 删除左侧竖排两按钮列。
   - 在 Textarea 内左下角放一个「**+**」按钮（`size="icon" h-7 w-7`），点击弹出 mini Popover：「📎 上传图片」「🖼 从素材库选」「✨ 一键智能广告图」。

2. **比例选 → 单按钮 Popover**
   - 顶部那行把 4 个 `AspectIcon` 按钮去掉，换成一个 `<Button variant="outline" size="sm">` 显示当前比例（如 `1:1 ▾`）。
   - 点击弹 Popover，里头放原来的 4 个 `AspectIcon` 大按钮，选完即关。

3. **顶部行布局**
   - 行高从 `gap-2 flex-wrap` 改成单行 `h-8`：左边「模板」按钮 + 当前模板 chip，右边「比例」按钮。

4. **底部提示文案精简**
   - `最多挂 4 张参考图 · 每日 50 张额度 · 历史不保存,出图自动进素材库` → `每日 50 张 · 自动入库`，字号 `text-[10px]`。

5. **附图条**
   - 缩略图从 `w-14 h-14` 改 `w-10 h-10`，整条 padding 收紧。

---

## 三、技术细节

- 新文件：
  - `src/components/marketing/SmartAdGenerateDialog.tsx`
  - `supabase/functions/ai-smart-ad-images/index.ts`
  - `supabase/functions/_shared/ad-image-prompts.ts`（抽自 `storyboard-marketing-video`，保留商场 B1 门头约束）
- 修改：
  - `src/pages/marketing/AiImage.tsx`（入口按钮 + 输入区重排）
  - `supabase/functions/storyboard-marketing-video/index.ts` 改为从共享 prompts 引入（保证视频分镜效果不退化）
- 复用：`uploadMarketingImages`、`marketing_assets` 表结构、`VIDEO_STYLE_*` 风格枚举、Gemini 3.1 Flash Image 模型
- 复用现有商场 B1 / 门头 / 无门 物理约束（`storefront-constraints.ts`）注入到场景图与人物图 prompt。

---

## 不做

- 不做角色一致性面板（已有 CharacterPicker，本期不动）
- 不动视频流程
- 不改 `ai-image-chat` 单图对话接口