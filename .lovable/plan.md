## 目标

把现在 12 个平铺菜单按业务域分成 5 个一级分组，子项作为二级菜单展开，缩短列表、降低查找成本。

## 分组方案

```text
人员
├─ 用户管理        (users)
├─ 角色与权限      (roles)

门店运营
├─ 门店管理        (shops)
├─ 排班管理        (schedule)
├─ 班次设置        (shifts)

知识库
├─ 门店 SOP        (sop)
├─ 顾客 Q&A        (qa)
├─ 官方知识        (official)

社区
├─ 中古圈          (community)
├─ 纠错审核        (corrections)

系统
├─ AI 模型         (ai)
├─ 闲鱼行情        (xianyu)
```

## UI 实现

文件：`src/pages/Portal.tsx`

1. 把现有 `MENU` 数组改成 `MENU_GROUPS`：
   ```ts
   { key: 'people', label: '人员', icon: Users, items: [...] }
   ```
2. 在左侧 `Sheet` 里用 shadcn `Accordion`（`type="multiple"`）渲染：
   - `AccordionTrigger` = 分组标题（图标 + 名字）
   - `AccordionContent` = 该组下的二级按钮列表
3. 默认展开当前 `tab` 所在的分组（用 `defaultValue` 计算）。
4. 顶部标题区保留 `current.label`，新增一行小字显示所属分组（"门店运营 · 排班管理"）。
5. `current` 的查找改成在所有分组的 items 里 flat 查找。
6. 二级项样式比一级项缩进一档（`pl-8`），保持选中态样式。

## 不改动

- 不改 `TabKey` 字符串、不改各管理面板组件、不动权限/路由逻辑。
- 仅 `Portal.tsx` 一个文件改动。
