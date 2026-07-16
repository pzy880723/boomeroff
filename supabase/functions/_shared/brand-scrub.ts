// 把第三方商标 / 商场名 / 品牌名从进入视频模型的提示词里剥掉。
// Seedance 一旦看到"中信泰富""万象城"这类真实招牌名 + 要求还原门头,
// 就会判"版权风险"拒绝出片。这个模块只做两件事:
//   1) scrubThirdPartyBrands(text):把命中的第三方名替换成"本店/门店/商场内"等中性词;
//      同时把"还原/复刻招牌 logo"这类措辞去掉,让模型不会自己去画第三方 logo。
//   2) OWN_BRAND_LOCK_ZH / EN:一段硬规则,追加到系统提示,告诉模型招牌上
//      只能出现 BOOMER / BOOMER·OFF 自家 logo。

// 关键第三方商标/商场名词典。
// - 覆盖国内主流购物中心 / 百货 / 集团品牌;漏网的以后再加。
// - 每条 pattern 命中后统一替换为"本店"/"商场内",不会破坏中文流畅性。
export const THIRD_PARTY_BRAND_PATTERNS: { pattern: RegExp; replace: string }[] = [
  // 上海系
  { pattern: /上海\s*中信泰富(广场|店|商场)?/g, replace: 'BOOMER·OFF' },
  { pattern: /中信泰富(广场|店|商场)?/g, replace: 'BOOMER·OFF' },
  { pattern: /恒隆(广场|店)?/g, replace: 'BOOMER·OFF' },
  { pattern: /IFC(?:\s*商场)?/gi, replace: 'BOOMER·OFF' },
  { pattern: /新天地(店|商场)?/g, replace: 'BOOMER·OFF' },
  { pattern: /(?:上海)?来福士(广场|店)?/g, replace: 'BOOMER·OFF' },
  { pattern: /(?:上海)?大悦城(店)?/g, replace: 'BOOMER·OFF' },
  { pattern: /(?:上海)?K11(?:\s*购物艺术中心)?/gi, replace: 'BOOMER·OFF' },
  { pattern: /正大广场(店)?/g, replace: 'BOOMER·OFF' },
  { pattern: /久光(百货|店)?/g, replace: 'BOOMER·OFF' },
  { pattern: /百联(奥莱|广场|店)?/g, replace: 'BOOMER·OFF' },
  { pattern: /环贸(?:\s*IAPM)?(店)?/gi, replace: 'BOOMER·OFF' },
  { pattern: /月星环球港(店)?/g, replace: 'BOOMER·OFF' },
  { pattern: /陆家嘴中心(店)?/g, replace: 'BOOMER·OFF' },
  // 北京 / 成都 / 深圳系
  { pattern: /三里屯太古里/g, replace: 'BOOMER·OFF' },
  { pattern: /(成都|北京)?太古里/g, replace: 'BOOMER·OFF' },
  { pattern: /(北京|成都|深圳|上海)?SKP(?:-S)?/g, replace: 'BOOMER·OFF' },
  { pattern: /国贸(商城|店)?/g, replace: 'BOOMER·OFF' },
  { pattern: /(华润)?万象城/g, replace: 'BOOMER·OFF' },
  { pattern: /(华润)?万象汇/g, replace: 'BOOMER·OFF' },
  { pattern: /(华润)?万象天地/g, replace: 'BOOMER·OFF' },
  { pattern: /印力(购物中心)?/g, replace: 'BOOMER·OFF' },
  { pattern: /龙湖天街/g, replace: 'BOOMER·OFF' },
  { pattern: /龙湖\s*[\u4e00-\u9fa5]{0,4}天街/g, replace: 'BOOMER·OFF' },
  { pattern: /大悦春风里/g, replace: 'BOOMER·OFF' },
  { pattern: /合生汇/g, replace: 'BOOMER·OFF' },
  { pattern: /银泰(城|百货|中心)?/g, replace: 'BOOMER·OFF' },
  { pattern: /万达广场/g, replace: 'BOOMER·OFF' },
  { pattern: /凯德(广场|Mall)?/gi, replace: 'BOOMER·OFF' },
  { pattern: /环宇城/g, replace: 'BOOMER·OFF' },
  { pattern: /(?:广州|深圳|北京|上海)?太古(?:汇|广场|里)/g, replace: 'BOOMER·OFF' },
  // 通用兜底:"XX 广场店 / XX 商场店 / XX 中心店"这种真实招牌尾缀
  { pattern: /[\u4e00-\u9fa5A-Za-z0-9]{2,8}(广场|商场|购物中心|商城|中心)店/g, replace: 'BOOMER·OFF' },
  // 要求还原第三方招牌的措辞:让 Seedance 别再自作主张画 logo
  { pattern: /(还原|复刻|重现|再现)(第三方|商场|真实)?(招牌|店招|门头|logo|Logo)/g, replace: '展示 BOOMER·OFF 灯箱' },
];


// 主入口:任何要进 AI 的用户文本先过一遍。
export function scrubThirdPartyBrands(text: string | null | undefined): string {
  if (!text) return '';
  let out = String(text);
  for (const { pattern, replace } of THIRD_PARTY_BRAND_PATTERNS) {
    out = out.replace(pattern, replace);
  }
  // 连续出现的"BOOMER·OFF"合并
  out = out.replace(/(BOOMER·OFF\s*){2,}/g, 'BOOMER·OFF');
  return out;
}

// 追加到脚本生成的系统提示里(中文,给 Gemini 看)
export const OWN_BRAND_LOCK_ZH = `【品牌招牌硬约束(不可违反)】
- 视频里出现的所有招牌 / logo / 灯箱 / 门头字样,只允许是「BOOMER」或「BOOMER·OFF」自家品牌。
- 严禁出现任何第三方商标 / 商场名 / 百货名 / 品牌名(比如中信泰富、太古里、万象城、IFC、SKP、恒隆、来福士、大悦城、正大广场、K11、久光、银泰、万达、凯德、龙湖天街、合生汇 等,以及所有"XX 广场店 / XX 商场店 / XX 中心店"这类真实招牌)。
- 如果用户输入里出现了任何第三方商场名,一律理解成 BOOMER·OFF 自家门店,不要写进 scene / action / dialogue / subtitle 里;也不要用「本店 / 我们门店 / 小店」这种口播,直接说品牌名 BOOMER·OFF。

- 涉及门头 / 店招 / 招牌的镜头,只描写"BOOMER·OFF 开放式店面上方的灯箱 / 门楣 logo",不要提任何第三方招牌。`;

// 追加到 Seedance 渲染 prompt 里(英文/中英混,给视频模型看)
export const OWN_BRAND_LOCK_EN = `BRAND SIGNAGE HARD RULE (must obey): the only brand name, logo, signboard, lightbox, storefront lettering allowed in the output video is "BOOMER" or "BOOMER·OFF". NEGATIVE — strictly forbid any third-party mall / department-store / brand signage or logo in the frame (including but not limited to: Citic Square, Taikoo Li, MixC, IFC, SKP, Plaza 66, Raffles City, Joy City, Super Brand Mall, K11, Jiuguang, Intime, Wanda, CapitaMall, Longfor Paradise Walk, Hopson One). If any third-party mall/brand name appears in the input, treat it as "our own BOOMER·OFF shop". For any storefront / signboard shot, only depict "the BOOMER·OFF lightbox above the open-front shop" — never any third-party sign.`;
