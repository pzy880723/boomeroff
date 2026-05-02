## 问题诊断

用户截图：底部 tab 高亮的是「AI 识物」(/scan)，但页面显示「页面出错了」——即 `ErrorBoundary` 被触发。

控制台运行时错误（已抓到）：
```
Objects are not valid as a React child (found: object with keys {tag, text})
```

`{tag, text}` 正是新版 `sellingPoints` 元素的形状。说明 Scan 页（`LiveStreamPanel` → 渲染识别结果或历史 currentProduct）链路里，**有一处把 `selling_points` 数组元素当字符串直接渲染**了，而不是走 `normalizeSellingPoints()`。

已确认安全的位置（都走了 normalize）：
- `ProductDetailCard.tsx`（line 49）
- `ProductDetailDialog.tsx`（line 79）
- `MyLibrary.tsx`（line 420，取 `.text`）

最可疑的 1 个位置 + 2 个隐患：

1. **`LiveStreamPanel.tsx` line 509–521** —— 当 `result` 为空、用 `currentProduct`（DB 行）合成 `baseResult` 时：
   ```ts
   sellingPoints: currentProduct.selling_points || [],   // 直接塞入 DB 的 jsonb
   tips: currentProduct.tips,                             // DB 是字符串/可能是 JSON 字符串
   ```
   后续传给 `ProductDetailCard` 的 `result`，理论上 ProductDetailCard 会再 normalize，所以不直接崩。
   但 `displayResult` 同时也被传给 **`ShareToCommunityButton`** 等子组件，且某些代码路径里数组会被展开渲染。

2. **真正崩点的最大嫌疑：`ShareToCommunityButton` 内部渲染、或 LiveStreamPanel 顶部某个老的 Card 把 `selling_points` 元素直接 `{item}` 渲染**。需要逐一排查 LiveStreamPanel 1–500 行（标签 chips、价格区、上一次结果 preview 等）和 ShareToCommunityButton 的 JSX。

3. ErrorBoundary 弹了之后用户看到的是兜底，没有原始组件树位置——应在 `componentDidCatch` 里把 `info.componentStack` 也打到控制台 + toast 一个简短码，方便下次定位。

## 修复方案

### 一、强化 `LiveStreamPanel` 中 `currentProduct` → `baseResult` 的转换（防御）

在 line 509 处，把 `selling_points` 与 `tips` 直接走 normalize，再传出，避免任何下游误把对象当 React child：

```ts
import { normalizeSellingPoints, normalizeTips } from '@/lib/script';

const baseResult: RecognitionResult | null = result || (currentProduct ? {
  ...,
  sellingPoints: normalizeSellingPoints(currentProduct.selling_points), // ← 已是 {tag,text}[]
  tips: normalizeTips(currentProduct.tips) ?? undefined,                // ← 已是 {memory,objection} | null
} : null);
```

### 二、扫一遍 LiveStreamPanel 1–500 行

定位任何 `selling_points.map(...)` / `{sp}` / `{tips}` 这种把对象直接当 children 的地方，改为：
- 卖点：调 `normalizeSellingPoints(...)` 后渲染 `.text`（带 `.tag` chip 可选）
- tips：调 `normalizeTips(...)` 后渲染 `.memory` / `.objection`

### 三、`ShareToCommunityButton` 内部 JSX 兜底

在保存到 community_posts 前没问题（line 66 直接当 jsonb 存），但若组件 JSX 内有任何 `{sellingPoints[i]}` 直接渲染需改为 `normalizeSellingPoints(sellingPoints)[i].text`。

### 四、`ErrorBoundary` 增强诊断

`src/components/system/ErrorBoundary.tsx`：
- `componentDidCatch` 里 `console.error` 同时打印 `info.componentStack`
- UI 错误详情里追加一行 `componentStack` 的前 5 行，便于用户截图反馈

### 五、（可选）页面级而非应用级兜底

当前 `MainLayout` 的 `ErrorBoundary scope="page"` 包住了所有 tab outlet，单页崩了底部 tab 还在（截图也证实了）。这点保留，但在 fallback 里加一个「切换到其他 Tab 试试」的提示链接。

## 验证

1. 把现有线上用户某个会触发的商品打开 Scan 页 → 不再白屏，看到正常识别结果；
2. 控制台仍能看到 `[ErrorBoundary:page]` 日志带 componentStack（万一别处再炸有据可查）；
3. 老版本 `selling_points: string[]` 与新版 `selling_points: {tag,text}[]` 两种数据都能正常渲染；
4. 老 tips（纯字符串）与新 tips（`{memory,objection}` 或其 JSON 字符串）都能渲染。

## 影响文件

- `src/components/dashboard/LiveStreamPanel.tsx`
- `src/components/community/ShareToCommunityButton.tsx`（如发现内部直渲染）
- `src/components/system/ErrorBoundary.tsx`
