## 背景

刚才那条视频渲染报「涉及版权风险」,是 Seedance 判定脚本/画面里出现了受保护的第三方商场名/招牌(比如「中信泰富店」这种)。上一轮我们把文案改成会主动写出分店名,同时 `brand-scrub.ts` 里第三方词一律替换成「本店」——两边都要调整。

## 目标

- 视频脚本 + 渲染:继续把第三方商场名剥掉,避免 Seedance 拒片。
- 但替换词不要用「本店 / 我们门店 / 我们店」这种奇怪口播,统一改成品牌口吻(探店博主视角,直接说「BOOMER·OFF」)。
- 文案(video-ad-copy)也回到品牌口吻,不再强行塞「XX 店」分店名。

## 改动

### 1. `supabase/functions/_shared/brand-scrub.ts`
- 把词典里所有 `replace: '本店'` 改成 `replace: 'BOOMER·OFF'`。
- 「XX 广场店 / XX 商场店 / XX 中心店」这条通用兜底同样替换成 `BOOMER·OFF`。
- 招牌措辞替换(「还原/复刻招牌」)保持原样,继续锁死只出 BOOMER·OFF 灯箱。
- 合并规则由 `(本店\s*){2,}` 改成 `(BOOMER·OFF\s*){2,}`。
- `OWN_BRAND_LOCK_ZH / EN` 硬约束保留,里面的「一律理解成"我们门店 / 本店"」改成「一律理解成 BOOMER·OFF 自家门店」。

### 2. `supabase/functions/generate-marketing-video-copy/index.ts`
- 撤掉上一轮加的「文案里必须自然带出分店名」硬要求。
- 系统提示改成:探店博主视角,统一自称 / 提及品牌用 `BOOMER·OFF`,不要出现「本店 / 我们门店 / 小店」这种词;不要写分店名(中信泰富店等)、地铁线路、地铁站、公交、地标、导航说明。
- 保留原有的敏感词过滤(主播→店员、保真/秒杀/全网最低 等)。
- 再补一条兜底 sanitize:把生成结果里残留的「本店 / 我们门店 / 我们店 / 小店」替换成 `BOOMER·OFF`,避免旧口播漏出来。

## 不动的部分

- 视频脚本生成链(director-*)、Seedance 渲染参数、前端 UI、数据结构、其他 edge function 全部不动。
- `_shared/shop-context.ts` 不动(其他地方仍在用)。
- 文案的输入/输出契约(title/body/hashtags/emojis)不动。

## 验证

1. 重新生成一版被拒那条视频的文案:输出里应看到「BOOMER·OFF」品牌名,不应看到「中信泰富」「本店」「我们门店」「地铁 X 号线」「静安寺」等。
2. 重新惊喜出片一条:导演脚本里第三方商场名会被替换成 `BOOMER·OFF`,Seedance 版权风险应消失;画面招牌仍只出 BOOMER·OFF 灯箱。
