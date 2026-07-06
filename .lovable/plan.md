## 一句话原因

后台在把你的 15 秒请求发给火山之前，有一道"档位对齐"函数写错了：它只有 5 秒和 10 秒两个出口，没有 15 秒。所以你填 15，被偷偷改成 10 发出去，火山就按 10 秒生成。脚本、数据库、界面上一切都还显示 15 秒，只有真正下单那一步"缩水"了，所以肉眼看不出来。

## 出问题的代码

`supabase/functions/_shared/seedance-submit.ts` 第 36-39 行：

```ts
function snapR2vDuration(d: number): number {
  const n = Math.round(Number(d) || 5);
  return n <= 7 ? 5 : 10;   // ← 没有 15 这一档,15 被砍成 10
}
```

## 修法（1 行）

补上 15 这一档，跟同一个仓库里 `render-marketing-video/index.ts` 第 284 行的 `snapOneShotDuration` 保持一致：

```ts
function snapR2vDuration(d: number): number {
  const n = Math.round(Number(d) || 5);
  if (n <= 7) return 5;
  if (n <= 12) return 10;
  return 15;
}
```

## 影响

- 之后"快速生成 15 秒"会真的下单 15 秒 → 拿到 15 秒成片。
- 5 秒 / 10 秒请求完全不受影响。
- 分段渲染路径（30 秒那种拼接的）不走这条函数，也不受影响。
- 已经生成的那条 10 秒视频没法补时长，需要重新点一次"生成"才能拿到 15 秒版本。