# 全局检查与 Bug 修复计划

## 已发现的关键 bug

### 🔴 P0 - 影响识别正确性

**1. 新品类被强制降级为「其他」** — `src/hooks/useProductRecognition.tsx` 第 42-46 行
- `validCategories` 白名单只列了旧的 10 个品类，AI 返回的新品类（`jp_porcelain`, `eu_porcelain`, `anime_toy`, `otaku_goods`, `luxury`, `vintage_jewelry`, `game_console`, `walkman`, `ccd`, `media_record`, `playback_device`, `home_appliance`, `hobby`, `antique_art`, `local_craft`）全部被吞成 `other`
- **修**：从 `@/types` 直接导入并用 `CATEGORY_ORDER` 来校验

**2. AI 一键丰富对 `vintage_jewelry` 校验失败** — `src/components/admin/AiKnowledgeDialog.tsx` 第 41-47 行
- `VALID_CATEGORIES` 写的是 `jewelry`，类型表里实际是 `vintage_jewelry`，导致首饰品类被强制改为 `other`
- **修**：把 `jewelry` 改为 `vintage_jewelry`，整体替换为 `CATEGORY_ORDER` 引用

### 🟠 P1 - 加入失败 / 状态错乱

**3. ShareToCommunityButton 重复分享检查不生效** — `src/components/community/ShareToCommunityButton.tsx` 第 51-54 行
- `await ensureChecked()` 之后立刻 `if (shared)` 读到的是 React 闭包中的旧 state（依然 null），所以即便已分享过也会再次 INSERT，触发 RLS/duplicate 报错
- **修**：让 `ensureChecked` 返回布尔值，`handleClick` 直接用返回值判断

**4. Community 页面「直接收录为官方知识」无重试无错误细分** — `src/pages/Community.tsx` 第 173-178 行
- `Promise.all` 并发查询 + 无 `withRetry`，移动端弱网容易 `Load failed` 整体崩
- **修**：复用 `LiveStreamPanel` 里已有的 `withRetry` + 顺序探查模式（提到一个共用 helper `src/lib/network.ts` 复用）

### 🟡 P2 - 体验/逻辑小坑

**5. OfficialLibrary 重复 useEffect** — `src/pages/OfficialLibrary.tsx` 第 81-87 行
- 两个完全相同的 `localStorage.setItem('lib_view', view)`，删一个

**6. OfficialDetail body 字数显示** — 第 434 行
- `item.body.length` 对 markdown 计字符（含 `#` `*` 等），显示偏大；改成去掉 markdown 标记后计数（小修）

**7. CheckInCard 时区** — 用 `Asia/Shanghai`，但门店是日本店；DB `perform_check_in` 也写死了 Shanghai
- 此次先**保持现状**（避免动 DB 触发器风险），仅记录到下一轮统一处理

## 验证方式

完成代码修改后用 **浏览器自动化**走以下端到端路径，每步截图：

1. **AI 识别**：进入识别页 → 启动摄像头/上传图 → 检查计时器秒数走动、命中/未命中分支、`__pipeline` badge 展示
2. **加入官方知识**：identify 后点「直接收录为官方知识」→ 应一次成功且重复点击显示「已收录」
3. **分享中古圈**：连续点两次 → 第二次必须显示「已分享到中古圈」而非报错
4. **官方详情页 AI 修改 → 一键丰富**：检查 `vintage_jewelry` 类目商品保存后类目仍为首饰
5. **个人知识库 → 测验**：随机一项跑通测验、答对归档
6. **签到**：未签到状态点立即打卡 → 显示 +exp toast

## 技术细节

```ts
// 1. useProductRecognition.tsx
import { CATEGORY_ORDER } from '@/types';
const valid = new Set<string>(CATEGORY_ORDER);
const category = valid.has(data.category) ? data.category as ProductCategory : 'other';

// 2. AiKnowledgeDialog.tsx
const VALID_CATEGORIES = CATEGORY_ORDER;

// 3. ShareToCommunityButton.tsx
const ensureChecked = async (): Promise<boolean> => {
  if (shared !== null) return shared;
  if (!user) return false;
  const { data } = await supabase.from('community_posts')
    .select('id').eq('user_id', user.id).eq('product_id', productId)
    .limit(1).maybeSingle();
  const isShared = !!data;
  setShared(isShared);
  return isShared;
};
const handleClick = async () => {
  if (!user || busy) return;
  const already = await ensureChecked();
  if (already) return;
  // ... insert
};

// 4. Community.tsx — 顺序探查 + withRetry（直接 inline，无需新建 helper）
```

## 范围

- 仅修改前端文件 5 个：
  - `src/hooks/useProductRecognition.tsx`
  - `src/components/admin/AiKnowledgeDialog.tsx`
  - `src/components/community/ShareToCommunityButton.tsx`
  - `src/pages/Community.tsx`
  - `src/pages/OfficialLibrary.tsx`
- **不动**数据库、edge function、RLS、签到逻辑
- 完成后用浏览器跑端到端验证