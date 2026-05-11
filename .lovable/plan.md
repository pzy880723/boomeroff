
# 游客版入口（免登录 AI 识物）方案

## 一、整体目标

在不影响现有店员/管理员后台的前提下，新增一条**完全独立**的游客通道：
- 免登录使用 AI 识物
- 查看识别结果详情
- 一键匿名分享到「中古圈」（标注「游客」、立即公开）
- 浏览中古圈帖子（只读，不能点赞/评论）
- 按 IP 每日限 N 次识别（N 在后台可配）

入口走独立路由 `/u`，不与现有 `/scan`、`/community` 共用页面，方便后续做二维码/分享落地页。

---

## 二、路由与页面结构

```text
/u              游客首页（拍照/上传 + 引导文案）
/u/result       识别结果页（含「分享到中古圈」按钮）
/u/community    游客版中古圈（只读列表 + 详情抽屉）
```

- 不挂在 `MainLayout` 下（不显示店员版底部 5 tab）
- 提供一个简化版底部栏：识物 / 中古圈 / 关于（说明 + 引导店员去登录）
- 顶部 logo 仍可用，但**不挂载**「点 5 次进后台」逻辑（避免游客误入）

## 三、前端改动

### 1. 新增页面
- `src/pages/public/PublicScan.tsx` —— 复用现有 `CameraCapture` 与识别 UI，但调用新的免登录识别接口
- `src/pages/public/PublicResult.tsx` —— 复用 `ProductDetailCard`，下方放「匿名分享到中古圈」按钮
- `src/pages/public/PublicCommunity.tsx` —— 只读版 Community，去掉点赞/评论输入框，未登录时点赞按钮提示「登录后可互动」
- `src/components/layout/PublicLayout.tsx` —— 简化版顶/底栏

### 2. 新增 hook
- `useGuestRecognition` —— 不依赖 `useAuth`，直接 `fetch` 调用新的 `recognize-product-public` 函数
- `useGuestShare` —— 调用新的 `submit-public-post` 函数

### 3. 路由
在 `src/App.tsx` 增加 `/u/*` 路由，不包在 `MainLayout` 内，未登录可访问。

## 四、后端改动

### 1. 新表：游客每日用量

```text
guest_daily_usage
- id uuid pk
- ip_hash text         -- sha256(ip + salt)，不存原 IP
- usage_date date
- recognize_count int default 0
- share_count int default 0
- updated_at timestamptz
unique(ip_hash, usage_date)
```
RLS：仅 service_role 可读写（边缘函数访问）。

### 2. `community_posts` 表调整

- `user_id` 改为 **nullable**
- 新增列 `guest_name text`（默认 `游客`）、`is_guest boolean default false`
- 新增 SELECT 策略：`anon, authenticated` 都可看 `is_public = true` 的帖子（覆盖游客圈子只读）
- INSERT 仍只允许已登录写自己；游客通过 service_role 边缘函数写入

### 3. 新增 app_settings key

`guest_limits = { recognize_per_day: 30, share_per_day: 5, enabled: true }`
管理员后台 `/portal` 的「AI 设置」面板加一块「游客限额」配置 UI。

### 4. 新增 Edge Functions

#### a) `recognize-product-public`（无 JWT）
- 取 `x-forwarded-for` 第一个 IP，sha256 + salt → `ip_hash`
- 用 service_role 客户端读 `guest_daily_usage`，超额返回 429 + 文案「今日免费体验已达上限，请明天再来或登录店员账号」
- 调用与现有 `recognize-product` 相同的核心逻辑（建议把核心识别函数抽到 `_shared/recognize-core.ts`，两个入口复用），**强制使用极速档**、关闭可能写入用户数据的分支
- 成功后 `recognize_count += 1`
- **不**写 `products` 表（避免污染店员知识库），结果只回前端

#### b) `submit-public-post`（无 JWT）
- 校验同样的 IP 限额（`share_per_day`）
- 服务端再跑一次内容长度/字段校验、敏感词过滤（先简单黑名单）
- 用 service_role 写 `community_posts`，`user_id = null`、`is_guest = true`、`guest_name = '游客'`、`is_public = true`
- 因为 `is_guest=true` 帖子的作者展示为「游客」，前端 Community 渲染时按此分支显示

> 经验值/check-in 等触发器与 `user_id` 强相关，游客帖 `user_id = null` 不会触发，符合预期。

### 5. `recognize-product` 现有函数

不动，店员版仍走原路径。仅把核心识别逻辑抽函数共享，避免维护两套提示词。

## 五、UI/文案要点（中文）

- `/u` 首屏顶部一句话：「拍一拍，AI 帮你识物 · 免登录体验」
- 识别结果页底部「分享到中古圈」按钮副标题：「将以「游客」身份匿名发布」
- 限额提示：「今日免费体验剩余 X 次」
- Community 里游客帖头像用统一灰底「游」字

## 六、安全与防滥用

- IP 哈希（不存原 IP），加盐放在 edge env
- 每日限额可在后台一键关停（`enabled=false` 直接 503）
- 图片体积限制（沿用现有压缩，服务端再校验 ≤ 2MB）
- service_role 仅在两个新 edge function 内使用，不暴露
- 未来可加 hCaptcha，本期先不做

## 七、验收清单

1. 未登录浏览器访问 `/u` 能拍照/上传识别，结果与 `/scan` 一致
2. 在 `/u/result` 点「分享到中古圈」后，店员版 `/community` 能看到该帖，作者显示「游客」
3. 游客版 `/u/community` 能看到所有公开帖（含店员发布的），点赞/评论按钮提示登录
4. 单 IP 当天超过 N 次识别后返回 429，并显示剩余次数文案
5. 管理员在 `/portal` 改 `guest_limits` 后即时生效
6. 店员/管理员现有流程完全不受影响（`/scan`、`/community`、`/portal` 行为不变）

## 八、技术细节摘要

- 路由：`/u`、`/u/result`、`/u/community` 不进入 `MainLayout`
- 数据库：`community_posts.user_id` nullable + 新列 `guest_name`、`is_guest`；新增 `guest_daily_usage`；`app_settings` 增 `guest_limits`
- 策略：`community_posts` 新增 `to anon` 的 SELECT 策略（仅 `is_public=true`）
- Edge：`recognize-product-public`、`submit-public-post`，均 `verify_jwt = false`，IP 哈希加盐
- 核心识别逻辑抽到 `supabase/functions/_shared/recognize-core.ts` 复用
