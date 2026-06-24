## 目标
把"渲染模型"模块从占满半屏的三张大卡，缩成一行紧凑控件，详细规格收进展开层。

## 方案：折叠式单行选择器
默认状态只显示一行（约 44px 高）：

```
渲染模型   [Pro ✓ 推荐 ▾]   单段≤10s · 720p · ~90s
```

- 左：标签"渲染模型"
- 中：当前选中模型的胶囊按钮（名字 + 推荐/未开放徽章 + 下拉箭头）
- 右：一行关键参数摘要（时长/分辨率/预计耗时），灰色小字

### 点击展开
点胶囊后用 Popover（已有 `src/components/ui/popover.tsx`）弹出菜单：
- 列出 Pro / Fast / Mini 三项，每项一行：名字 + tagline + 关键规格（最长/分辨率/速度/费用）紧凑两行布局
- 当前项打勾，未开放项灰显并显示开放时间
- 点击选中后立刻关闭 Popover + 触发原有 toast

### 改动文件
- `src/components/marketing/SeedanceModelPicker.tsx`：重写为折叠式 + Popover；保留原 props (`value`/`onChange`/`compact`)，对外 API 不变，所以 `MarketingVideo.tsx`、`SurpriseVideoDialog.tsx` 无需改动。

### 不动的内容
- `seedanceModels.ts` 数据、edge function、渲染流程、确认条、按钮文案动态切换全部保留。
- 渲染中的"当前模型"展示卡照旧。

效果：模块高度从 ~220px 降到 ~44px，需要看差异时一点即开。
