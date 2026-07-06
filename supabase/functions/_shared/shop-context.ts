// 营销 edge function 共用：按 shop_id 加载店铺基础信息+营销描述，输出 prompt 片段。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface ShopContext {
  id: string;
  name: string;
  address?: string | null;
  tagline?: string | null;
  description?: string | null;
  selling_points?: any;
  tone?: string | null;
  target_audience?: string | null;
  brand_keywords?: string[] | null;
  default_hashtags?: string[] | null;
}

export async function loadShopContext(shopId: string | null | undefined): Promise<ShopContext | null> {
  if (!shopId) return null;
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) return null;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const [{ data: shop }, { data: prof }] = await Promise.all([
      admin.from("shops").select("id, name, address").eq("id", shopId).maybeSingle(),
      admin.from("shop_marketing_profiles").select("*").eq("shop_id", shopId).maybeSingle(),
    ]);
    if (!shop) return null;
    return {
      id: (shop as any).id,
      name: (shop as any).name,
      address: (shop as any).address,
      tagline: (prof as any)?.tagline,
      description: (prof as any)?.description,
      selling_points: (prof as any)?.selling_points,
      tone: (prof as any)?.tone,
      target_audience: (prof as any)?.target_audience,
      brand_keywords: (prof as any)?.brand_keywords,
      default_hashtags: (prof as any)?.default_hashtags,
    };
  } catch (e) {
    console.error("[shop-context] load fail", e);
    return null;
  }
}

import { scrubThirdPartyBrands } from "./brand-scrub.ts";

export function formatShopContext(s: ShopContext | null): string {
  if (!s) return "";
  // 视频模型侧统一去敏:真实店名(可能含"中信泰富"这类第三方商标)不再进 AI 提示词,
  // 只保留"BOOMER·OFF(商场店)"这种中性表述。店名原文仍在数据库/前端展示,不受影响。
  const scrub = (v: string) => scrubThirdPartyBrands(v);
  const lines: string[] = ["【店铺画像】"];
  const nameSafe = scrub(s.name) || 'BOOMER·OFF(商场店)';
  const addrSafe = s.address ? scrub(s.address) : '';
  lines.push(`门店:${nameSafe}${addrSafe ? ` · ${addrSafe}` : ""}`);
  if (s.tagline) lines.push(`定位:${scrub(s.tagline)}`);
  if (s.description) lines.push(`介绍:${scrub(s.description)}`);
  if (Array.isArray(s.selling_points) && s.selling_points.length) {
    const arr = s.selling_points.map((x: any) => scrub(typeof x === "string" ? x : x?.text || "")).filter(Boolean);
    if (arr.length) lines.push(`卖点:${arr.join(" / ")}`);
  }
  if (s.target_audience) lines.push(`目标人群:${scrub(s.target_audience)}`);
  if (s.tone) lines.push(`偏好口吻:${scrub(s.tone)}`);
  if (Array.isArray(s.brand_keywords) && s.brand_keywords.length) lines.push(`关键词:${s.brand_keywords.map(scrub).join(", ")}`);
  if (Array.isArray(s.default_hashtags) && s.default_hashtags.length) lines.push(`常用话题:${s.default_hashtags.map(scrub).join(" ")}`);
  return lines.join("\n");
}
