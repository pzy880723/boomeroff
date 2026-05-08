## 目标

当某条「官方知识」是从我自己识别出的商品转出来的，并且我已经把这件商品加入了「学习清单」（`user_favorites` 中 `source_type='recognition'` 且 `source_id=official.source_product_id`），就把官方页里的「收藏」按钮隐藏，避免和个人知识库里那条记录重复。

## 受影响位置

`src/pages/OfficialDetail.tsx` 里有两处「收藏」按钮：

1. 顶部右上角浮动星标按钮（约 209–215 行）
2. 底部固定操作条里的「收藏 / 已收藏」按钮（约 525–528 行）

`src/pages/OfficialLibrary.tsx` 列表页的卡片星标（344、386 行）保持不变——列表场景下批量判定成本高，且和「重复入库」的语义关系不强，仅在详情页做收口。

## 实现要点

在 `OfficialDetail.tsx` 的 `load()` 中，拿到 `item` 之后多查一次：

```ts
let alreadyInPersonal = false;
if (data?.source_product_id) {
  const { data: rec } = await supabase
    .from('user_favorites').select('id')
    .eq('user_id', user.id)
    .eq('source_type', 'recognition')
    .eq('source_id', data.source_product_id)
    .maybeSingle();
  alreadyInPersonal = !!rec;
}
setAlreadyInPersonal(alreadyInPersonal);
```

新增 state `alreadyInPersonal: boolean`。

渲染时：

- 顶部星标按钮：`!alreadyInPersonal && <button>...</button>`
- 底部操作条：当 `alreadyInPersonal` 为 true 时，把「收藏」按钮替换为一个不可点的提示徽标 `已在个人知识库`（带 `Check` 图标），保留右侧「来测一测」按钮占位，整体仍是两栏布局，避免按钮跳变。

不改后端、不改 RLS、不改 OfficialLibrary 列表页，不影响其它入口。
