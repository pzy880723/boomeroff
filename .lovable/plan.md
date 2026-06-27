## 调整目标

画风（插画风 / 真人写实）必须在「生成分镜静帧」之前就选好，不要让用户走到分镜环节再回头改。同时：

- **惊喜一下** = 不暴露画风开关，固定默认「真人写实」。
- **AI 自定义视频** = 把画风选择前置到最上面（脚本生成之前），让用户先决定画风，再生成脚本 → 分镜 → 渲染。
- 画风结构保留两个枚举（`stylized` / `photoreal`），方便后续再加新画风。

## 改动

### 1. 惊喜一下 (`src/components/marketing/SurpriseVideoDialog.tsx`)
- 移除底部的 `RealismToggle`、`realism` state、`handleRealismChange` 以及相关 import。
- 调用 `surprise-marketing-video` 预览和正式渲染时，`realism` 硬编码为 `'photoreal'`，不读 `getRealismPref()`、不写 `setRealismPref()`，避免影响自定义页的偏好。
- 其它逻辑、布局（模型选择器、ETA、分镜预览等）保持不变。

### 2. AI 自定义视频 (`src/pages/marketing/MarketingVideo.tsx`)
- 把 `RealismToggle` 从「生成分镜静帧」按钮旁边移除。
- 在页面顶部、紧跟 `PageHeader` 之后（脚本/素材/角色一切配置之前）新增一张「画风」卡片：
  - 标题「画风」+ 说明「先选好画风，再让 BOOMER 写脚本和拆分镜」。
  - 主体是 `RealismToggle`（`size="sm"`），下面一行小字根据当前值显示对应 `hint`（如「真人写实 · 细节最真」/「插画风 · 过审稳定」）。
  - 选择会立刻写入 `setRealismPref`，作为该用户在自定义页的默认。
- 默认值仍走 `getRealismPref()`（首次使用 = `stylized`，由用户主动切换），保留现有偏好记忆。
- 一旦 `script` 已生成，画风卡片切换会给一个 toast 提示「画风已切换，建议点『重做分镜静帧』重新合成」，避免老分镜与新画风不一致。生成/渲染逻辑沿用现有 `realism` 透传，无需改后端。

### 3. 不动
- `supabase/functions/_shared/realism.ts`、`storyboard-marketing-video`、`render-marketing-video`、`surprise-marketing-video` 的 prompt 分支全部保持不变。
- `src/lib/realism.ts`、`src/lib/realismPref.ts`、`RealismToggle` 组件保持不变（后续加新画风时只需扩展 `REALISM_OPTIONS`）。

## 影响文件

- 改 `src/components/marketing/SurpriseVideoDialog.tsx`
- 改 `src/pages/marketing/MarketingVideo.tsx`
