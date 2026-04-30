## 目标

把官方知识库的「品类」从现有 10 项重构为用户指定的 16 大类，每类配一个 lucide 图标 + 中文名，并为每个类目预填一批官方词条（带封面图、年代、产地、卖点、贴士）。

## 新品类清单（16 项 + other 兜底）

| 枚举值 | 中文标签 | 图标 (lucide-react) |
|---|---|---|
| `jp_porcelain` | 日瓷 | `Cherry` 或 `CircleDot` |
| `eu_porcelain` | 欧瓷 | `Crown` |
| `incense` | 线香 | `Flame` |
| `antique_art` | 古美术 | `Landmark` |
| `local_craft` | 本地特色 | `MapPin` |
| `anime_toy` | 动漫玩具 | `ToyBrick` |
| `otaku_goods` | 二次元周边 | `Sparkles` |
| `luxury` | 奢侈品 | `Gem` |
| `vintage_jewelry` | 中古首饰 | `Diamond` |
| `game_console` | 游戏机 | `Gamepad2` |
| `walkman` | 随身听 | `Headphones` |
| `ccd` | CCD | `Camera` |
| `media_record` | 音像制品 | `Disc3` |
| `playback_device` | 播放设备 | `Radio` |
| `home_appliance` | 家用电器 | `Tv` |
| `hobby` | 兴趣爱好 | `Puzzle` |
| `other` | 其他 | `Package` |

旧值 `porcelain / stationery / lacquerware / bronze / woodcraft / textile / jewelry / painting` 不再出现在 UI 选择器，但**保留在 PG 枚举里**（PG 不支持移除 enum 值），现有数据不丢失。

## 实施步骤

### 1. 数据库迁移：扩展 `product_category` 枚举

通过迁移工具执行：

```sql
ALTER TYPE public.product_category ADD VALUE IF NOT EXISTS 'jp_porcelain';
ALTER TYPE public.product_category ADD VALUE IF NOT EXISTS 'eu_porcelain';
ALTER TYPE public.product_category ADD VALUE IF NOT EXISTS 'antique_art';
-- ... 其余新值同理
```

旧的 `porcelain` 改归 `jp_porcelain`/`eu_porcelain` 时只在新数据上生效，老数据保持不动。

### 2. 前端类型与图标映射

- 改 `src/types/index.ts`：
  - 扩充 `ProductCategory` 联合类型（追加 16 个新值，保留旧值以兼容历史数据）。
  - `CATEGORY_LABELS` 追加新值的中文标签；旧值保留以正确显示历史词条。
  - 新增 `CATEGORY_ORDER: ProductCategory[]` —— UI 只渲染这 16 + `other` 项，旧值不在序列里。
  - 新增 `CATEGORY_ICONS: Record<ProductCategory, LucideIcon>` 映射。

### 3. UI：在「官方知识库」展示图标 + 文字的类目栏

改 `src/pages/OfficialLibrary.tsx`：
- 顶部把现在横滑 `Badge` 改成 **2 行网格的类目卡片**（icon 在上、中文名在下，选中态高亮），数据源用 `CATEGORY_ORDER`。
- 选中"全部"显示所有，选中某类目按 `category` 过滤。
- `OfficialKnowledgeManager` 后台的 Select 也用 `CATEGORY_ORDER`，并在选项里显示 icon。

### 4. AI 识别 prompt 同步

改 `supabase/functions/recognize-product/index.ts` 第 161 行的 category 候选枚举，改成 16 个新值（防止 AI 仍返回旧的 `porcelain`）。

### 5. 批量插入官方词条（每类 4-6 条，共约 70 条）

通过 insert 工具执行一条多值 INSERT，每条含 `name / category / ip_name / summary / era / origin / cover_url / selling_points(JSONB) / tips`。配图优先用 Wikimedia Commons 公共域直链（`upload.wikimedia.org`），找不到稳定公图的留 `null`（前端有"无图"占位）。

按类目预填示例：

- **日瓷**：伊万里烧、有田烧、九谷烧、清水烧、备前烧、萨摩烧
- **欧瓷**：Meissen 麦森、Royal Copenhagen、Wedgwood、Herend、Limoges、Royal Albert
- **线香**：日本香堂"毎日香"、松栄堂、鸠居堂、香十、山田松香木
- **古美术**：浮世绘、根付、煎茶道具、香炉、文房古玩
- **本地特色**：江户切子、津轻涂、南部铁器、京友禅、博多织
- **动漫玩具**：超合金魂、超合金、Bandai 圣斗士圣衣神话、Popy DX、Tomy 变形金刚
- **二次元周边**：景品手办、吧唧、亚克力立牌、痛包、原画集
- **奢侈品**：Hermès Birkin、Chanel Classic Flap、LV Monogram、Cartier Love、Rolex Submariner
- **中古首饰**：Mikimoto 珍珠、Tiffany Open Heart、Cartier Trinity、欧洲 Cameo、和服带留
- **游戏机**：Famicom、Super Famicom、Game Boy、GBA、NDS、PS1、PSP、Sega Saturn
- **随身听**：Sony WM-2、WM-DD、CD Walkman D-50、MD MZ-E10、Aiwa HS-PX
- **CCD**：Sony Cyber-shot DSC-T、Canon IXY、Casio EX-Z、Nikon Coolpix S、富士 FinePix F、Olympus μ
- **音像制品**：山口百惠 LP、中森明菜 LP、City Pop（山下达郎/大泷詠一）、宫崎骏 OST、坂本龙一 / YMO、镭射影碟
- **播放设备**：Technics SL-1200 黑胶机、Sony 卡座、Marantz 功放、JBL 古董音箱、收音机 Sony ICF
- **家用电器**：National 复古风扇、Toshiba 早期电饭煲、Sharp 复古冰箱、Sanyo 录像机、复古电视显像管
- **兴趣爱好**：胶片相机（FM2 / Leica M）、机械键盘、钓具、模型车、复古自行车

### 6. 验证

- `/library` 顶部能看到 16 个图标 + 文字的类目，能点击切换并出现对应词条。
- `/portal → 官方知识库` 后台 Select 显示新品类，可新增/编辑。
- 历史数据（仍是 `porcelain` 等旧值）以旧标签正常显示，不报错。

## 不在范围内

- 不删除旧枚举值（PG 限制 + 保护历史数据）。
- 不改个人知识库 / 社区 / 识别 UI 之外的卡片设计。
- 不抓取商业网站图片，仅用公共域 / 留空。
