
# 二级类目自动归类方案

## 当前问题

`OfficialLibrary` 用 `ip_name` 当二级类目筛选，但定义和实际数据严重脱节：

- **incense / luxury / vintage_jewelry / walkman / playback_device**：定义是「类型」（如线香/包袋/腕表），数据库存的全是「品牌」。筛选 0 命中。
- **anime_toy**：定义是 IP（高达/圣斗士），数据存的是 Sanrio/Bearbrick 等其他 IP。
- **media_record**：定义是「黑胶/CD/DVD」，数据存的是「City Pop/坂本龙一」等内容。
- **同义异写**：`索尼` vs `Sony / 索尼` vs `SONY / 索尼`、`任天堂` vs `任天堂 (Nintendo)`、`南部铁器` vs `南部铁器 (Nambu Tekki)` 各算成不同标签。
- **jp_porcelain**：约 120 条已带正确二级标签，要保留。

## 目标

把二级类目升级为**品牌 + 类型**双维度筛选，已有数据 AI 自动归并，新词条入库时 AI 一并判定。

## 数据结构改动

`official_knowledge` 表新增两列：
- `brand TEXT` —— 品牌/IP/窑口名（从 `ip_name` 迁移并规范化）
- `sub_type TEXT` —— 物品类型/工艺/题材

迁移策略：保留 `ip_name` 不删，作为冗余兼容；新写入逻辑统一写 `brand`+`sub_type`，旧字段同步写 `brand` 值确保旧代码也能读。

## 二级类目字典重写

`src/types/index.ts` 中新增两个字典：

```ts
CATEGORY_BRANDS: Record<ProductCategory, string[]>      // 品牌/IP 维度
CATEGORY_TYPES:  Record<ProductCategory, string[]>      // 类型/工艺维度
```

举例（覆盖所有 16 个一级类目，下面只列样本）：

| 一级 | 品牌 (CATEGORY_BRANDS) | 类型 (CATEGORY_TYPES) |
|---|---|---|
| jp_porcelain | 香兰社 / 大仓 / 深川 / 九谷 / 萨摩 / 有田 / 京烧 … | 品牌窑口 / 工艺技法 / 器型用途 / 花纹寓意 / 年代鉴定 / 场景搭配 |
| eu_porcelain | Wedgwood / Meissen / Royal Copenhagen / Herend / Limoges / Royal Albert | 茶具 / 餐具 / 装饰瓷 / 人物瓷偶 |
| incense | 鸠居堂 / 松栄堂 / 日本香堂 / 山田松 / 香十 | 线香 / 盘香 / 香道具 / 香炉 |
| luxury | Hermès / Chanel / LV / Cartier / Rolex | 包袋 / 服饰 / 配饰 / 腕表 |
| vintage_jewelry | Tiffany / Cartier / Mikimoto / Cameo | 项链 / 戒指 / 胸针 / 耳饰 / 带留 |
| anime_toy | Bandai / Popy / Medicom / Sanrio / 三丽鸥 | 高达 / 圣斗士 / 假面骑士 / Bearbrick / 龙珠 / 阿童木 / 食玩 |
| otaku_goods | —（多无固定品牌） | 手办 / 景品 / 吧唧 / 亚克力立牌 / 痛包 / 原画集 |
| game_console | 任天堂 / 索尼 / 世嘉 | 主机 / 掌机 / 卡带 / 配件 |
| walkman | 索尼 / 爱华 / 松下 | Walkman 磁带 / Discman / MD / 数码 |
| ccd | 索尼 / 佳能 / 卡西欧 / 富士 / 奥林巴斯 / 尼康 | —— |
| media_record | —— | 黑胶 / 磁带 / CD / DVD / LD |
| playback_device | JBL / Diatone / 山水 / 先锋 | 黑胶机 / 卡带机 / CD 机 / 收音机 / 音箱 |
| home_appliance | —— | 电视 / 收音机 / 厨电 / 灯具 |
| local_craft | 南部铁器 / 京友禅 / 江户切子 / 津轻涂 / 博多织 | 铁器 / 染织 / 玻璃 / 漆器 |
| antique_art | —— | 书画 / 漆器 / 铜器 / 木器 / 织物 / 浮世绘 / 根付 / 香炉 |
| hobby | —— | 文具 / 香水 / 烟具 / 户外 |

某些类目两个维度只有一个有意义（如 ccd 没"类型"维度），UI 只显示有内容的那一栏。

## 改动清单

### 1. 数据库迁移
- `ALTER TABLE official_knowledge ADD COLUMN brand TEXT, ADD COLUMN sub_type TEXT;`
- 加索引 `(category, brand)` `(category, sub_type)`。
- `product_knowledge` 同样加 `brand` `sub_type`。

### 2. 后端：升级 `auto-categorize-knowledge` Edge Function
- 在 prompt 里加入当前选中的 `category` 对应的品牌和类型候选清单（来自上面的字典）。
- 工具调用 schema 改为同时返回 `category` / `brand` / `sub_type`。
- 规则：
  - `brand` 必须从该 category 的 `CATEGORY_BRANDS` 中精确选一个，找不到就返回 `null`，**禁止编造新品牌**。
  - `sub_type` 同理。
  - 强调"索尼=Sony=SONY"等同义合并 → 统一写中文规范名。
- batch 模式遍历全部 official_knowledge / product_knowledge，回填 brand+sub_type；只覆盖空值或与候选清单不一致的旧值。

### 3. 新词条入库时调用同一函数
- `KnowledgeRichEditDialog`、`OfficialKnowledgeManager`、`AiKnowledgeDialog`、`KnowledgeEditDialog`：保存前调一次 `auto-categorize-knowledge`，把返回的 `brand` `sub_type` 一起 upsert。
- 编辑界面里允许用户手动覆盖 AI 选择，下拉里就是该一级类目的候选清单 + 「自定义」。

### 4. 前端筛选 UI（`OfficialLibrary.tsx`）
- 选中一级类目后，二级筛选区从单行变两行：
  - 第一行 chip：品牌（`CATEGORY_BRANDS[cat]`）
  - 第二行 chip：类型（`CATEGORY_TYPES[cat]`）
- URL 参数从 `?ip=` 拓展为 `?brand=&type=`。
- 查询条件：`.eq('brand', brand)` 和/或 `.eq('sub_type', subType)`。
- 关键词搜索同时 `or` 上 brand/sub_type。

### 5. 详情页 `OfficialDetail.tsx`
- 标题下的标签从「ip_name」改为同时显示 `brand` 和 `sub_type` 两个 Badge，点击跳到对应筛选。

### 6. 一次性后台任务
迁移完成后在 /portal 提供「全量重新归类」按钮，调用 batch 模式：
- 用 AI 把现有 124 条 jp_porcelain 的旧 ip_name（"品牌窑口/工艺技法"等元标签）重新映射到新的 brand+sub_type；
- 把 incense/luxury/walkman 等品牌名搬到 `brand`，并补 `sub_type`；
- 同义合并到规范写法。
- 失败的条目列出来供管理员手工处理。

## 实现顺序

1. 写数据库迁移（加列 + 索引）。
2. 更新 `src/types/index.ts` 加 `CATEGORY_BRANDS` / `CATEGORY_TYPES`。
3. 改 `auto-categorize-knowledge` 函数（输入清单 + 输出 brand/sub_type + 同义归并提示）。
4. 改前端编辑器（保存时落 brand/sub_type）+ 详情页 + 列表筛选。
5. 在 /portal 触发全量回填，按一级类目分批执行（jp_porcelain → 其它）。
6. 验证：每个一级类目下都能筛出非 0 结果，且没有"索尼/Sony/索尼"重复 chip。

## 不在本次范围

- `community_posts` 表不动（社区帖子不走二级筛选）。
- 不删除旧 `ip_name` 字段，保留作历史兼容；待 brand 全部回填且稳定后再考虑下线。
