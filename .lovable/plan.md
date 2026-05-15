## 问题根因

1. `shop_shifts` 表有 `shop_id` 字段，但「班次设置」表单从未暴露过它。历史录入的 A/B 班全部硬绑在 **上海中信泰富店**，**上海闵行728总部一条班次都没有**。
2. 排班页 `ScheduleManager` 用 `shop_id.eq.<当前店>,shop_id.is.null` 取班次。闵行店没班次也没 NULL 通配 → 表头 0 列 → 自然没有「+」可加员工。这就是你看到「没有班次也没有添加人员的地方」的原因。
3. 员工分店分配 (`staff_profiles.allowed_shop_ids` / `shop_id`) 已在 `StaffProfileDialog` 里有 UI，本次不动；闵行店即便有了班次，候选员工也得在该弹窗里把「可上班门店」勾上闵行店才会出现。

## 改动方案

### 1. 数据库（迁移）
`shop_shifts` 增加唯一约束 `(code, shop_id)`，避免同一店铺重复同代号。  
NULL `shop_id` 仍代表「全部门店通配」。

### 2. `ShiftSettingsPanel`（按"代号"分组重构）

新视图：每个 code 一张卡片，显示名称/时间/颜色 + 已适用的门店徽章列表（含"全部门店"徽章表示通配）。

**「新增班次」对话框**
- 字段：代号、名称、起止时间、颜色、启用
- 新增：「适用门店」多选 chips。逻辑：
  - 列出所有 `active=true` 门店 + 一个「全部门店（通配）」选项
  - 当代号输入后，实时查询已存在该 code 的 shop_id，**已被该 code 覆盖的门店在多选里 disabled 并标注"已配置"**
  - 若已存在「全部门店」通配行，则禁用所有具体门店选项
- 提交：对每个选中的门店 INSERT 一行（共享 code/name/time/color/sort_order）

**「编辑班次」对话框（点击卡片）**
- 同上字段；门店多选里：
  - 已有的门店 checked
  - 取消勾选 = 删除该店此 code 的行
  - 勾选新店 = 插入新行
  - name/time/color/sort_order/active 修改 → UPDATE 该 code 下所有行（保持各店一致）

**「删除班次」**
- 卡片右侧删除按钮：删除该 code 全部行（确认对话框列出涉及门店）

### 3. `ScheduleManager` 体验微调（不改动 RLS / 业务逻辑）
- 当前店铺没有任何班次时，原本只显示空表格；改为显示空状态提示卡片：
  > "上海闵行728总部 还未配置班次，请先到 [班次设置](#) 为该店新增班次。"
  并附跳转按钮，方便闭环。

## 不改的部分

- `shop_holidays` 节假日（已有 shop_id，但用户没要求改 UI；本次留作下个迭代）
- 员工分店绑定（已在 `StaffProfileDialog` 工作）
- AI 排班 edge function：已正确按 shop 过滤，无需变更
- `shift_schedules` 表与排班数据
- `MyScheduleList` / `ShopScheduleList` 客户端

## 文件改动

- 迁移：`shop_shifts` 加 `UNIQUE (code, COALESCE(shop_id, '00000000-0000-0000-0000-000000000000'))` 表达式索引
- `src/components/admin/ShiftSettingsPanel.tsx` 重构（按 code 分组 + 多店多选）
- `src/components/admin/ScheduleManager.tsx` 加空状态提示
