## 问题

`generate-marketing-video-copy` 用了共享工具 `formatShopContext` + `scrubThirdPartyBrands`。这两个是给**视频模型 Seedance** 准备的——Seedance 看到「中信泰富 / 万象城」这类招牌会以「版权风险」拒绝出片，所以共享层把商场名替换成「本店」，还告诉模型「不要出现第三方商场名」。

但这是**写文字广告文案**，不是渲染视频。结果：门店真实名（`BOOMER·OFF 上海中信泰富店`）→ 变成「本店」；文案永远不会告诉观众门店在哪家商场，用户到不了店。

## 目标

视频文案里**自然带出门店分店名称就够了**（如：「BOOMER·OFF 中信泰富店」「上海中信泰富店 B1」）。**不要**编造地铁站、路线、附近地标——这些系统里没有、容易不准，宁可不提，客户自己会搜。视频模型侧的招牌规避链路**保持不动**。

## 改动（只动一个文件）

`supabase/functions/generate-marketing-video-copy/index.ts`

1. **本函数不再 import** `formatShopContext`、`scrubThirdPartyBrands`、`OWN_BRAND_LOCK_ZH`。
2. 本地拉店铺信息并只保留文案需要的字段：
   ```ts
   const { data: shop } = await admin.from('shops').select('name, address').eq('id', shopId).maybeSingle();
   ```
   拼一个块：`【门店】BOOMER·OFF 中信泰富店\n地址(仅供参考,不要写进文案):xxxx`——`address` **仅用于给模型定位是哪一家**，明确禁止写进输出。
3. **系统提示新增一条硬性要求**：
   > - 文案里必须自然带出**门店分店名称**（例：「BOOMER·OFF 中信泰富店」或「上海中信泰富店」），标题或正文首/尾段至少出现一次；
   > - **严禁**在文案里出现任何地铁线路、地铁站名、公交、路名、周边地标、开车路线等导航信息——系统里没有这些数据，不要凭空编；
   > - hashtags 里可以带一个城市或分店名标签（如 `#上海` `#中信泰富店`），但不加地铁/路线相关标签。
4. **移除** `OWN_BRAND_LOCK_ZH` 追加（那是给视频渲染看的招牌约束，会误导文本模型避开分店名）。
5. **移除**输出 `sanitize` 里的 `scrubThirdPartyBrands`；保留「主播→店员 / 直播间→店里 / 保真、秒杀、全网最低、拍卖行级别」等真正的敏感词过滤。
6. `userMsg` 也不再 `scrubThirdPartyBrands`。
7. 拉不到 `shop` 时：不加门店块，也不要求带门店名。

## 不动

- 视频脚本生成 / 视频渲染 (Seedance) 相关链路（`director-*`、`_shared/brand-scrub.ts`、`_shared/shop-context.ts`）——继续做招牌规避；
- 前端 UI、数据结构、其它 edge functions；
- 输入/输出契约 `{ asset_id } → { copy }` 不变。

## 验证

1. 在素材库打开一条已有视频，点击「重新生成」；
2. 生成的文案里出现分店名（例：「BOOMER·OFF 中信泰富店」），且**不出现**「静安寺 / 2 号线 / 步行 X 分钟」这类导航描述；
3. 视频脚本 / 惊喜一下渲染出来的视频画面仍然不出现第三方招牌（Seedance 侧未受影响）。
