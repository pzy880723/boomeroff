## 目标
在排班表点 "+" 选择员工后，不再触发整周 `refresh()`（导致表格闪烁/重渲染），而是直接把新排班乐观地加入本地状态，让 UI 立即更新。删除排班（点 X）和清空本周也一并改为本地状态更新，体验一致。

## 修改范围
仅改 `src/components/admin/ScheduleManager.tsx` 一个文件，纯前端，不动数据库与 RLS。

## 具体改动

1. `addAssign(date, code, userId)`
   - 仍执行规则校验和 confirm。
   - 如已有同 user+date 记录：先调用 `update`，成功后用 `setScheds` 把该条 `shift_code` 改为新值。
   - 否则：先 `insert(...).select().single()` 拿回带 id 的记录，再 `setScheds(prev => [...prev, newRow])`。
   - 失败时 toast 报错，不修改本地状态。
   - 移除末尾的 `refresh()`。

2. `removeAssign(id)`
   - `delete` 成功后 `setScheds(prev => prev.filter(r => r.id !== id))`，移除 `refresh()`。

3. `clearWeek()`
   - 成功后直接 `setScheds([])`，移除 `refresh()`。

4. `aiGenerate()`
   - 仍保留 `refresh()`（一次性批量生成，乐观更新成本高且服务端是权威结果）。

5. 切换周/门店的 `useEffect(refresh, [weekStart, shopId])` 保持不变。

## 不改动
- 校验逻辑、Popover、样式、shifts/users 加载流程
- StaffProfileDialog 保存后的 `onSaved={refresh}`
- 后端、RLS、edge functions
