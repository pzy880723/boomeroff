## 问题

现在 persona 有 age/ageBucket,但 `formatPersonaBriefZh`(给脚本 AI 用)和 `formatPersonaDirective`(给 Seedance 用)只丢了年龄数字过去,没告诉脚本 AI "这个年龄段该说什么话",导致老头子也会讲"暑假来逛"这种年轻人台词。

## 方案

只改 `supabase/functions/_shared/persona-generator.ts`,不动调用方。

### 1. 新增按年龄段的「话题白名单 / 黑名单」

在文件顶部加一份小字典:

```ts
const AGE_TOPIC_HINTS = {
  young:  { 
    ok:  '暑假/寒假/开学/周末逛街/追星/入坑/打卡/攒钱买/上班摸鱼/情人节',
    ban: '退休/含饴弄孙/老伴/年轻时候/我们那年代'
  },
  middle: {
    ok:  '下班顺路/带娃/接孩子/周末陪家人/送礼/孝敬爸妈/给老公给老婆挑',
    ban: '暑假作业/开学季/追星/入坑二次元/退休金'
  },
  senior: {
    ok:  '退休了多出来走走/接孙子放学路上/老伙计聚会/给孙辈挑个小玩意/年轻时候就喜欢/怀旧',
    ban: '暑假/寒假/开学/追星/入坑/打卡/摸鱼/上班'
  },
}
```

### 2. 把提示塞进 `formatPersonaBriefZh`

在返回的中文人设简介末尾追加一段【口播话题指引】:

```
【口播话题 · 必须符合角色年龄】
- 该角色是 ${age} 岁 ${ageBucket === 'senior' ? '老年人' : ageBucket === 'middle' ? '中年人' : '年轻人'},台词只能讲这个年龄段真实会讲的场景。
- 推荐话题:${AGE_TOPIC_HINTS[bucket].ok}
- 严禁话题:${AGE_TOPIC_HINTS[bucket].ban}
- 例:senior 不许说"暑假来逛""开学季""追星入坑",应该说"退休了多出来走走""接孙子路上顺道进来""老伙计推荐的"。
- couple/family 里如果有老人,老人开口只讲老人话题;孩子话题让年轻/中年成员讲。
```

### 3. 同步给 `generatePersona` 的 sys prompt 加一句

让 AI 生成 `opener / catchphrase / cta` 时就已经符合年龄,而不是等脚本环节再纠偏:

```
opener/catchphrase/cta 必须符合 ${age} 岁 ${bucket} 的真实口吻:
- young 可以讲暑假、开学、周末逛街、追星、入坑、打卡;
- middle 讲下班顺路、带娃、送礼、孝敬爸妈;
- senior 讲退休了多出来走走、接孙子路上、老伙计聚会、怀旧;严禁"暑假/开学/追星/摸鱼"。
```

并在 fallback 池里把 senior 那位的 opener/catchphrase/cta 也改成退休口吻(现在如果是硬编码的可能也不对)。

### 4. `formatPersonaDirective`(英文,给 Seedance)

只加一句轻量约束,不用堆太多:

```
Speech style must match the character's real age: seniors talk about retirement walks, picking up grandkids, old friends' recommendations — never school holidays, fandom or office life.
```

## 不改

- DB / 前端 / 调用方 edge function
- 上一轮的年龄抽签、真实感面部约束、fallback 池结构

