## 改动(只动 `src/pages/MyQa.tsx`)

1. **标题加粗**:卡片里 `text-sm font-medium` → `text-sm font-semibold`,详情 `SheetTitle` 已是粗体,保持。
2. **管理员入口**:用 `usePermissions().can('shop.kb.write')` 判断是否管理员。是管理员时:
   - 页面右上角(标题区)/搜索框旁出现 **魔法棒按钮**(`Sparkles` 图标 + 文案"AI 新增"),点击打开 **新建 QA 对话框**。
   - 每张 QA 卡片右上角出现 **编辑** + **删除** 两个小图标按钮(`Pencil` / `Trash2`);点击编辑打开编辑对话框,点击删除弹 confirm 后调 `supabase.from('shop_kb_entries').delete()`。
3. **AI 新增 / 编辑对话框**(同一个 `Dialog`,复用):
   - 字段:分类下拉(从现有 `cats` 选,允许留空)、标题、AI 补充提示(可选)、正文(textarea)、标签(逗号分隔)。
   - **AI 生成正文按钮**:复用现有 edge function `generate-shop-kb`,传 `{ type:'qa', topic:title, hint, categories:cats }`,返回 `{ draft:{ title, body, category_name, tags } }`:
     - 若返回 `category_name` 在现有分类里(忽略大小写) → 自动选中
     - 否则用 `shop_kb_categories.insert({type:'qa',name,sort_order})` 新建,然后选中
   - 保存:新建走 insert,编辑走 update;成功后刷新列表 + 关闭对话框。
4. **权限失败时**保持现有只读 UI,不显示魔法棒和编辑/删除。

## 不动

- 数据库结构、RLS、`generate-shop-kb` edge function、Portal 的 KbManager
- 其他页面(MyKb / MySop)的展示

## 技术细节

- `usePermissions` 已存在,直接 import:`import { usePermissions } from '@/hooks/usePermissions'`。
- 卡片右上角操作按钮放在 `ChevronRight` 之前,用 `<span onClick={stopPropagation}>` 包住避免触发父 button 打开详情;父级从 `<button>` 改成 `<div role="button" onClick>` 让内部嵌套 button 合法。
- 对话框逻辑直接抄 `KbManager` 的 entry dialog(已经验证可用),只是嵌进 MyQa 内部,不引入新文件。
- 操作完成 toast 用 `sonner`。
