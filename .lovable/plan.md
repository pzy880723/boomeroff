## 目标
重设 `/me` 页的个人信息卡 + 把"我的排班"作为独立模块内嵌到个人信息下方。

---

## 1. 数据库改动

### staff_profiles 表新增字段
- `real_name text` — 真实姓名
- `position text` — 职位枚举值（'manager' / 'regular' / 'parttime' / 'intern'）

### profiles 表
- 已有 `avatar_url text` — 直接复用，无需新增

### Storage Bucket
- 新建 `avatars` 公共 bucket
- RLS：所有人可读；用户只能写入 `{userId}/...` 路径下文件

---

## 2. 头像生成与上传

**首次注册自动生成（边缘函数 `generate-avatar`）**：
- 入参：`displayName`
- 调用 Lovable AI `google/gemini-3-flash-image-preview`
- prompt：基于昵称首字 + 随机配色生成扁平卡通圆形头像
- 上传到 `avatars/{userId}/ai-{timestamp}.png` → 写入 `profiles.avatar_url`
- 触发时机：
  - `public-register` 注册成功后异步触发
  - Me 页发现 `avatar_url` 为空时按钮触发

**用户操作**：
- Me 页头像点击 → 弹出菜单：「上传图片」/「AI 重新生成」
- 上传：直接 supabase storage 上传，更新 `profiles.avatar_url`
- 重新生成：调用 `generate-avatar` 函数

---

## 3. Me 页 UI 重构

### 模块 A：个人信息卡（顶部）
```
┌─────────────────────────────────────┐
│ [大头像]  昵称 ✎                    │
│  点击     真实姓名 · 职位徽章        │
│  编辑     📍门店名称                 │
│           role + 邮箱                │
└─────────────────────────────────────┘
```
- 头像：80x80，可点击弹菜单（上传/AI生成）
- 昵称：用户可改（已有）
- 真实姓名：只读展示，"未设置"占位
- 职位：徽章展示（店长/正式店员/兼职/实习生）
- 门店：📍徽章
- 删除原 `ShiftBadgeRight`（移到下面排班模块）

### 模块 B：打卡 + 等级（保留）

### 模块 C：统计三宫格（保留）

### 模块 D：**我的排班（新内嵌模块，替代菜单跳转）**
- Card 包裹，标题"店铺排班"
- 内嵌 `<Tabs>` 「我的 / 门店」
  - 直接复用 `MyScheduleList` 与 `ShopScheduleList`
- 移除 Settings 列表中的"店铺排班"链接
- 删除 `MySchedule.tsx` 路由（保留组件文件以便复用，或仅删路由）

### 模块 E：Settings 列表（保留 SOP / Q&A / 打卡 / 历史 / 改密 / 退出）

---

## 4. 管理员后台维护

### `StaffProfileDialog.tsx` 扩展
现有员工属性弹窗增加字段：
- 真实姓名（input）
- 职位（Select：店长/正式店员/兼职/实习生）
- 门店（已有 shop_id 选择）

---

## 5. 路由 / 文件改动

### 新建
- `supabase/functions/generate-avatar/index.ts`
- `src/components/me/AvatarPicker.tsx`（头像点击菜单 + 上传/AI 生成逻辑）
- `src/components/me/SchedulePanel.tsx`（包装 Tabs + Lists）

### 修改
- `src/pages/Me.tsx` — 重构布局
- `src/components/admin/StaffProfileDialog.tsx` — 新增字段
- `src/App.tsx` — 移除 `/me/schedule` 路由（可选：保留以兼容外链）

### 数据库迁移
- `ALTER TABLE staff_profiles ADD real_name, position`
- 创建 `avatars` storage bucket + RLS
- `profiles` 表保持不变

---

## 技术细节
- AI 头像调用 Lovable AI Gateway，使用 `LOVABLE_API_KEY` 与 image preview 模型
- 上传走 supabase-js storage client，路径前缀 `{userId}/`，避免越权
- 排班 Tabs 默认值 `me`，与原 `/me/schedule` 一致
- 职位常量集中放在 `src/types/index.ts`：`POSITION_LABELS = { manager: '店长', regular: '正式店员', parttime: '兼职', intern: '实习生' }`
