
# 加一道「分镜静帧」中间层

## 现状链路（问题所在）

```text
惊喜一下 → 挑实景素材 → 写脚本(文字) → Seedance 直接生成视频
                                              ↑
                                  每段的 first_frame 用的是「随机一张实景商品图」
                                  角色 cover 只塞进 reference_image(权重低)
                                  → 模型按实景空镜拍，人物经常不出现，段间跳变
```

## 目标链路（行业通用做法）

```text
惊喜一下 → 挑实景素材 → 写脚本(文字)
                            ↓
                    【新增】分镜静帧生成
                    每个分镜 → 用 Nano Banana(gemini-3.1-flash-image)
                    把「角色身份板 + 商品照 + 店铺照 + 该镜文字描述」
                    合成一张「这一镜应该长什么样」的静态图
                            ↓
                    UI 展示 N 张静帧给用户预览/换图
                            ↓
                    Seedance 渲染：first_frame = 本镜静帧
                                   last_frame  = 下一镜静帧(段间无缝)
                                   reference   = 角色身份板(锁人物)
```

## 要做的事

### 1. 新 edge function：`storyboard-marketing-video`

输入：`{ script, picked_assets, character, shop_id, style }`
对脚本里每个分镜（hook + scenes + outro）并行调一次 Nano Banana（`google/gemini-3.1-flash-image`，多图融合），prompt 模板：

```
风格：${styleEn}，9:16 竖版，影视质感单帧定格。
角色：${character.name}，外观锁：${visual_signature}（必须 100% 还原参考图里的脸/发型/服装）。
场景：${clip.scene}
动作瞬间：${clip.action}
画面里必须包含的商品/场景元素：${本镜绑定的实景照描述}
不要：字幕、文字水印、卡通化、UI 元素。
```
附图（合成参考）：角色 cover + 该镜绑定的实景素材 1–2 张。

输出：上传到 storage `marketing-storyboards/{shop_id}/{job_id}/{seg}.jpg`，回写：
```json
{ ok: true, frames: [{ scene_index, url, prompt }] }
```

并把 URL 写回 `script.scenes[i].storyboard_url` / `script.hook.storyboard_url` / `script.outro.storyboard_url`。

### 2. `surprise-marketing-video` preview 流程改造

`preview=true` 现在返回 `{ picked, assets, script, ... }` —— 多加一步：
拿到 `script` 后立刻调 `storyboard-marketing-video`，把 N 张分镜静帧塞进返回值：
```json
{ ok: true, ..., script, storyboard: [{ scene_index, url }] }
```

### 3. `render-marketing-video` 改首/尾帧来源

旧逻辑（`resolveSegmentImages`）：从 `image_urls` 里按 `image_index` 挑实景照当 first/last_frame。
新逻辑（优先级）：
1. 若该镜有 `storyboard_url` → 用静帧
2. 段间衔接：本段最后一个分镜的下一段第一个分镜的 storyboard_url → 当本段 `last_frame`
3. 角色 cover + 角色 `extra_reference_urls` → 永远作 `reference_image`（人物锁）
4. 兜底：原来的实景照

效果：
- 每段首/尾都是「我们设计好的画面」，Seedance 只做"让这张图动起来 4 秒"，方差大幅缩小
- 段 N 的 last_frame == 段 N+1 的 first_frame → 拼接处自然无缝
- 角色身份板每段都进 reference → 人脸/服装一致

### 4. `SurpriseVideoDialog` UI 升级

preview 返回后，渲染区从「N 张原始素材缩略图」改成「N 个分镜卡片」：
```
[钩子] [镜头1] [镜头2] [镜头3] [收尾]
 静帧   静帧    静帧    静帧    静帧
 2.5s   3s      3s      3.5s    3s
 "..."  "..."   "..."   "..."   "..."
```
- 点单张静帧 → 弹小窗显示该镜文字 + 「重画这张」按钮（再调一次 storyboard for that one scene）
- 底部按钮：`再换一组` / `就拍这条`

### 5. 数据库小改

`marketing_video_jobs` 用现有 `script` jsonb 存 `storyboard_url`（不需要建新表）。

### 6. 关于「角色必须出场」

跟你前面的吐槽一起修：`surprise-marketing-video` 里 `Math.random() < 0.5` 的概率挑角色 → 改为「店里若已建角色则 100% 用」。脚本生成 prompt 里 `每个镜头都把 TA 自然带入` 那段保留，但因为静帧已经合成出人，已不再依赖 Seedance 自己想象。

## 成本与时间

- Nano Banana 每张 ~$0.039，6 个分镜 ≈ $0.24/视频，加在视频成本里可忽略
- 静帧并行生成耗时 ~6-10s，加到现有 90s 渲染流程头部 → 用户感知端到端 +10s 不到
- preview 弹窗多一个 loading：`脚本已生成，正在画分镜...`

## 实现顺序

1. 新建 `supabase/functions/storyboard-marketing-video/index.ts`
2. 改 `surprise-marketing-video`：preview 末尾调 storyboard，把结果合入返回
3. 改 `render-marketing-video`：`resolveSegmentImages` 优先用 storyboard_url
4. 改 `SurpriseVideoDialog`：渲染分镜卡片 + 单镜重画
5. 角色 100% 出场 + 脚本 prompt 微调

## 不在本次改动里

- 用户手改分镜文字 → 留到下版
- 真人 + 虚拟角色同框的特殊静帧 → 留到下版
- 角色训练 / LoRA → 不动
