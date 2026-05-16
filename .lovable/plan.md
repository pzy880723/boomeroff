## 问题诊断
截图里小精灵几乎不可见，只剩暗影 + 背景光晕。根因：

**VP9 WebM 缺 `alpha_mode=1` 元数据**。上一轮用 `libvpx-vp9 -pix_fmt yuva420p` 编码，但没写 `-metadata:s:v:0 alpha_mode="1"`。Chrome/Edge 看到 webm 没有这个 tag 就不启用 alpha 通道，把 alpha 平面当垃圾丢掉，原本透明的区域渲染成黑色，叠在抽屉的深色 BG 上 → 整个角色变成暗影。

## 修复方案

### 一、重编码两段 WebM
在 `/mnt/documents` 用 ffmpeg 重新做：
```
ffmpeg -y -i spirit-{name}-raw.mp4 -an \
  -vf "chromakey=color=0xF3F5F2:similarity=0.18:blend=0.12,\
       despill=type=green:mix=0,\
       scale=512:512:flags=lanczos,format=yuva420p" \
  -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 32 -row-mt 1 -auto-alt-ref 0 \
  -metadata:s:v:0 alpha_mode="1" \
  spirit-{name}.webm
```

关键差异：
- 加 `-metadata:s:v:0 alpha_mode="1"` ← **核心修复**
- chromakey similarity 0.13 → 0.18，blend 0.08 → 0.12（边缘更干净）

### 二、校验
1. `ffprobe -show_streams` 确认 alpha_mode tag 存在
2. 提第 30 帧 → 落到红色 BG → 肉眼看角色是否清晰、边缘干净、无暗带
3. 如果还有问题，回退到 **APNG**（`ffmpeg -plays 0 -f apng`），所有浏览器原生 alpha 支持，体积约 1MB 可接受

### 三、前端微调（`SpiritMascot.tsx`）
- `drop-shadow` filter 从 `<video>` 元素移到外层 wrapper `<div>`，避开 Safari/Chrome 对带 alpha video 套 filter 的渲染差异
- 加 `onLoadedData` + 2s 超时检测：拿不到帧就 fallback 到 canonical PNG
- 大头像（SpiritChatPanel 那个 ~120px）和浮窗都保留视频（按用户选择）

### 四、验证
- 浏览器预览刷新，浮窗 + 抽屉都看小精灵是否清晰
- console 看是否有 video decode 报错
- 用 image_tools 把 preview 截图 zoom 到小精灵区域核对

## 不动的部分
- canonical PNG、首帧 mp4 源、idle/wave 动作内容都不重新生成
- useTasks 修复不动
- SpiritChatPanel 布局不动

## 技术细节
关于 alpha_mode：这是 WebM/Matroska 容器层的字符串元数据，浏览器据此决定是否把 VP9 的 yuva420p 平面分离出 alpha。无此 tag 时绝大多数浏览器忽略 alpha → 黑底；有此 tag 时正常透明。这是 webm + alpha 路线最常见的坑。
