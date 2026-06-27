// 列当前 shop 的账号:从 DB 拉,然后用 worker /getValidAccounts 校验在线状态,合并返回。
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sauListAccounts } from "../_shared/sau.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return j({ error: "unauthorized" }, 401);
    }
    const supaUser = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: claims } = await supaUser.auth.getClaims(auth.replace("Bearer ", ""));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return j({ error: "unauthorized" }, 401);

    const { shop_id: shopId } = await req.json().catch(() => ({}));
    if (!shopId) return j({ error: "shop_id required" }, 400);

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 权限:管理员或本店店员
    const { data: roleRow } = await supa.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if (roleRow?.role !== "admin") {
      const { data: sp } = await supa.from("staff_profiles").select("shop_id").eq("user_id", userId).maybeSingle();
      if (sp?.shop_id !== shopId) return j({ error: "forbidden" }, 403);
    }

    const { data: rows } = await supa.from("social_accounts").select("*").eq("shop_id", shopId).order("created_at", { ascending: false });

    let workerOnline = true;
    let workerMessage = "发布服务器正常";
    let valid: Awaited<ReturnType<typeof sauListAccounts>> = [];
    try {
      valid = await sauListAccounts();
      if (valid.length === 0) workerMessage = "发布服务器在线,但暂时没有检测到已登录账号";
    } catch (e) {
      workerOnline = false;
      workerMessage = `发布服务器连接失败:${String((e as Error).message || e)}`;
    }

    const validSet = new Set(valid.map(v => `${v.platform}:${v.worker_id}`));
    const accounts = (rows || []).map((r) => ({
      ...r,
      worker_online: workerOnline,
      worker_message: workerMessage,
      online: workerOnline ? validSet.has(`${r.platform}:${r.worker_account_id}`) : null,
    }));

    return j({ accounts, worker_online: workerOnline, worker_message: workerMessage, worker_accounts_count: valid.length });
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});

function j(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
