## 目标
BOOMER 帮我拍 / AI 自定义视频生成的所有分镜静帧,自动归档到素材库的新增「分镜头」类别;并把数据库里已有的 156 张历史分镜头图片一次性回填进素材库。

## 改动一览

### 1. 新增"分镜头"作为素材类别
- `marketing_assets.category` 是自由文本字段,直接用固定值 `分镜头` 作为统一类别名。
- 前端 `MarketingLibrary.tsx` 和 `LibraryImagePickerDialog.tsx` 的分类筛选器目前从已有数据 distinct 出列表,会自动出现"分镜头";额外把它列入预置 chip 顺序(放到「图片」分组),无需手动建表。

### 2. 分镜头生成时自动入库
改 `supabase/functions/storyboard-marketing-video/index.ts`:每帧成功上传到 storage 后,额外写一条 `marketing_assets`:
- `kind = 'photo'`
- `category = '分镜头'`
- `tags = ['分镜头', styleKey, `场景${index+1}`]`(去重去空)
- `output_url` = storage 路径(沿用素材库现有 signed URL 解析逻辑)
- `meta = { source: 'storyboard', session_id, scene_index, script_caption, video_job_id? }`
- `sha256` 由帧字节算出,**按 (user_id, sha256) 去重**:已存在则跳过(避免同一会话重复刷)
- `user_id` / `shop_id`:从调用入参取(函数已有 shopId;user_id 透传自 `surprise-marketing-video` / `MarketingVideo.tsx`,需要补一个 caller_user_id 参数,默认回退到 JWT 解码)

不阻塞主流程:入库失败只 warn,不影响 storyboard 返回。

### 3. 回填历史 156 张分镜图
新建一次性 Edge Function `backfill-storyboard-assets`(管理员触发,带 admin guard):
- 列出 `storage.objects` 中 `bucket_id='marketing-videos'` 且前缀 `storyboards/` 的所有对象
- 路径解析 `storyboards/{shop_id}/{session_id}/{idx}.png`
- 通过 `session_id` → `marketing_video_jobs` 反查 `user_id`(脚本里 `script.session_id` 或 `meta.storyboard_session_id`);查不到的回退到 shop 的任一管理员账号
- 对每张图下载、算 sha256、按 (user_id, sha256) 去重后写入 `marketing_assets`,字段同上,`meta.backfilled=true`
- 失败的图(签名失败 / 已过期 / 损坏)汇总返回,不阻塞其他

在 `/portal` 增加一个"回填分镜头到素材库"按钮(管理员可见,一键调用上面这个函数,显示成功/跳过/失败数量)。

### 4. 前端展示
- 素材库列表里,「分镜头」分类的卡片右上角加一个小角标 `分镜头`(用 Badge 复用现有标签样式)。
- `LibraryImagePickerDialog` 的筛选 chip 把「分镜头」置顶,方便挑图二次创作。

## 技术细节
- 不动 `marketing_assets` 表结构(`sha256`/`category`/`tags` 已存在)。
- 复用现有 `compressForUpload`?不需要——分镜帧已是 1024 PNG,直接存。
- 去重粒度:同一用户同一 sha256 跳过;不同用户的同图独立入库(保留个人素材库隔离规则)。
- 回填脚本只跑一次,完成后按钮可保留(幂等)。

## 不做
- 不引入新的表/枚举。
- 不动 surprise-marketing-video 的核心流程,只透传 user_id。
- 不删除 storage 中原有的 storyboards/ 文件。
