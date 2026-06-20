## 目标
1. 领取列表里的"主页截图"等图片字段 → 点击可弹窗放大查看（不再只是新标签页打开签名链接）。
2. 发布确认弹窗 → 支持上传"发布截图"（可多张），保存到记录中。
3. 已确认发布后，列表中那个 `发布确认` 按钮文案改为 `查看发布`。

## 实施

### 1. 数据库
新增 `activity_applications.publish_screenshots text[]`（存 `voucher-screenshots` bucket 的 path 数组）。沿用现有私有 bucket，读取时用 createSignedUrl。

### 2. 新组件 `src/components/voucher/ImageLightbox.tsx`
轻量 Dialog，全屏暗背景 + 居中大图 + 关闭按钮，支持单张/多张左右切换。供下面两处复用。

### 3. `PublishConfirmDialog.tsx`
- "主页截图" 缩略图点击 → 打开 ImageLightbox，而不是 `<a target=_blank>`。
- 在备注上方加 "发布截图" 区块：
  - 已有的缩略图（点击放大、点 × 移除）。
  - "+ 上传发布截图" 按钮：选择文件 → 上传到 `voucher-screenshots/publish/{appId}/{uuid}.{ext}` → 追加进本地数组。
  - 保存（点 "已确认发布" / "更新备注"）时一并写入 `publish_screenshots`。
- 撤销确认时不删图（保留历史，避免误删）。

### 4. `ActivityDetail.tsx`
- 领取列表中渲染 image 字段的部分：把 "查看截图" 链接换成缩略图（小方块），点击调用 ImageLightbox 打开。
- 按钮逻辑：
  ```
  app.publish_confirmed
    ? <Button variant="secondary">查看发布</Button>   // 仍打开同一个 PublishConfirmDialog
    : <Button variant="outline">发布确认</Button>
  ```
- AppWithClaim 类型加 `publish_screenshots?: string[] | null`。

### 5. 类型同步
迁移完成后 `src/integrations/supabase/types.ts` 自动更新；`ActivityApplication` 类型在 `src/lib/voucher.ts` 中增加 `publish_screenshots?: string[] | null`。

## 不动的部分
- 不修改 storage bucket 配置 / RLS（沿用现有 voucher-screenshots 上传策略）。
- 不修改优惠券、活动其它逻辑。
