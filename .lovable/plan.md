# 「我的应用」图标改造 —— 与 BOOMER GO logo 一致的粗线圆润风

## 参考解读

用户上传的是 BOOMER GO 主 logo：红色 squircle 上一枚白色**粗线条、端头浑圆**的相机/靶心图标。当前 `AppGrid` 用的是 Lucide 默认线宽（2.2px），偏纤细，跟 logo 视觉重量不匹配。

目标：让 16 个应用图标看起来像"logo 的一家人"——同样的线粗、同样的圆头圆脚、同样的白瓷在红瓷上的比重。

## 方案

新建一套自绘 SVG 图标集 `src/components/home/BoomerAppIcons.tsx`，替换 `appIconRegistry.ts` 里的 lucide 引用。理由：
- Lucide 即便调 `strokeWidth={3}` 也只是"变粗"，端点半径和内部空间比是固定的，跟 logo 主体（明显更胖、更空灵）对不齐。
- 自绘一套可以复用同一组绘制常量，保证 16 枚图标视觉密度完全一致。

### 绘制规范（每一枚都严格遵守）

- `viewBox="0 0 24 24"`
- `stroke-width="2.6"`，`stroke-linecap="round"`，`stroke-linejoin="round"`
- `fill="none"`；主体控制在 3–20 的安全区内，四周留 3px 呼吸
- 关键实心点（如相机镜头中心圆点、图钉钉帽）用 `fill` + 无描边，保持"logo 里那颗白点"的语言
- 所有图标都是单一 `currentColor` —— 在红 tile 上就是白色，在白 tile 上就是红色，`TileFace` 已就位

### 图标对照表（16 枚）

| id | 现在 (lucide) | 新图标 (自绘) |
|---|---|---|
| scan | Camera | 相机机身 + 中心镜头圆点（**直接呼应 logo**，稍作缩小） |
| marketing | Clapperboard | 场记板，斜条 + 圆角机身 |
| activities | Megaphone | 圆嘴喇叭 + 三道声波弧 |
| community | Sparkles | 四芒星 + 两颗小圆点 |
| library | BookOpen | 打开的书，中缝圆润 |
| my-kb | BookMarked | 书 + 圆头书签带 |
| vouchers | Ticket | 圆齿票根，中间断点 |
| schedule | CalendarDays | 日历格 + 顶部两个圆头挂钩 |
| checkins | CalendarCheck | 日历 + 粗对勾 |
| sop | FileText | 卷角文档 + 三条圆头横线 |
| qa | HelpCircle | 圆 + 粗问号（下面圆点实心） |
| okr | Target | 三层同心圆（**与 logo 靶心呼应**） |
| notifications | Bell | 圆顶钟 + 底部小圆珠 |
| me | User | 圆头 + 肩线，头部实心 |
| more | MoreHorizontal | 三颗**实心圆点**，胖一些 |

### 落地步骤

1. 新建 `src/components/home/BoomerAppIcons.tsx`，导出 16 个组件（`ScanIcon`, `MarketingIcon`, ...），签名与 lucide 兼容：`(props: SVGProps<SVGSVGElement>) => JSX.Element`。
2. `appIconRegistry.ts` 的 `Icon` 字段全部换成新组件；`AppIconMeta.Icon` 类型放宽为 `React.ComponentType<React.SVGProps<SVGSVGElement>>`。
3. `AppGrid.tsx` 里 `TileFace` 中的 `<Icon>` 稍微放大到 `w-[26px] h-[26px]`（比原来 24 大一点，跟 logo 里图标占比对齐），`strokeWidth` 由组件自己写在 SVG 上（外部覆盖也行）。
4. 「消息」底部 tab 的 `Bell/MessageCircle` 与「资讯」头部图标保持 lucide —— 那些不属于"我的应用"网格，先不动，避免误伤。
5. 「添加」+ 号占位保持 lucide `Plus`，不属于品牌图标序列。

### 视觉验收

自检清单：
- 16 枚并排看，线粗、圆角、端点观感一致
- 与顶栏 wordmark、Boomer 头像、主 logo 放在一起没有"字重打架"
- 白 tile 变体（如果未来切回）自动继承 `currentColor` = 红色

## 影响文件

- 新增 `src/components/home/BoomerAppIcons.tsx`
- 修改 `src/components/home/appIconRegistry.ts`
- 微调 `src/components/home/AppGrid.tsx`（图标尺寸 24→26）

## 不动

- 图标底色/形状/拖拽/长按/编辑态逻辑
- 顶栏 wordmark、底部 tab、AI 识物相机页里的图标