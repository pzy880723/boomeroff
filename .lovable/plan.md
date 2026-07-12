## 目标
备份完成通知只对管理员可见，且正文更简明，不再罗列每个文件。

## 一、只有管理员能看到备份通知

- 备份 edge function 写入 `notifications` 时保持 `type = 'backup'`，同时把 `category` 设为 `'admin'`（新字段值，纯前端约定）。
- 修改 `src/hooks/useNotifications.tsx`：加载列表前先判定当前用户是否管理员（用现有的 `has_role(auth.uid(),'admin')`，或查一次 `user_roles` 判 `role_code in super_admin/area_manager/shop_manager`）。
  - 非管理员：查询上加 `.neq('type','backup')`（或 `.neq('category','admin')`），保证列表、未读数、Bell 徽章都不含备份消息。
  - 管理员：不变。
- 一并把已有的历史 `type='backup'` 记录做同样过滤，无需数据迁移。

## 二、备份通知正文精简

修改 `supabase/functions/backup-all-to-cos/index.ts` 的 `sendCompletionNotification`：

- 不再拼 `topErrors`（把每个失败文件路径都写进去的那段去掉）。
- 标题保持 `备份成功 ✓ 成功率 X%` / `备份完成但有失败 ⚠ 成功率 X%`。
- 正文改为固定 2 行结构：

  ```
  新增文件 {filesCount} · 成功 {success} · 失败 {failed} · 耗时约 {mins} 分钟
  总表 {tables_present}/{tables_expected} · 总文件 {storage_present}/{storage_expected}
  ```

  - `filesCount` 就是本轮实际新上传/补传的文件数（`filesCount` 变量原义即此，ledger 命中不计入）。
  - `success = filesCount`（新上传成功数），`failed = meta.failures.length`。
  - `成功率 = success / (success + failed)`，无新上传且无失败时按 100%。
  - 总表 / 总文件从 `meta.reconcile` 取；没有对账数据就省略第二行。
- 失败详情不进通知正文；管理员想看细节，仍可去后台 BackupPanel。

## 技术细节
- 前端角色判定：`useNotifications` 里加一次性 `supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' })`，或直接查 `user_roles.role_code`，缓存在 state；`refresh` 复用。
- 备份 edge function 只改 `sendCompletionNotification` 内部字符串拼接和一处 `insert` 加 `category:'admin'`，不改调度、ledger、对账逻辑。

## 涉及文件
- `supabase/functions/backup-all-to-cos/index.ts`
- `src/hooks/useNotifications.tsx`
