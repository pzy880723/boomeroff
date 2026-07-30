import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sauGetAccountProfile } from "../_shared/sau.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const supaUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: claims } = await supaUser.auth.getClaims(auth.replace("Bearer ", ""));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return json({ error: "unauthorized" }, 401);

    const { account_id, action, remark } = await req.json().catch(() => ({}));
    if (!account_id) return json({ error: "account_id required" }, 400);
    if (!["remark", "refresh"].includes(action)) return json({ error: "unknown action" }, 400);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: account, error: accountError } = await supa
      .from("social_accounts")
      .select("*")
      .eq("id", account_id)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) return json({ error: "账号不存在" }, 404);

    const { data: roleRow } = await supa
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (roleRow?.role !== "admin") {
      const { data: staff } = await supa
        .from("staff_profiles")
        .select("shop_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (staff?.shop_id !== account.shop_id) return json({ error: "forbidden" }, 403);
    }

    if (action === "remark") {
      const accountRemark = String(remark || "").trim();
      if (accountRemark.length > 50) return json({ error: "账号备注最多 50 个字" }, 400);
      const { data, error } = await supa
        .from("social_accounts")
        .update({ account_remark: accountRemark || null })
        .eq("id", account_id)
        .select("*")
        .single();
      if (error) throw error;
      return json({ ok: true, account: data });
    }

    if (action === "refresh") {
      if (account.platform !== "xhs") {
        return json({ error: "当前只支持刷新小红书主页资料" }, 400);
      }
      if (!account.worker_account_id) {
        return json({ error: "账号缺少 Worker 关联，请重新扫码绑定" }, 400);
      }

      const profile = await sauGetAccountProfile(account.platform, account.worker_account_id);
      const nextMeta = {
        ...((account.meta as Record<string, unknown>) || {}),
        platform_user_id: profile.platform_user_id || null,
      };
      const { data, error } = await supa
        .from("social_accounts")
        .update({
          account_name: profile.name,
          avatar_url: profile.avatar || null,
          profile_bio: profile.bio || null,
          platform_account_id: profile.platform_account_id || null,
          profile_synced_at: new Date().toISOString(),
          meta: nextMeta,
        })
        .eq("id", account_id)
        .select("*")
        .single();
      if (error) throw error;
      return json({ ok: true, account: data });
    }

    return json({ error: "unknown action" }, 400);
  } catch (error) {
    return json({ error: String((error as Error).message || error) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}
