# 真人快拍建角色 · 一键火山认证

## 背景
现在 AI 生成的形象板和你本人差距大，火山活体校验把人脸特征算到 AI 头像上，自然过不了。要让认证稳过，必须用**真实拍摄的本人正脸照**做素材，不能用 AI 生成图。

## 目标
在「新建角色」里加一个新模式 **「📸 真人快拍」**，三步走完成「拍照 → 入库 → 火山认证」：
1. 调摄像头按引导拍 3 张真人照（正脸 / 左侧 45° / 右侧 45°）
2. 自动把第 1 张设封面、3 张全部作为参考图保存为角色
3. 创建成功后自动弹出现有的「真人认证」流程（H5 扫码活体），无需用户再点一次

## 用户流程
```
新建角色 → 选「真人快拍」Tab
  → 输入名称（必填）+ 角色定位（选填）
  → 进入拍摄向导：
      镜头 1 / 3  正脸平视，光线充足  [拍 / 重拍]
      镜头 2 / 3  左转 45°            [拍 / 重拍]
      镜头 3 / 3  右转 45°            [拍 / 重拍]
  → 预览 3 张 → 点「保存并发起认证」
  → 角色卡落库（source = 'live_capture'）
  → 自动打开 IdentityVerifyDialog
  → 手机扫码完成活体 → 点「我已完成，开始入库」→ ✅ 已认证
```

## 关键设计点
- **同一台手机即可完成**：在 /me/marketing 页打开时，前置摄像头直接拍，无需切设备
- **质量自检**：拍完用 canvas 检查最短边 ≥ 720px、亮度均值不过暗；不达标提示重拍
- **统一走真实图通道**：上传到 `product-images` bucket，跟普通素材库一样，但在 `marketing_characters.source` 标记 `live_capture` 用于区分
- **认证前置校验**：保存后立刻调 `volc-identity-create-session`，把生成的 H5 二维码直接展示在同一个弹窗里，省一次点击
- **失败兜底**：若仍未通过（例如光线 / 戴口罩），在 `IdentityVerifyDialog` 报错卡片底部新增「重拍 3 张再试一次」按钮，跳回拍摄向导而不是从头建角色

## 改动清单（技术细节）
- `src/components/marketing/CharacterCreateDialog.tsx`
  - 新增第三个 Tab `live`，复用 `name / roleLabel`
  - 新组件 `<LiveCaptureWizard />`：用 `getUserMedia({ facingMode: 'user' })` + `<canvas>` 三步抓帧，输出 3 个 `File`
  - 走 `uploadMarketingImages` 上传 → `marketing_characters.insert({ source: 'live_capture', ref_image_urls, cover_url })`
  - 保存成功后 `setVerifyOpenFor(character)` 直接拉起认证弹窗
- `src/pages/marketing/MarketingLibrary.tsx`（或承载角色卡的页面）
  - 接住 `onCreated` 回调，若 `character.source === 'live_capture'` 自动 open `IdentityVerifyDialog`
- `src/components/marketing/IdentityVerifyDialog.tsx`
  - 失败态下新增「重拍照片」按钮，回调回到 `CharacterCreateDialog` 的 live 模式并预填角色 id（走 update 而非 insert）
- 后端 / DB：**无需迁移**。沿用 `marketing_characters` / `marketing_character_assets` / 现有两个 volc-identity edge functions

## 不做的事
- 不改火山的活体规则（那是平台侧）
- 不动现有「AI 生成身份板」和「上传人物照」两个模式
- 不引入新的存储桶 / 新的表

## 验收
- 在手机预览页（/me/marketing/library）能用前置摄像头完成 3 连拍
- 保存后角色卡出现「未认证」徽章 → 弹窗扫码 → 真机完成活体 → 徽章变「已认证」
- 角色 `verified_asset_uri` 写入，后续生成视频时该角色自动走 `asset://` 通道，不再被「real person」拦截
