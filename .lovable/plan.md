## 目标

1. **二级类目精准归类**：把日瓷现有 68 条以及新增条目，全部按以下 6 个二级 `ip_name` 归类（与 `CATEGORY_SUBCATEGORIES.jp_porcelain` 对齐）：
   - `品牌窑口` · `工艺技法` · `器型用途` · `花纹寓意` · `年代鉴定` · `场景搭配`
2. **图片来源**：使用真实互联网图片（**Wikimedia Commons / Wikipedia 直链 upload.wikimedia.org**），不用 AI 生成；个别冷门词条找不到 Wikimedia 图片时，回退使用 commons 通用类目封面（仍是真实摄影），实在无图才留空。
3. **大幅扩充**：在现有 68 条基础上再补 ~50–60 条，覆盖窑口、工艺、器型、花纹、年代、场景的盲区。

---

## 一、二级类目重映射（覆盖现有 68 条）

| ip_name 现值 → | 归并到二级 |
|---|---|
| 香兰社 / 深川制磁 / 源右卫门 / 有田烧 / 伊万里 / 九谷烧 / 清水烧 / 萨摩烧 / 备前烧 / 信乐烧 / 唐津烧 / 萩烧 / 益子烧 / 濑户烧 / 志野 / 织部 / 黄濑户 / 乐烧 | **品牌窑口** |
| 染付 / 色绘 / 锦手 / 金襕手 / 釉里红 / 青瓷 / 天目釉 / 锖绘 / 烧締 / 贯入 / 刷毛目 / 象嵌 / 透雕 | **工艺技法** |
| 茶碗 / 汤呑 / 急须 / 水指 / 花入 / 香炉 / 大皿 / 蕎麦猪口 / 徳利与猪口 / 向付 | **器型用途** |
| 唐草纹 / 麻叶纹 / 七宝纹 / 青海波 / 松竹梅 / 菊纹 / 梅纹 / 桜 / 鹤龟 / 鲤鱼跃龙门 / 龙凤 / 鸟兽戏画 / 源氏香 | **花纹寓意** |
| 古伊万里时代划分 / 明治期款识 / 昭和期款识 / 底款 / 圈足 / 胎质与釉色 / 金彩磨损 / 作家鉴定 / 奥田康博 / 永乐善五郎 | **年代鉴定** |
| 婚庆场景 / 寿宴场景 / 茶道场景 / 日常场景 | **场景搭配** |

执行：单条 `UPDATE official_knowledge SET ip_name = '<二级>' WHERE category='jp_porcelain' AND name LIKE '%<原 ip_name>%'`（用 name 做唯一定位，避免误伤其它品类）。

## 二、补全图片（Wikimedia 真实图片）

通过 `websearch--web_search` 搜形如 `site:commons.wikimedia.org <关键词>` 拿到 `upload.wikimedia.org/.../<文件>.jpg` 直链，写回 `cover_url`。优先级：
- 窑口：取该窑口的代表器物（如 Imari ware bowl、Kutani ware vase、Bizen tea bowl）
- 工艺：典型工艺成品图（如 sometsuke vase、tenmoku bowl）
- 器型：标志性器型图（chawan、kyusu、tokkuri）
- 花纹：装饰图案或带该图案的瓷器
- 年代/鉴定：相关器物 / 底款照片（commons 上有 mark of Imari、Meissen marks 等）
- 场景：茶事 / 婚宴 / 寿宴的传统器物组合摄影

冷门项（如「日常场景」「金彩磨损」）若无对应图片，使用同义通用图（如「日本食卓」「金襕手茶碗」）。

## 三、新增条目（~55 条，按二级分布）

### 品牌窑口（+10）
京烧·京焼（仁阿弥道八）、Noritake 则武、Okura Art China 大仓陶园、Royal Arita 皇家有田、波佐见烧、砥部烧、小石原烧、丹波立杭烧、越前烧、常滑烧

### 工艺技法（+10）
赤绘 / 吴须 / 铁绘 / 粉引 / 焼締 vs 釉物 区分 / 灰被 / 自然釉 / 化妆土 / 钉雕 / 飞鉋

### 器型用途（+10）
平向付、组皿（5/10 客）、片口、宝瓶、湯冷まし、煎茶碗、抹茶杓置、銚子・盃台、香合、灰皿（茶道）

### 花纹寓意（+10）
宝尽くし、亀甲、市松、立涌、雷文、扇面、鳳凰、唐子、四君子（梅兰竹菊）、波千鸟

### 年代鉴定（+8）
明治色绘金彩特征、大正染付、昭和电窑特征、平成现代作家、贴花 vs 手绘判别、贴金 vs 描金、口缘修复（金継ぎ）、共箱 / 共布 / 栞鉴定

### 场景搭配（+7）
怀石料理一席组合、煎茶席、薄茶席、浓茶席、年节御节料理、夏季冷茶杯、儿童节五月人形配膳

每条字段：`name` / `summary`（1–2 句中文）/ `era` / `origin` / `selling_points`（2–4 条）/ `tips`（店员一句口诀）/ `cover_url`（Wikimedia 直链）/ `ip_name`（二级类目）。

---

## 技术细节

**步骤**
1. **先运行 UPDATE**：用 `supabase--insert` 批量执行 ~68 条 UPDATE 把 `ip_name` 重写为 6 个固定值（按 `name` 精准匹配）。
2. **图片采集**：用 `websearch--web_search` 分批查询，每个二级类目内按条目搜 1 个 Wikimedia 图片直链。失败的项用通用 fallback。
3. **更新现有条目封面**：用 `UPDATE official_knowledge SET cover_url='...' WHERE category='jp_porcelain' AND name=...`。
4. **插入新条目**：构造 ~55 条 INSERT（带 `ip_name` = 二级类目、`cover_url` = Wikimedia 链接）。
5. **复核**：`SELECT ip_name, count(*) FROM official_knowledge WHERE category='jp_porcelain' GROUP BY ip_name` 确认所有条目都落在 6 个桶里，且 `cover_url` 覆盖率 > 90%。

**注意事项**
- 仅修改 `official_knowledge` 表数据，无 schema 变更。
- 全中文文案。
- 图片 URL 必须以 `https://upload.wikimedia.org/` 开头（CDN 稳定、商用合规、可热链）；其它来源（Pinterest / 博客）不使用，避免热链失效或版权问题。
- 不修改前端代码（OfficialLibrary 已支持二级类目筛选）。

**预估规模**
- UPDATE：~68 条 ip_name 重写 + ~50 条已有条目封面补图
- INSERT：~55 条新条目
- 完成后日瓷总条数约 120+，每个二级类目 15–25 条，分布均匀。
