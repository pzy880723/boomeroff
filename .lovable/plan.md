## 门店选择 + 我的页门店名称

### 一、注册流程
- `RegisterForm` 增加"所属门店"下拉（必填），从 `shops` 表读取 active=true 列表
- 如果当前 `shops` 为空，下拉禁用并提示"请先联系管理员创建门店"
- 提交时把 `shop_id` 一起传给 `public-register` edge function
- `public-register`：新增 `shop_id` 入参（必填，UUID 校验），用户创建成功后写入 `staff_profiles`：
  ```text
  staff_profiles { user_id, shop_id, employment_type='regular', ... 默认值 }
  ```
  使用 service role 绕过 RLS

### 二、我的页头部显示门店名
- `Me.tsx` 在 `useEffect` 中追加查询：`staff_profiles.shop_id` → `shops.name`
- 在用户名右侧（`Edit2` 之后）追加门店徽章：`<Badge variant="outline">📍 本店</Badge>`
- 没有门店归属时显示灰色 "未分配门店"

### 三、后台门店管理
- 新增 `src/components/admin/ShopManager.tsx`：列表 + 新增/编辑/停用
  - 字段：名称、地址（可选）、排序、启用
- `Portal.tsx` 顶部 Tab 增加 `shops` 项「门店」（放在最前），渲染 `<ShopManager />`
- 已有 `shops` 表 RLS 已支持 admin 写入，无需迁移

### 四、不做
- 不做注册时切换门店的复杂逻辑（用户后续如需调整由管理员在 ScheduleManager 的员工属性中修改）
- 不在底部 Tab 之间增加门店切换器（系统当前为单门店运营，门店字段是预留 + 注册归属）

### 五、改动文件清单
- `supabase/functions/public-register/index.ts` — 接 shop_id，写 staff_profiles
- `src/components/auth/RegisterForm.tsx` — 加门店下拉
- `src/pages/Me.tsx` — 头部加门店 Badge
- `src/pages/Portal.tsx` — 加 shops Tab
- `src/components/admin/ShopManager.tsx` — 新建 CRUD 组件
