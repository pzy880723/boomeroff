# 营销视频流程两项升级

## 一、草稿 / 分镜 自动保存与恢复

**目标**:刷新页面、断网、误关 Tab,回来还能继续 — 不用从 0 重新和 AI 聊。

存储:`localStorage`(无需新建表,刷新即恢复;不上云,避免污染 `marketing_video_jobs`)。
Key:`mv:draft:{shopId}`,内容包含:
- `urls`(参考图)
- `vtype / style / duration / aspect / highlight`
- `character`(选中的角色)
- `brief`(对话 + draft_script,即 BriefMsg[])
- `script`(已生成的分镜,如果有)
- `updatedAt`

行为:
1. **写**:在 `MarketingVideo.tsx` 里加一个 `useEffect`,以上字段任一变化、debounce 500ms 后写入 localStorage。
2. **读**:挂载时(以及 `shopId` 切换时)读取对应 key,若存在则填充各 state。
3. **顶部提示**:若恢复了草稿,顶部显示一条浅色条 "已恢复 X 分钟前的草稿 · [清空重来]"。点清空 = 删 key + reset 所有 state。
4. **清空时机**:成功提交渲染任务(`jobId` 拿到)后自动清除该 shop 的 key,避免下次回来还看到旧草稿。
5. **容量保护**:写之前 try/catch;若超额(罕见,主要是 base64 头像)就只存非图字段。

## 二、草稿脚本里 [图 #N] 渲染成可点缩略图

**目标**:草稿是大段中文,夹着 `[图 #3]` 这种纯文字标记很费眼。改成行内小缩略图,鼠标/手指点一下能放大预览,清楚知道每段对应哪张图。

改动文件:`src/components/marketing/VideoBriefChat.tsx`

1. 给 `VideoBriefChat` 新增 prop:`imageUrls: string[]`。`MarketingVideo.tsx` 调用处传入当前 `urls`。
2. 新建一个小组件 `DraftScriptText({ text, imageUrls })`:
   - 用正则 `/\[图\s*#(\d+)\]/g` 拆分文本。
   - 命中的片段渲染成一个行内 chip:`<button>` 包一个 16×16 的圆角缩略图 + `#N` 角标,`inline-flex align-middle mx-0.5`。
   - 未命中索引(超出范围)显示成灰色 `[图 #N?]`,提示该图已被删。
   - 点击 chip 打开一个轻量 `Dialog`(用现有 shadcn `Dialog`),里面放大显示该图(`max-h-[70vh] object-contain`)。
3. `[无图]` 标记保持原样文字,不做特殊处理。
4. 只对 `kind === 'draft_script'` 的气泡用 `DraftScriptText`,普通聊天气泡保持纯文本。
5. 样式细节:chip 使用 `bg-accent/10 border border-accent/30 rounded-md px-1`,缩略图 `object-cover`,保证在 `whitespace-pre-wrap` 行内也不破坏排版(给气泡加 `leading-loose` 避免行高被撑爆)。

## 不动的地方

- 后端、edge function、数据库 schema 全部不动 — 纯前端升级。
- 分镜区(`SceneRow` / `BindingBadge`)上次刚改过,不动。
- 不动 `marketing_video_jobs` 表,不引入云端草稿(下次如果你想多端同步再说)。

## 验证

- 填好表单 + 聊出草稿 → 刷新 → 一切复原,顶部出现"已恢复 X 分钟前的草稿"。
- 点 chip 能弹窗看大图;删掉某张图后,引用它的 chip 变灰提示。
- 提交渲染拿到 jobId → 刷新 → 草稿已清空,回到全新状态。
