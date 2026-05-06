## 目标
让官方知识详情页（`/library/:id`）顶部的 4 个标签 —— 品类、IP、年代、产地 —— 全部可点击，跳转到官方知识库列表页并按该标签自动筛选；列表页支持现有的搜索/排序/二级筛选。

## 改动范围

### 1. `src/pages/OfficialDetail.tsx`
将这 4 个 `<Badge>` 改成可点击：
- 品类：`navigate('/library?cat=' + item.category)`
- IP：`navigate('/library?cat=' + item.category + '&ip=' + ip_name)`（需带品类才能展示二级 IP 筛选）
- 年代：`navigate('/library?era=' + item.era)`
- 产地：`navigate('/library?origin=' + item.origin)`
加上 `cursor-pointer hover:bg-accent` 视觉提示。

### 2. `src/pages/OfficialLibrary.tsx`
- 用 `useSearchParams` 读取 `cat / ip / era / origin / q` 初始化对应 state（`cat`, `sub`, 新增 `era`, `origin`, `keyword`）。
- 在数据查询里追加：`era` → `q.eq('era', era)`，`origin` → `q.eq('origin', origin)`。
- 在搜索框下方/二级类目区，新增「当前筛选」chip 区：当 `era` 或 `origin` 非空时，显示一个可点 × 清除的圆角 chip（示例：`年代：昭和时代（约1960s） ×`）。
- state 改变时同步回 URL（`setSearchParams`），方便分享/刷新保持。
- 排序（最新/最热/重要）继续可用；当存在 era/origin/cat 任一过滤时，沿用现有「具体类目固定按 updated_at 排序」逻辑或允许排序——保持现有行为：只要不是「全部 + cat=all」就固定按更新时间倒序。这部分不变。

### 技术细节
- 只读 URL 一次初始化 state，再以 state 为唯一数据源；state 变更 → `setSearchParams({...})`。
- `keyword` 已有，URL 也同步；输入框输入时去抖（沿用现状，不新增去抖逻辑）。
- 不动数据库结构；`official_knowledge` 已有 `era`、`origin`、`ip_name`、`category` 字段。

## 不在本次范围
- 不改 `MyLibrary`、`Community` 列表的标签点击。
- 不为 era/origin 增加预设下拉列表（保持自由文本精确匹配，从详情页跳转即可命中）。
- 不修改测试逻辑或进度条。
