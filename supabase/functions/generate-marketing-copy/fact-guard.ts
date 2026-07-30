// 事实保护(strict_facts):自动化文案只允许重组 verified_facts。
// 纯函数集中在这里,便于直接测试;不含任何密钥。

export const ALLOWED_BRAND_DEFAULT = ["BOOMER", "BOOMER.OFF", "BOOMER·OFF"];

/** 常见第三方品牌 / IP 关键词(点名即拒)。 */
export const THIRD_PARTY_IP_DENY = [
  "SATO", "佐藤象", "佐藤", "奥特曼", "ULTRAMAN", "哆啦A梦", "机器猫", "皮卡丘", "宝可梦", "POKEMON",
  "迪士尼", "DISNEY", "米奇", "米老鼠", "三丽鸥", "SANRIO", "HELLO KITTY", "KITTY", "史努比", "SNOOPY",
  "高达", "GUNDAM", "乐高", "LEGO", "海贼王", "火影", "龙猫", "吉卜力", "GHIBLI", "漫威", "MARVEL",
  "泡泡玛特", "POPMART", "MOLLY", "LABUBU", "变形金刚", "TRANSFORMERS", "凯蒂猫", "蜡笔小新", "美乐蒂",
];

/** 半角化 + 去分隔符,便于数字比对。 */
export function normalizeNumericText(input: string): string {
  return String(input || "")
    .replace(/[\uFF10-\uFF19]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[,，\s]/g, "");
}

/** 允许整体保留的“字母+数字”token(如 B1 楼层)。 */
export function isWholeAlnumToken(token: string): boolean {
  return /^[A-Za-z]\d{1,3}$/.test(token);
}

/**
 * 候选文本中出现的数字必须能在 verified_facts 中找到。
 * 返回未被支撑的数字 token 列表(空数组=通过)。
 */
export function findUnsupportedNumbers(text: string, factsText: string): string[] {
  const src = normalizeNumericText(text);
  const facts = normalizeNumericText(factsText);
  const bad: string[] = [];
  const re = /([A-Za-z]?)(\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const prefix = m[1] || "";
    const digits = m[2];
    const whole = `${prefix}${digits}`;
    if (prefix && isWholeAlnumToken(whole)) continue; // B1 等整体 token 放行
    if (facts.includes(digits)) continue;
    if (!bad.includes(whole)) bad.push(whole);
  }
  return bad;
}

/** 候选文本中点名的第三方品牌 / IP(空数组=通过)。 */
export function findForbiddenBrands(text: string, allowedBrands: string[]): string[] {
  const allowed = (allowedBrands.length ? allowedBrands : ALLOWED_BRAND_DEFAULT).map((b) => b.toUpperCase());
  let upper = String(text || "").toUpperCase();
  // 先抹掉被允许的品牌名(长的优先),避免误判
  for (const b of [...allowed].sort((a, c) => c.length - a.length)) {
    if (b) upper = upper.split(b).join(" ");
  }
  const bad: string[] = [];
  for (const kw of THIRD_PARTY_IP_DENY) {
    if (upper.includes(kw.toUpperCase()) && !bad.includes(kw)) bad.push(kw);
  }
  // 剩余的全大写拉丁词(≥3 字母)一律视为未核实品牌
  for (const w of upper.match(/[A-Z]{3,}/g) || []) {
    if (!allowed.some((b) => b.includes(w)) && !bad.includes(w)) bad.push(w);
  }
  return bad;
}

export interface GuardResult {
  ok: boolean;
  unsupported_claims: string[];
}

/** 确定性事实闸门:数字 + 第三方品牌/IP。 */
export function deterministicFactGuard(
  candidate: { title?: string; body?: string; hashtags?: string[] },
  factsText: string,
  allowedBrands: string[],
): GuardResult {
  const text = [candidate?.title || "", candidate?.body || ""].join("\n");
  const reasons: string[] = [];
  for (const n of findUnsupportedNumbers(text, factsText)) reasons.push(`未核实数字：${n}`);
  const tagText = (candidate?.hashtags || []).join(" ");
  for (const b of findForbiddenBrands(`${text}\n${tagText}`, allowedBrands)) reasons.push(`第三方品牌/IP：${b}`);
  return { ok: reasons.length === 0, unsupported_claims: reasons };
}

/** 把结构化 verified_facts 拍平成可读文本(用于 prompt 与数字比对)。 */
export function formatVerifiedFacts(facts: any): string {
  if (!facts) return "";
  if (typeof facts === "string") return facts.trim();
  const lines: string[] = [];
  const walk = (label: string, v: any) => {
    if (v == null) return;
    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(`${label}[${i + 1}]`, item));
      return;
    }
    if (typeof v === "object") {
      for (const [k, vv] of Object.entries(v)) walk(label ? `${label}.${k}` : k, vv);
      return;
    }
    const s = String(v).trim();
    if (s) lines.push(`- ${label}：${s}`);
  };
  walk("", facts);
  return lines.join("\n").slice(0, 6000);
}

/** strict_facts 模式的系统提示词补丁。 */
export function buildStrictFactsBlock(factsText: string, allowedBrands: string[]): string {
  const allowed = (allowedBrands.length ? allowedBrands : ALLOWED_BRAND_DEFAULT).join(" / ");
  return `
【事实红线 · strict_facts(违反即整条作废)】
你只能重组下面【已核实事实】里出现过的信息，不得补充任何外部知识、不得从参考图推断新事实。
硬性禁止：
  1. 任何未在已核实事实中出现的数字、数量、面积、库存、人数、年份、价格、折扣、优惠、活动、排名。
  2. 点名任何第三方品牌、IP、动漫/玩具角色名（即使参考图里可能出现，也一律不许写出名字），只能用“中古玩具/杂货/餐具/挂钟”等通用词描述。
  3. 只允许出现这些品牌名：${allowed}。
  4. 不得承诺保真、升值、最低价、限时。
【已核实事实】
${factsText || "（无）"}
`;
}

/** 第二道 AI 事实审校的提示词。 */
export function buildFactReviewPrompt(factsText: string, allowedBrands: string[]): string {
  const allowed = (allowedBrands.length ? allowedBrands : ALLOWED_BRAND_DEFAULT).join(" / ");
  return `你是严格的事实审校员。只依据【已核实事实】判断候选文案是否可发布。
只有命中下列情形才算 unsupported（任一命中即 supported=false）：
1. 出现已核实事实中没有的数字/数量/年份/面积/人数/排名；
2. 任何价格、价位、折扣、优惠、"便宜/平价/几块钱/预算"之类的价格判断；
3. 任何库存、活动、促销、限时、保真、升值承诺；
4. 点名任何第三方品牌、IP、动漫/玩具角色名（只允许：${allowed}）；
5. 编造已核实事实中不存在的商品品类、服务或设施。
不算 unsupported（不要因此判否）：
- 主观感受、情绪、氛围词（治愈、惊喜、想逛一下午等）；
- 对已核实事实中画面/陈列的同义改写与合理概括（含颜色、材质等画面里本就可见的通用描述）；
- 话题标签：标签是账号固定或通用分类词，不构成事实主张，除非标签本身含第三方品牌/IP、数字或优惠。
【已核实事实】
${factsText || "（无）"}
只返回严格 JSON：{"supported": true|false, "unsupported_claims": ["..."]}，不要任何其它文字。`;
}


/** 解析审校返回,解析失败返回 null(调用方必须视为不通过)。 */
export function parseFactReview(raw: string): { supported: boolean; unsupported_claims: string[] } | null {
  let s = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const m = s.match(/\{[\s\S]*\}/);
  if (m) s = m[0];
  try {
    const o = JSON.parse(s);
    if (typeof o?.supported !== "boolean") return null;
    const claims = Array.isArray(o.unsupported_claims) ? o.unsupported_claims.map((x: any) => String(x)) : [];
    if (o.supported && claims.length) return { supported: false, unsupported_claims: claims };
    return { supported: o.supported, unsupported_claims: claims };
  } catch {
    return null;
  }
}
