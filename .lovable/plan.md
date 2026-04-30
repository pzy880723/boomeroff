## 中古圈完善

### 现状问题（src/pages/Community.tsx）
- **列表名称被截断**：`line-clamp-2`，长名称看不全
- **详情介绍不完整**：`community_posts` 表只存了 name/era/origin/selling_points/tips，没有 description / material / craft / dimensions / condition；详情面板也只渲染这几个有限字段
- **缺「收录到官方」按钮**：admin 在中古圈里看到好东西无法一键升级为官方知识；只有「收藏」（个人）

### 修改方案（只改 `src/pages/Community.tsx` 一个文件）

#### 1. 列表名称完整显示
- 把 `line-clamp-2` 移除或改为 `line-clamp-3`，并允许换行（保留瀑布流，每张卡片高度自适应即可）

#### 2. 详情打开时回查 products 完整信息
新增 state：
```ts
const [activeDetail, setActiveDetail] = useState<ProductDetail | null>(null);
const [detailLoading, setDetailLoading] = useState(false);
const [officialAdded, setOfficialAdded] = useState(false);
```

在 `openDetail(post)` 里，若 `post.product_id` 存在：
```ts
const { data } = await supabase.from('products')
  .select('description, material, craft, dimensions, condition, selling_points, tips, era, origin')
  .eq('id', post.product_id).maybeSingle();
setActiveDetail(data || null);
```

同时若 admin，查 `official_knowledge.source_product_id == post.product_id` 决定 `officialAdded` 初值。

详情面板新增展示模块（在现有 selling_points 之前/之后）：
- **介绍**：`description`（多行段落，无截断）
- **规格**：`material / craft / dimensions / condition` 用 2 列网格 KV 展示

并把 selling_points/tips 的数据来源优先用 `activeDetail`，回退到 `active` 自身。

#### 3. 详情底部按钮区
- 点赞（保留）
- **收藏到我的学习清单**（保留，文案微调）
- **直接收录为官方知识**（新增，仅 isAdmin && product_id 时显示）
  - 复用 LiveStreamPanel 同款逻辑（幂等补齐）：先查 product_knowledge / official_knowledge → 缺啥补啥
  - cover_url 用 `post.image_url`（已是上传后的 URL）
  - 成功后显示「已收录为官方知识」+ 禁用按钮
  - 错误码 42501 → 「权限不足」提示

#### 4. useAuth 引入 role
`const { user, role } = useAuth(); const isAdmin = role === 'admin';`

### 不动
- 数据库 schema、RLS、官方/个人知识库页面
- 列表卡片样式（除文本截断）

### 验收
1. 列表卡片名称不再被截断
2. 点开详情可看到完整介绍 / 材质 / 工艺 / 尺寸 / 品相
3. 普通用户在详情底部看到：点赞、收藏到我的学习清单
4. admin 额外看到「直接收录为官方知识」按钮，点击后官方知识库出现该商品
