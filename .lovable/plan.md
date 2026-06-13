## 目标
1. 活动详情的"已领取/已核销"要和绑定的优惠券一致，并解决领取记录在活动里看不到的问题。
2. 邀请海报换成和优惠券海报一致的暖棕渐变质感。
3. 海报里的二维码、以及活动/优惠券分享链接，要走配置的"对外部署域名"，不再带 lovable 预览域名。
4. 扫码后的公开报名页重做 UI，按钮文案改为"确认报名"。
5. "上传主页截图"上传后展示缩略图，点击可放大查看。

---

## 1. 活动统计与领取列表

在 `src/pages/ActivityDetail.tsx`：

- 列表过滤：只展示真正生成了券的记录（`voucher_claim_id != null` 或 `voucher_claim` 存在）。当前历史里有个旧的 `status=pending / voucher_claim_id=null` 的脏记录会显示成"已领取"但其实没券，本次过滤掉。
- 统计口径改成"以券为准"，与该活动绑定的 voucher 实际生成的券完全对齐：
  - `已领取` = 该活动下存在 `voucher_claim` 的申请数（即真正发出去的券，含已核销）。
  - `已核销` = 其中 `voucher_claim.status = 'redeemed'`。
- 卡片下方追加一行小字提示"以下数值与绑定的优惠券一致"。
- 同时把列表 query 改成 `inner join` 写法：`voucher_claim:voucher_claims!inner(...)`，从源头丢掉没券的脏记录。

不动 DB / RLS：现有 `activity_applications read by manager` 策略已经够用，无需迁移。

## 2. 邀请海报重做（和优惠券同款）

参照 `src/components/voucher/VoucherPoster.tsx` 的暖棕渐变 + 金色高光 + 虚线分隔风格，把 `src/components/voucher/ActivityShareDialog.tsx` 里的 canvas 绘制整体重写：

- 背景：`linear-gradient(135deg, #1f1409 0%, #3b2410 38%, #6b3a18 70%, #b48142 100%)`，叠两个柔光圆斑。
- 文字色：`#fff5e1` / `#ffd28a` / `#ffe7bd`，与券面同色板。
- 顶部 `BOOMER-OFF` 字间距 0.3em + 右上"限量邀请"小字。
- 中部大标题 + 副标题 + 活动时间 + 描述（最多 4 行）。
- 虚线分隔（`repeating-linear-gradient` 在 canvas 里用短横线模拟）。
- 底部白底圆角块装二维码 + 右侧"扫码 / 长按识别 报名领券"+ 域名小字。
- 砍掉旧的纸纹噪点、菱形、青海波、印章这些和风元素，整体气质对齐券面。
- 版本号 `POSTER_VERSION` 从 `v2` 升到 `v3`，强制重新生成已缓存的海报（旧的会自动覆盖）。

仍然保留：生成后 `toDataURL → upload activity-posters → activities.poster_url` 的持久化逻辑、签名 URL 10 年、下载按钮。

## 3. 部署后二维码 / 分享链接走固定域名

问题：`buildClaimShareUrl` / `buildActivityShareUrl` 用 `window.location.origin`，导致在 lovable 预览里生成的海报硬编码进了 lovable 域名，腾讯云部署后二维码还是指向 lovable。

方案：

- `app_settings` 加一个 key=`public_base_url`，admin 在 `/portal` 可配置（如 `https://shop.your-domain.com`）。
- 新建 `src/lib/publicBaseUrl.ts`：
  - 启动时从 `app_settings` 读 `public_base_url`，缓存到内存 + `localStorage`。
  - 暴露 `getPublicBaseUrl()`，未配置时回退 `window.location.origin`。
- `src/lib/voucher.ts` 三个 URL 构造函数改成调用 `getPublicBaseUrl()`：
  - `buildClaimShareUrl`
  - `buildActivityShareUrl`
  - `buildClaimRedeemUrl`（核销保留 origin 也可，这个只店员内部用，本次也改成 publicBaseUrl 以便部署后扫码核销可用）。
- 在 `src/pages/Portal.tsx` 的"系统设置"区域加一个输入框"对外部署域名（用于二维码/分享链接）"，保存写入 `app_settings`。
- 应用启动时（`App.tsx` 或现有的 settings loader）拉一次 `app_settings.public_base_url` 写入缓存。

迁移：
```sql
INSERT INTO public.app_settings(key, value)
VALUES ('public_base_url', to_jsonb(''::text))
ON CONFLICT (key) DO NOTHING;
```
（结构已存在，只补默认行。）

## 4. 公开报名页 `PublicActivity` 重做 + 图片缩略图

文件：`src/pages/public/PublicActivity.tsx`

视觉：

- 整页背景换成和海报同款的暖棕渐变（深棕→琥珀），主要卡片改成奶白色 `#fdf6e8` 圆角 24，配深棕文字、金色 accent。
- 顶部加一个圆角顶图区块：BOOMER-OFF logo + "中古邀请函" 副标题 + 活动标题。
- 中部金色"专属福利"卡片：大号 `¥XX` + 规则 + 有效期。
- 表单区改为浅色卡片，圆角输入框，黑棕标签。
- 主按钮：金色 → 暖红渐变（与海报印章呼应），文案 **"确认报名"**（删掉 "提交申请"）。
- 顶部加一条小字"填写下方信息即可确认报名领取专属优惠券"。

图片字段升级：

- 上传后立即把文件转 `dataUrl`，存到 `formData[key]`（已经这样了）。
- 上传区改成：
  - 未上传：虚线占位框 + 上传图标 + "点击上传"。
  - 已上传：**显示缩略图**（`<img src={dataUrl}>`，限制宽 96px / 高 96px，object-cover 圆角），右上角"×"删除按钮。
  - 缩略图整体可点击 → 打开全屏 lightbox（新建轻量内联组件 `ImageLightbox`：fixed inset-0, 黑色 90% 蒙层, 点空白关闭, 显示原图最大 90vw/90vh）。
- 多次重选时正确替换。
- 5MB 限制保留。

不动后端：`activity-apply` 已经处理 `data:` base64 上传到 `voucher-screenshots`。

## 5. 验证

- 在 lovable 预览：先到 `/portal` 配置 `public_base_url=https://boomeroff.lovable.app`（或用户的腾讯云域名），刷新后重新生成活动海报，扫码 / 复制链接应指向该域名。
- 用同一手机号重新走 `/u/activity/{token}` 流程，活动详情页应显示 1 条"已领取"记录、绑定优惠券统计同步更新。
- 公开页：上传截图后显示缩略图，点击放大，按钮显示"确认报名"。

## 受影响文件

- `src/pages/ActivityDetail.tsx`
- `src/components/voucher/ActivityShareDialog.tsx`
- `src/lib/voucher.ts`
- `src/lib/publicBaseUrl.ts`（新）
- `src/pages/Portal.tsx`
- `src/App.tsx`（启动时拉取）
- `src/pages/public/PublicActivity.tsx`
- 新迁移：补 `app_settings.public_base_url` 默认行
