## 目标

在识别结果卡上加一个「查闲鱼行情」按钮。店员点了之后，后台用 Firecrawl 搜 goofish.com 的同款标题+价格，再让 AI 汇总成"价格区间 / 平均价 / 建议价"。结果永久缓存在数据库，不自动刷新。门店自己的成交价仍然是主显示，闲鱼数据放在下面做参考。

## 一、数据库迁移

新增 `xianyu_price_snapshots` 表（同款商品行情缓存）：

```text
id              uuid pk
product_id      uuid           -- 关联 products.id（可空，给纯关键词查询留口子）
query_key       text not null  -- 归一化关键词 = 品牌+型号+品类，便于复用
min_price       numeric        -- 区间下限（剔除离群后）
max_price       numeric        -- 区间上限
avg_price       numeric        -- 平均价
suggested_price numeric        -- AI 建议挂牌价
sample_count    int            -- 参与统计的有效条目数
samples         jsonb          -- [{title, price, url, sold}] 前 10 条原始样本
notes           text           -- AI 给出的一句话点评
created_by      uuid
created_at      timestamptz default now()
updated_at      timestamptz default now()
unique(query_key)              -- 同 key 只留一份；管理员后台可手动重抓覆盖
```

RLS：
- SELECT：所有 `authenticated` 可读
- INSERT/UPDATE：管理员或店员（has_role admin/anchor）
- DELETE：仅管理员

## 二、Edge Function：`fetch-xianyu-price`

新增 `supabase/functions/fetch-xianyu-price/index.ts`，需要 JWT。

输入：`{ productId?, name, brand?, era?, category? }`

流程：
1. 拼归一化 `query_key`（去空格、小写、保留中日字符）。
2. **先查缓存**：命中 `xianyu_price_snapshots` 直接返回，前端按"永不自动刷新"约定；带 `fromCache: true`。
3. 未命中 → 调 Firecrawl `/v2/search`：
   - `query`: `site:goofish.com ${name} ${brand ?? ''} ${era ?? ''}`
   - `limit: 20`，`tbs: 'qdr:y'`（一年内），`scrapeOptions: { formats: ['markdown'] }` 取标题+卡片文本
4. 把结果丢给 Lovable AI（`google/gemini-2.5-flash` + `submit_xianyu_summary` tool），让它：
   - 过滤掉明显不相关条目
   - 抽取 `[{ title, price, url, sold }]`
   - 算 min/max/avg（剔除上下 10% 离群）
   - 给出 `suggested_price`（中位数附近，结合品相说明）+ 一句话点评
5. 写入 `xianyu_price_snapshots`，返回完整数据。

错误处理：Firecrawl 没结果 → 返回 `{ empty: true }`，前端显示"暂无闲鱼行情数据"。

## 三、前端

### 1. 类型扩展（`src/types/index.ts`）
`RecognitionResult` 增补可选字段：
```ts
xianyuPrice?: {
  min: number; max: number; avg: number; suggested: number;
  sample_count: number;
  samples: Array<{ title: string; price: number; url: string; sold?: boolean }>;
  notes?: string;
  fromCache?: boolean;
};
```

### 2. 新组件 `src/components/recognition/XianyuPriceCard.tsx`
独立小卡片，三态：
- **未查询**：单按钮「🔍 查闲鱼行情」(ghost 风格，带说明小字"按需查询，约 5-10 秒")
- **加载中**：按钮 disabled + spinner，文案"正在抓取闲鱼同款…"
- **结果**：
  - 区间 `¥xxx ~ ¥xxx`（大字）
  - 平均价、建议挂牌价两个 metric
  - 样本数 + "数据更新于 yyyy-MM-dd"
  - 折叠"查看 N 条样本"展开列表（标题 + 价格 + 跳转链接 + 已售徽章）
  - AI 一句话点评

调用 `supabase.functions.invoke('fetch-xianyu-price', …)`。

### 3. 接入 `ProductDetailCard.tsx`
- 顶部商品标题区块**保留**现有的"最近成交 ¥xxx"徽章（门店内部价为主）。
- 在「完整介绍」上方插入 `<XianyuPriceCard productId={…} name={…} brand={…} era={…} />`。
- 卡片标题文案明确写「闲鱼行情参考 · 仅供参考，店内成交价以上方为准」，避免店员误用。

## 四、管理员后台 `/portal`
在 `KnowledgeManager` 旁加一个轻量 tab「闲鱼行情缓存」：
- 列出 `xianyu_price_snapshots`（最近 50 条），可搜索 query_key
- 行操作：「重抓」(调同一个 edge function 带 `force: true`) / 「删除」
满足"永不自动刷新，需要管理员手动重抓"。

## 五、Firecrawl 注意事项
- Firecrawl 已经作为 connector 链接，密钥 `FIRECRAWL_API_KEY` 已注入 edge function 环境变量。
- 用 REST `https://api.firecrawl.dev/v2/search`，不走 connector gateway（Firecrawl 是直 API，不是网关型）。
- 失败码 402 → 在响应里给前端友好提示「行情查询额度不足，请联系管理员」，不暴露技术细节。

## 六、不在本次范围
- 不做定时刷新 / cron
- 不修改现有 `price_records` 表结构
- 不动门店"最近成交价"徽章的位置和样式
- 不在社区/官方知识页面加按钮，仅识别结果卡

## 验收
1. 识别完商品 → 看到「查闲鱼行情」按钮
2. 点击 → 5-10 秒后出现区间/平均/建议价 + 样本列表
3. 再次识别同款 → 直接命中缓存，秒出
4. 管理员在 `/portal` 能看到所有快照、能"重抓"
5. 顶部"最近成交"徽章仍然是门店自己的价
