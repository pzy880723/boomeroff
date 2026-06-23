## 问题
素材库页面在有"生成中"视频任务(截图里 `生成中 0/3`)时不停闪烁、loading 转圈反复出现。

## 根因
`src/pages/marketing/MarketingLibrary.tsx` 第 137–181 行的视频轮询 `useEffect`：
- 依赖数组是 `[items]`
- effect 一进来就同步 `tick()`，tick 里调用 `poll-marketing-video` 并 `setItems` 更新 status / 进度 / segment_done
- `setItems` → items 引用变 → effect 清掉 interval 重新跑 → 又立刻 `tick()` …

于是只要有 1 个未完成视频任务,就会不停重渲染 + 不停发轮询请求,UI 闪烁。

另外 `load()` 里每次都 `setLoading(true)`,实时订阅触发的 reload(第 63–75 行)在频繁更新时也会让骨架/loading 反复出现,加重闪烁感。

## 修复方案(只动这一个文件)

1. **重写轮询 effect 依赖**：不再依赖整个 `items`,而是依赖 pending 任务的稳定签名 —— 把所有未完成 video 的 `id|status|segment_done|segment_total` 拼成一个字符串作为依赖。这样：
   - 真有新任务进入 pending 时才重订阅
   - tick 内 `setItems` 触发的"无意义"items 引用变化不会重启 effect
   - 用 `useRef` 持有最新 pending 列表,interval 里读 ref,而不是闭包里的旧数组

2. **interval 改为先等 10s 再 tick**：去掉 effect 启动时的同步 `tick()`,避免一进来就发请求 + setItems 的瞬时回环。首次也用 `setTimeout` 触发,或直接让 `setInterval` 自己 10s 后第一次触发。

3. **实时订阅的静默刷新**：把 `load()` 拆出一个 `reload()` 版本(不 `setLoading(true)`),postgres_changes 回调走 `reload()`,首次加载才走 `load()`。这样后台同步不会让整页骨架闪。

## 技术细节

```text
useEffect 依赖：
  const pendingSig = items
    .filter(it => it.kind === 'video' && it.meta?.job_id
                  && !['succeeded','failed'].includes(it.meta?.status))
    .map(it => `${it.id}:${it.meta?.status||''}:${it.meta?.segment_done||0}/${it.meta?.segment_total||0}`)
    .join('|');

  const pendingRef = useRef<any[]>([]);
  pendingRef.current = pending;          // 每次渲染同步

  useEffect(() => {
    if (!pendingSig) return;
    let cancelled = false;
    const tick = async () => { for (const it of pendingRef.current) { … } };
    const t = setInterval(tick, 10000);  // 不再立即 tick
    return () => { cancelled = true; clearInterval(t); };
  }, [pendingSig]);
```

```text
load 拆分：
  const fetchItems = async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    … setItems(data || []);
    if (!silent) setLoading(false);
  };
  // 首次 + 切店铺
  useEffect(() => { fetchItems(false); }, [user, shopId]);
  // 实时订阅
  reloadTimer.current = window.setTimeout(() => fetchItems(true), 400);
```

## 不会改动
- `runStitch` 拼接逻辑、edge function、DB schema、其他 tab/筛选/UI 都保持不变。
- 其它页面无改动。
