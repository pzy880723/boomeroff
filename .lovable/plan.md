## 问题

`/history` 页面打开后白屏崩溃，提示「页面出错了」。

控制台错误：
> Objects are not valid as a React child (found: object with keys {tag, text})

## 原因

`src/pages/History.tsx` 第 332–342 行把 `selling_points` 当成字符串数组渲染：

```tsx
(product.selling_points as string[]).slice(0, 2).map((p, i) => (
  <li key={i}>· {p}</li>
))
```

但实际数据库里每个卖点是对象 `{ tag, text }`（项目里其他地方都用 `normalizeSellingPoints` 来兼容老数据）。所以 React 拿到对象就直接报错，整页被 ErrorBoundary 兜住，看起来"历史记录不能用了"。

历史记录功能本身（数据、详情弹窗、删除、编辑、分享、按分类/搜索筛选）是好的，只是这一处渲染崩溃把整页带崩。

## 修复方案

只动 `src/pages/History.tsx`：

1. 引入已有的工具：`import { normalizeSellingPoints } from '@/lib/script';`
2. 把卖点预览那一段改为：
   ```tsx
   {(() => {
     const sp = normalizeSellingPoints(product.selling_points);
     if (sp.length === 0) return null;
     return (
       <div className="bg-muted/50 rounded-lg p-3">
         <div className="flex items-center gap-1.5 text-xs font-medium text-primary mb-1.5">
           <Sparkles className="h-3 w-3" /> 核心卖点
         </div>
         <ul className="space-y-1">
           {sp.slice(0, 2).map((p, i) => (
             <li key={i} className="text-xs text-muted-foreground line-clamp-1">· {p.text}</li>
           ))}
         </ul>
       </div>
     );
   })()}
   ```

不改数据库、不改其他页面。修复后历史记录列表恢复正常显示。
