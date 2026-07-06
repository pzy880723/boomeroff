# 修复:第三方商标混入视频提示词 + 版权失败给的是英文报错

## 问题拆解

**为什么这次视频出现"中信泰富"?**

Seedance 收到的提示词里,`中信泰富`同时出现在三个地方:
1. **店铺画像**:后端 `shop-context.ts` 把 `shops.name`("上海中信泰富店")直接拼进 prompt → `门店:上海中信泰富店`。
2. **视频主题(topic)**:你在策划对话里输入的"上海中信泰富店暑假寻宝攻略"被原样带入。
3. **强调点(highlight)**:"上海中信泰富店门头店招"里明确要求还原第三方商场招牌。

Seedance 一看是真实商场名+要还原招牌,直接判"可能涉及版权"拒绝出片。

**为什么失败提示是英文一大段?**

前端 `src/lib/videoFailure.ts` 的 `classifyVideoFailure` 里没有针对 `copyright` 的分支,英文报错走到了 `unknown` 兜底分支,`detail` 直接把原始英文丢出来给你。

---

## 改法(两处)

### 1. 后端:把第三方品牌/商场名从进入模型的提示词里剥掉,只留 BOOMER 自家招牌

新增共享工具 `supabase/functions/_shared/brand-scrub.ts`,导出:
- `THIRD_PARTY_BRAND_PATTERNS`:一份可扩展的第三方商标/商场名词典(中信泰富、太古汇、万象城、IFC、恒隆、来福士、大悦城、正大广场、K11、久光、新天地、SKP、太古里… 以及"某某商场""某某广场"这类真实招牌关键词)。
- `scrubThirdPartyBrands(text)`:把命中的词替换为"本店 / 门店 / 商场内"等中性词,并去掉"店招""招牌""门头 logo"这类要求还原招牌的措辞(因为 Seedance 会自作主张画第三方 logo)。
- `OWN_BRAND_LOCK_ZH`:一段追加到系统提示的硬规则——"招牌上只能出现 BOOMER / BOOMER·OFF 自家 logo,严禁出现任何第三方商标/商场名/品牌名;涉及门头店招时,只描写'开放式店面上方的 BOOMER·OFF 灯箱',不要提第三方招牌"。

在这两个文件里接入:
- `supabase/functions/_shared/shop-context.ts`:`formatShopContext` 输出的每一行走一遍 `scrubThirdPartyBrands`(店名/地址/描述都会被清洗)。同时把"门店:上海中信泰富店"改成"门店:BOOMER·OFF(商场店)"这种去敏形式——原始店名仍在数据库保留,只是不进 AI 提示词。
- `supabase/functions/generate-marketing-video-script/index.ts`:`topic` / `highlight` / `briefTranscript` 三个用户输入,进 AI 之前也过一次 `scrubThirdPartyBrands`;并把 `OWN_BRAND_LOCK_ZH` 追加到 `sys` 提示词里。生成完 script 后,`clean()` 里在 `sanitizeStorefrontText` 后再 pipe 一次 `scrubThirdPartyBrands`,兜底把 AI 自己蹦出来的第三方名擦掉。
- `supabase/functions/render-marketing-video/index.ts`:传给 Seedance 的 `shopBlock` 用清洗过的版本,同时在 `buildOneShotPrompt` / `buildPrompt` 里把 `OWN_BRAND_LOCK_ZH` 的英文版(新增 `OWN_BRAND_LOCK_EN`)拼进 NEGATIVE 段。

**结果**:哪怕店铺开在中信泰富商场里,Seedance 拿到的也只会是"BOOMER·OFF(商场店)"+"招牌上只能是 BOOMER·OFF"的信号,不会再触发第三方版权。

### 2. 前端:让"版权风险"这类报错说人话

在 `src/lib/videoFailure.ts` 的 `classifyVideoFailure` 里,在 `unknown` 兜底之前插入两个新分支:

- **`copyright_blocked`**——匹配 `/copyright/i`、`/版权/`、`/trademark/i`、`/intellectual\s*prop/i`、`/output\s*video.*may.*related.*copyright/i`。
  - title:`被判定涉及版权风险`
  - detail:`模型分析了脚本和参考图,认为画面里可能出现受保护的第三方品牌/商场名/招牌/logo,所以拒绝出片。这不是我们代码的 bug,通常也不扣费。最常见的原因是脚本里写了真实商场名(比如"XX 泰富店""XX 广场店")或要求还原某个真实招牌。改法:把脚本里的第三方店铺/商场名换成"本店/我们门店/BOOMER·OFF",招牌只提我们自己的 BOOMER·OFF 灯箱。`
  - fixes:`让 AI 改写为安全表达 (rewrite_safe_prompt, reRender)` / `整条重新生成 (restart, reRender)` / `删除此素材`。
- **`unknown` 分支的兜底 detail**:如果 `raw` 是纯英文(检测 `/^[\x00-\x7F\s]+$/`),不要直接把英文塞给用户,改为固定中文提示:"渲染失败但没拿到中文原因,可以先重试一次,或换成更稳的 Fast 模型;完整技术信息可以点下方『查看技术细节』展开"。这样任何漏网英文都不会再糊用户脸上。

`VideoFailureCard.tsx` 不动——它本来就渲染 `failure.title / failure.detail`,分类器改完自动生效。

## 影响范围

- 只动后端 3 个 edge function 的提示词构造 + 1 个新共享文件,以及前端 1 个分类函数。**没有 DB migration,没有 UI 结构改动**。
- 店铺真实名(中信泰富店)在 shops 表、门店选择器、`Me` 页排班等处照常显示,只是不进 AI 提示词。
- 前端 `VideoFailureCard` 无改动。
- 已生成的失败素材(比如你截图这条)重新点"用同样脚本重新生成"就会走新流程;老失败记录卡片本身也会立即变成中文提示。

## 不做的事

- 不建立第三方品牌白名单/审批流程(过度工程)。
- 不改 `shops.name` 数据(那是店员用来区分门店的,数据库层不动)。
- 不动 Seedance 侧任何鉴权/API 调用逻辑。
- 词典先手工列 20+ 个主流商场名,漏网的以后再加——目标是 90% 场景不再触发,不是 100%。
