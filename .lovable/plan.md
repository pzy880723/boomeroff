## 现状确认
反馈数据已经共用同一行 `activity_applications`：
- 字段：`publish_screenshots[]` / `publish_url` / `publish_confirm_note` / `publish_confirmed`
- 用户自助：`activity-feedback` edge function 写入前 3 个，不动 `publish_confirmed`
- 工作人员：`PublishConfirmDialog` 读这些字段 + 切换 `publish_confirmed`

唯一缺口：管理员端 `PublishConfirmDialog` **没有显示/编辑 `publish_url`**，所以用户自助提交的发布链接管理员看不到。

## 改动（只动一个文件）
`src/components/voucher/PublishConfirmDialog.tsx`
1. 新增 state `publishUrl`，在 useEffect 初始化为 `app.publish_url || ''`。
2. 在"发布截图"块下方加只读优先 / 可编辑的"发布链接"输入框：
   - 已有链接 → 显示带 `🔗 打开` 的小卡（点击新标签打开），下方 `编辑` 按钮切换为输入框；
   - 没有 → 直接给空输入框（管理员可代填）。
3. 保存时一并 `update({ publish_url: publishUrl.trim() || null })`，校验 `http(s)://` 前缀。
4. 列表卡片（`ActivityDetail.tsx`）的领取行里小贴一行：如果有 `publish_url`，在按钮左侧显示一个"🔗 发布链接"小链接（target=_blank），方便不打开弹窗就能直接核验。

不动后端/edge function / 数据表 / 用户反馈页 —— 它们已经写对地方。
