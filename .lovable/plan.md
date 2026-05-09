## 背景与共识

- **官方知识** = 公共、理论化、基础知识，只能由管理员在 `/portal` 维护。识物结果不再有任何"申请收录 / 收录为官方知识"按钮。
- **中古圈** = 店员识物后分享个性化知识的地方，要做成识物结果区的**主推 CTA**。
- **个人收藏**（`user_favorites`）保留，但改名为「收藏为个人知识」，去掉"学习清单"这个说法。

修正循环（RefineDialog → 管理员审核 → official_knowledge）属于管理员侧的「纠错」通道，不动。

## 改动范围

只改前端文案 / 按钮排版 / 一段移除，不动数据库、不动 RLS、不动 edge function。

### 1. `src/components/dashboard/LiveStreamPanel.tsx`（识物结果操作区，约 1085–1151 行）

- **删除**「申请收录到官方知识库 / 直接收录为官方知识」主按钮（1088–1115 行整段）。
- **删除**与之配套的 state / handler：`knowledgeAdded`、`savingKnowledge`、`addToKnowledge` 函数，以及 703 行附近"同步加入知识库状态"的相关查询逻辑（只保留收藏部分）。`Award` 图标 import 一并清理。
- **重排剩余按钮顺序**，让"分享到中古圈"成为视觉主按钮：
  1. 主按钮：`<ShareToCommunityButton>` ——使用 gradient-accent 样式（`bg-gradient-accent text-accent-foreground`，`h-12`，rounded-full），文案改为「分享到中古圈 · 让更多店员看到」（已分享时显示「✓ 已分享到中古圈」）。
  2. 次按钮：收藏按钮，`variant="outline"`，文案改为：
     - 未收藏：`收藏为个人知识`
     - 已收藏：`已收藏为个人知识`
- **底部引导文字**改为：`个人收藏只有自己能看到 · 分享到中古圈能让所有同事学到这件好物`。

### 2. `src/components/community/ShareToCommunityButton.tsx`

- 默认文案润色：
  - 未分享：`分享到中古圈 · 让更多店员看到`
  - 已分享：`已分享到中古圈`
  - 提交成功 toast：`{ title: '已分享到中古圈', description: '同事们可以在「中古圈」里看到你的发现' }`
- 增加可选 prop `label?: string`，方便其它入口（如历史详情对话框）按需覆盖；不传则用上面的默认文案。
- 默认 `variant` 改为 `default`，让它在外部传 `className="bg-gradient-accent…"` 时也能正常显示主按钮态。

### 3. `src/components/history/ProductDetailDialog.tsx`

- 历史详情里的 `<ShareToCommunityButton>` 已经是次级位置，沿用新默认文案即可，无需改动逻辑。视觉保持当前 outline / 圆角不变。

### 4. 其它清理

- 全工程搜索 `学习清单`、`收录为官方`、`申请收录`、`加入知识库`，确认只剩上面已处理的位置；如有遗漏文案一并对齐到新口径。
- 不动 `/portal` 的 OfficialKnowledgeManager、AiKnowledgeDialog、CorrectionReviewPanel —— 那是管理员通道，符合"官方知识只由管理员维护"的新定位。

## 不做的事情

- 不删除 `product_knowledge` 表和已有数据（保持向后兼容，旧数据仍可在 MyLibrary「我建的」标签内只读查看）。
- 不改 `submit-correction` / `review-correction` 边缘函数。
- 不动识物结果的知识卡渲染、闲鱼行情卡、纠错对话框等其它模块。
