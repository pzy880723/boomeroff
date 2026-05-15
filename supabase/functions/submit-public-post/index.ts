// 游客匿名发布到「中古圈」
// - 无需 JWT
// - 按 IP 限频（app_settings.guest_limits.share_per_day）
// - 用 service_role 写入 community_posts，user_id=null, is_guest=true, guest_name='游客'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_CATEGORIES = new Set([
  'jp_porcelain', 'eu_porcelain', 'incense', 'antique_art', 'local_craft',
  'anime_toy', 'otaku_goods', 'luxury', 'vintage_jewelry', 'game_console',
  'walkman', 'ccd', 'media_record', 'playback_device', 'home_appliance',
  'hobby', 'other',
]);

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  const first = xff.split(',')[0].trim();
  if (first) return first;
  return req.headers.get('x-real-ip') || 'unknown';
}

// 上传 base64 图片到 product-images 公共桶，返回 public URL
async function uploadGuestImage(adminClient: any, base64DataUrl: string): Promise<string | null> {
  try {
    const m = base64DataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) return null;
    const mime = m[1];
    const ext = mime.split('/')[1] || 'jpg';
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    const path = `guest/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await adminClient.storage.from('product-images').upload(path, bytes, {
      contentType: mime, upsert: false,
    });
    if (error) { console.warn('[GuestPost] upload error:', error); return null; }
    const { data } = adminClient.storage.from('product-images').getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (e) {
    console.warn('[GuestPost] upload exception:', e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: cfgRow } = await adminClient
      .from('app_settings').select('value').eq('key', 'guest_limits').maybeSingle();
    const cfg = (cfgRow?.value || {}) as { enabled?: boolean; share_per_day?: number };
    const enabled = cfg.enabled !== false;
    const limit = Math.max(1, Number(cfg.share_per_day || 5));
    if (!enabled) {
      return new Response(JSON.stringify({ error: '游客通道已关闭' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ip = getClientIp(req);
    const salt = Deno.env.get('GUEST_IP_SALT') || 'boomeroff-guest-salt';
    const ipHash = await sha256Hex(`${salt}:${ip}`);
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
      .toISOString().slice(0, 10);

    const { data: usageRow } = await adminClient
      .from('guest_daily_usage')
      .select('share_count, recognize_count')
      .eq('ip_hash', ipHash).eq('usage_date', today).maybeSingle();
    const used = usageRow?.share_count || 0;
    if (used >= limit) {
      return new Response(JSON.stringify({
        error: `今日分享已达上限（${limit} 次/天）`, remaining: 0,
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const {
      name, category, era, origin, sellingPoints, tips,
      story, appreciation, description, careTips,
      material, craft, dimensions, condition, confidence,
      rarity, collectionValue, marketValue, buyReason,
      imageBase64, // 新上传图片
      imageUrl,    // 复用公共 URL（如 hash_cache 命中的历史 image_url）
      thumbnailBase64, // 客户端生成的小图缩略图（480px）
    } = body as {
      name?: string; category?: string; era?: string | null; origin?: string | null;
      sellingPoints?: any; tips?: any;
      story?: string | null; appreciation?: string | null; description?: string | null; careTips?: string | null;
      material?: string | null; craft?: string | null; dimensions?: string | null; condition?: string | null;
      confidence?: number | null;
      rarity?: number | null; collectionValue?: string | null; marketValue?: string | null; buyReason?: string | null;
      imageBase64?: string; imageUrl?: string | null; thumbnailBase64?: string;
    };

    if (!name || typeof name !== 'string' || !name.trim()) {
      return new Response(JSON.stringify({ error: '商品名必填' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const cleanName = String(name).slice(0, 40);
    const cleanCategory = VALID_CATEGORIES.has(category as string) ? category : 'other';

    let finalImageUrl: string | null = null;
    let finalThumbnailUrl: string | null = null;
    if (imageBase64 && imageBase64.startsWith('data:')) {
      if (imageBase64.length > 1_600_000) {
        return new Response(JSON.stringify({ error: '图片过大' }), {
          status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      finalImageUrl = await uploadGuestImage(adminClient, imageBase64);
    } else if (imageUrl && typeof imageUrl === 'string') {
      finalImageUrl = imageUrl;
    }
    if (thumbnailBase64 && thumbnailBase64.startsWith('data:') && thumbnailBase64.length < 400_000) {
      finalThumbnailUrl = await uploadGuestImage(adminClient, thumbnailBase64);
    }

    const sp = Array.isArray(sellingPoints) ? sellingPoints.slice(0, 5) : [];
    let tipsStr: string | null = null;
    if (typeof tips === 'string') tipsStr = tips.slice(0, 1000);
    else if (tips && typeof tips === 'object') {
      try { tipsStr = JSON.stringify(tips).slice(0, 2000); } catch { tipsStr = null; }
    }

    const clip = (v: unknown, max: number): string | null =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
    const conf = typeof confidence === 'number' && Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, confidence)) : null;

    const { data: inserted, error: insertErr } = await adminClient
      .from('community_posts').insert({
        user_id: null,
        product_id: null,
        image_url: finalImageUrl,
        thumbnail_url: finalThumbnailUrl,
        name: cleanName,
        category: cleanCategory,
        era: era ? String(era).slice(0, 40) : null,
        origin: origin ? String(origin).slice(0, 60) : null,
        selling_points: sp,
        tips: tipsStr,
        story: clip(story, 2000),
        appreciation: clip(appreciation, 2000),
        description: clip(description, 4000),
        care_tips: clip(careTips, 1500),
        material: clip(material, 120),
        craft: clip(craft, 120),
        dimensions: clip(dimensions, 120),
        condition: clip(condition, 120),
        confidence: conf,
        rarity: typeof rarity === 'number' && Number.isFinite(rarity)
          ? Math.max(1, Math.min(5, Math.round(rarity))) : null,
        collection_value: clip(collectionValue, 20),
        market_value: clip(marketValue, 80),
        buy_reason: clip(buyReason, 200),
        is_public: true,
        is_guest: true,
        guest_name: '游客',
      })
      .select('id')
      .single();
    if (insertErr) {
      console.error('[GuestPost] insert error:', insertErr);
      return new Response(JSON.stringify({ error: '发布失败：' + insertErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await adminClient.from('guest_daily_usage').upsert({
      ip_hash: ipHash, usage_date: today,
      share_count: used + 1,
      recognize_count: usageRow?.recognize_count || 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'ip_hash,usage_date' });

    return new Response(JSON.stringify({
      ok: true, id: inserted.id, remaining: limit - (used + 1),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[GuestPost] Error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : '发布失败' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
