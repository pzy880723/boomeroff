# 游客版（客户端）独立系统改造方案

## 背景与定位

货架二维码 → 顾客扫码进入 `/u`，**完全不暴露**任何店员/管理员入口。两套系统物理隔离，顾客视角 ≠ 店员视角。

场景：「这是什么？我想了解一下。」—— 而非「这值多少钱？怎么卖？」

---

## 一、入口与导航清理

### 1. 顶栏改造（PublicLayout.tsx）
- 标题：**「中古识物」**，副标题：**「拍一拍·认中古」**
- 删除右上角「店员入口 →」链接
- Logo 点击逻辑保持纯跳转 `/u`，**不挂任何 5 次点击隐藏入口**

### 2. 底栏 3 tab 保留，文案微调
- 拍一拍 / 中古圈 / 关于

### 3. 路由隔离
- `/u/*` 完全独立，不引用 `MainLayout`、不引用 `useAuth`
- 任何「登录」「注册」「店员」相关字样在 `/u/*` 全部清除

---

## 二、AI 识物：与店员版「一模一样」但视角切换

### 1. UI 完全复用
- `PublicScan` 复用 `CameraCapture` 组件（与店员版 `LiveStreamPanel` 同款相机交互）
- 识别中 loading、多角度补拍、重拍按钮一致
- `PublicResult` 复用 `ProductDetailCard`（同款卡片样式 + 卖点 + 提示）

### 2. 识别内容「同样详细」但提示词重写
当前 `recognize-product-public` 用的是极速档 `gemini-2.5-flash-lite` + 精简字段。改为：
- **使用与店员版相同的主模型与字段集**（era/origin/material/craft/dimensions/condition/description 全字段输出）
- **提示词从顾客视角重写**（新建 `supabase/functions/_shared/recognize-prompts.ts`）：
  - 店员版：「鉴定 + 卖点话术 + 直播开场白」
  - 顾客版：「这是什么 + 来历故事 + 怎么欣赏 + 收藏/使用注意事项 + 同类常见误区」
  - `sellingPoints` 三条 tag 改为：**身世 / 工艺 / 趣味**（去掉「场景」这种导购味）
  - 删除 `pitch.opener / pitch.highlight`（直播话术）
  - 新增 `story`（一段 80-120 字的物件故事）、`appreciation`（怎么看怎么玩）、`careTips`（保养/使用提醒）

### 3. ProductDetailCard 顾客视角分支
- 新增 `audience: 'guest' | 'staff'` 属性，或新建 `GuestProductCard` 组件
- 顾客版隐藏：成交价、闲鱼比价、话术、加入知识库、refine/纠错入口
- 顾客版突出：**故事 / 工艺 / 鉴赏要点 / 保养小贴士**

### 4. 仍保留
- hash_cache 命中复用（同图秒出）
- IP 限频（每日 N 次）
- 「分享到中古圈」按钮（匿名「游客」身份）

---

## 三、中古圈：小红书式瀑布流

### 1. PublicCommunity 重写
- 布局：**两列瀑布流**（`column-count: 2` 或 `react-masonry-css`，移动端 2 列）
- 卡片：图片自适应高度 + 商品名（1-2 行截断）+ 「游客 / 店主昵称」小字
- 数据源：`community_posts where is_public=true`，按 `created_at desc`
- 分页：滚动到底加载下一页（每页 20 条）

### 2. 详情交互
- 点卡片 → 进入详情页（或全屏 Sheet），展示大图 + 商品故事 + 卖点
- **删除点赞、评论、收藏按钮**（顾客版完全不出现这些 UI）
- 顶部仅一个「返回」 + 一个「我也来拍一拍」CTA → `/u`

### 3. 不显示任何登录提示
- 既然顾客无账号体系，所有「登录后可…」文案全部移除

---

## 四、关于页：客户视角系统介绍

### PublicAbout.tsx 文案重写

```text
中古识物 · 拍一拍认中古

【这是什么】
店里的每件中古好物背后都有故事——一只昭和年代的清水烧茶碗、
一台 90 年代的 Walkman、一枚 70 年代的玻璃胸针……
但货架上的小标签写不下它们的来历。
打开相机拍一拍，AI 会告诉你这件东西的身世、工艺与玩法。

【怎么用】
1. 在货架前对准想了解的物件，拍一张清晰照片
2. 等 1-3 秒，AI 给出名称、年代、产地与故事
3. 喜欢的话，可以把它分享到「中古圈」，让更多人看见

【关于「中古圈」】
这里汇集了顾客与店主一起拍下的中古好物。
像逛市集一样滑动浏览，遇见你下一件心头好。

【小提示】
· 拍照尽量光线充足、主体居中
· AI 会尽力，但偶尔也会认错——欢迎多角度补拍
· 完全免费，无需注册

【关于 BOOMER-OFF】
我们是一家专注日本中古杂货的实体店，
相信每件旧物都值得被重新看见。
```

- 页面底部：店铺名 + 一句 slogan，**不放任何登录/管理入口**

---

## 五、数据与后端调整

### 1. Edge function 改动
- `recognize-product-public`：换用主模型（`google/gemini-2.5-flash` 或与店员版一致的当前 effective model），换顾客视角 prompt，返回字段扩展
- `submit-public-post`：保持不变（仍写 `is_guest=true`、`guest_name='游客'`）

### 2. 不需要数据库迁移
当前 `community_posts` 已支持 `anon` SELECT、`is_guest`、`guest_name`，结构已满足。

### 3. 顾客视角字段（前端类型）
新增 `GuestRecognitionResult` 类型：在现有结果上扩展 `story / appreciation / careTips`，去掉 `pitch / scripts`。

---

## 六、文件改动清单

**修改：**
- `src/components/layout/PublicLayout.tsx` — 顶栏文案、删除店员入口链接
- `src/pages/public/PublicScan.tsx` — 接入 CameraCapture 完整 UI
- `src/pages/public/PublicResult.tsx` — 顾客视角卡片
- `src/pages/public/PublicCommunity.tsx` — 瀑布流，删互动按钮
- `src/pages/public/PublicAbout.tsx` — 重写文案，删店员入口
- `supabase/functions/recognize-product-public/index.ts` — 升级模型 + 顾客 prompt + 扩展字段

**新增：**
- `src/components/recognition/GuestProductCard.tsx`（或在 ProductDetailCard 增加 audience 分支）
- `src/pages/public/PublicPostDetail.tsx`（中古圈详情，纯展示）
- `supabase/functions/_shared/recognize-prompts.ts`（顾客 vs 店员 prompt 分离）

**保持不变：**
- 店员版 `/scan`、`/community`、`/portal` 完全不动
- 现有 `recognize-product` 不动

---

## 七、验收标准

1. `/u` 全程没有任何「登录」「店员」「管理」字样
2. 拍照后识别结果详细程度 ≈ 店员版，但内容是「故事/鉴赏/保养」而非「话术/卖点/价格」
3. `/u/community` 是两列瀑布流，无点赞/评论/收藏按钮，无登录提示
4. `/u/about` 是面向顾客的系统介绍，不含店员入口
5. 店员系统行为 0 变化
