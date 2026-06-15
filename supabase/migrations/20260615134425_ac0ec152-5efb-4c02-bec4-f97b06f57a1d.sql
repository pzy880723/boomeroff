
CREATE TABLE public.marketing_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.marketing_presets TO authenticated;
GRANT ALL ON public.marketing_presets TO service_role;

ALTER TABLE public.marketing_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read presets" ON public.marketing_presets
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin manage presets" ON public.marketing_presets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER marketing_presets_updated_at
  BEFORE UPDATE ON public.marketing_presets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed defaults
INSERT INTO public.marketing_presets (key, value) VALUES
('brand_system_prompt', to_jsonb($$你正在为「BOOMER·OFF Vintage」做社交媒体内容。
品牌定位：国内首家标准化中古连锁品牌；平价、海量、标准化中古杂货铺；30,000+ SKU 高密度陈列。
覆盖时代：1950s–千禧年初。
核心调性：虽古但新 · 信任可见；创造情绪体验，而非推销。
顾客来这里寻找：稀缺性、沉浸感、治愈、翻筐乐。
品牌口号风格：克制、有质感、像随手记，不喊话。

文案铁律（违反任意一条都要重写）：
1. 100% 简体中文。品牌名 BOOMER·OFF / BOOMER 保留英文，其余英日韩词只在不可替代时出现。
2. 不编造价格、年代、产地、品牌、材质、稀有度。
3. 严禁出现："主播" "直播间" "保真" "真品" "保证升值" "秒杀" "限时抢" "全网最低" "拍卖行级别"。
4. 称呼用 "你" / "您" / "店员"，不用 "主播" / "宝宝们"。
5. 不写夸张违法宣传词。
6. 不写"全网首发""独家供应商"等无法核实的话。$$::text)),

('platform_brief', '{
  "xhs": "小红书：标题 ≤20 字带钩子和 emoji，正文 150–220 字、分 3–4 短段，结尾留一句行动召唤；3–6 个 # 话题标签。",
  "douyin": "抖音：标题 ≤20 字、口语化制造悬念；正文 80–140 字偏口播稿，分句短、便于读字幕；2–5 个 # 话题。",
  "shipinhao": "视频号：标题 ≤22 字稳一点，正文 100–180 字克制有质感，2–4 个 # 话题。",
  "pyq": "朋友圈：不要标题，只输出 1–3 段短文，几乎不用 emoji，像随手记，结尾不喊话；不要 # 话题。"
}'::jsonb),

('tone_brief', '{
  "种草": "用第一人称我，描述偶遇/被打中的感觉，不写商品介绍。",
  "治愈": "慢节奏第一人称，写一个安静的瞬间，色彩柔，留白多。",
  "怀旧": "第一人称回忆口吻，由一件物件勾出一段年代记忆。",
  "偶遇": "用现在进行时写当下，像在和朋友说我刚刚看到了什么。",
  "探店": "用第一人称我，写从进店到翻筐的过程感，强调店里东西多/有意思。",
  "翻筐日记": "日记体，写翻筐过程中的几件小发现，碎片化短句。",
  "主理人手记": "店主口吻，半私人半专业，讲为什么收这件、放在哪里。",
  "顾客来信": "假托一位顾客的口吻，写她/他在店里被打中的瞬间。",
  "藏家分享": "半专业口吻，先点物件名/品牌/年代/工艺（仅限提供的事实），再讲为什么动心。",
  "年代考据": "克制专业，讲这件东西所在年代的背景、流行原因（仅基于事实）。",
  "工艺解读": "聚焦做工细节，讲材质/工艺/印记是怎么回事（仅基于事实）。",
  "上新": "第三人称店铺口吻，告诉粉丝新到了什么类型的一件好物，不夸张。",
  "限定到店": "短促口吻，告诉粉丝这是少量到店的款，希望来店看实物。"
}'::jsonb),

('video_type_rules', '{
  "store_tour": {
    "label": "探店视频",
    "required": [
      {"slot":"storefront","label":"门头照","minCount":1,"hint":"能看见 BOOMER·OFF 招牌或店铺入口"},
      {"slot":"wide_interior","label":"店内全景","minCount":1,"hint":"一张能看见整面货架或大空间的广角"},
      {"slot":"shelf_display","label":"货架陈列","minCount":1,"hint":"密集陈列特写，体现海量"},
      {"slot":"rummage_bin","label":"翻筐区特写","minCount":1,"hint":"客人翻筐或筐内俯拍"}
    ],
    "recommended": [
      {"slot":"staff","label":"店员侧脸/手","hint":"不正脸"},
      {"slot":"lighting","label":"灯光氛围","hint":"暖光、霓虹、有质感的局部"}
    ],
    "scriptHint": "节奏：门头钩子(1–2s) → 店内全景(2–3s) → 货架/翻筐快剪(3–6s) → 一个治愈定格收尾。字幕克制。"
  },
  "product_showcase": {
    "label": "产品展示",
    "required": [
      {"slot":"product_front","label":"商品正面","minCount":1,"hint":"商品主体在画面 60% 以上"},
      {"slot":"product_detail","label":"商品细节","minCount":1,"hint":"材质/做工/印记的微距"},
      {"slot":"product_scene","label":"商品场景","minCount":1,"hint":"商品在货架上或在手里"}
    ],
    "recommended": [
      {"slot":"product_hand","label":"上手把玩","hint":"把它拿在手里转一下"}
    ],
    "scriptHint": "节奏：钩子点出这是什么/为什么动心(0–2s) → 正面+细节+场景三镜递进(2–10s) → 一句藏家口吻收尾。"
  },
  "store_ambience": {
    "label": "店铺氛围",
    "required": [
      {"slot":"wide_interior","label":"店内全景","minCount":1,"hint":"广角，呈现空间感"},
      {"slot":"shelf_display","label":"局部陈列","minCount":1,"hint":"一组陈列"},
      {"slot":"lighting","label":"灯光特写","minCount":1,"hint":"暖光、霓虹或自然光局部"}
    ],
    "recommended": [
      {"slot":"storefront","label":"门头","hint":"街景或招牌"},
      {"slot":"visitor","label":"顾客剪影","hint":"不正脸"}
    ],
    "scriptHint": "节奏：慢镜叠化，字幕极少；像在播一段店内 BGM 短片，不强行卖货。"
  },
  "new_arrival": {
    "label": "新品上架",
    "required": [
      {"slot":"product_front","label":"商品正面","minCount":1,"hint":"主图"},
      {"slot":"product_angle","label":"商品多角度","minCount":2,"hint":"左/右/背面任两张"},
      {"slot":"product_detail","label":"商品细节","minCount":1,"hint":"材质/做工微距"}
    ],
    "recommended": [
      {"slot":"product_scene","label":"上架陈列位","hint":"商品已经摆到货架上的样子"},
      {"slot":"product_tag","label":"价签/标签","hint":"能看到价格或标记"}
    ],
    "scriptHint": "节奏：标签新到一件(0–2s) → 多角度展示(2–10s) → 上架位收尾，引导到店翻看。"
  }
}'::jsonb)
ON CONFLICT (key) DO NOTHING;
