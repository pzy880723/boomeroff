import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{3,32}$/, "用户名仅支持字母、数字、下划线，3-32 位"),
  password: z.string().min(6, "密码至少 6 位").max(72),
  role: z.enum(["admin", "anchor"]),
  real_name: z.string().trim().max(32).optional(),
  shop_id: z.string().uuid("请选择所属门店").optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "未授权" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller and check admin role
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "未授权" }, 401);
    }
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
      _user_id: callerId,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      return json({ error: "仅管理员可创建用户" }, 403);
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      const first = parsed.error.errors[0]?.message ?? "参数错误";
      return json({ error: first }, 400);
    }
    const { username, password, role, real_name, shop_id } = parsed.data;

    const email = `${username.toLowerCase()}@boomeroff.local`;
    const displayName = real_name?.trim() || username;

    // Pre-check duplicate username
    for (let page = 1; page <= 20; page++) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (listErr) break;
      const found = (list?.users || []).find(
        (u) => (u.email || "").toLowerCase() === email,
      );
      if (found) {
        return json({ error: "用户名已存在" }, 409);
      }
      if (!list?.users || list.users.length < 200) break;
    }

    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      });

    if (createErr || !created.user) {
      const msg = createErr?.message ?? "创建失败";
      const dup = /already|exists|registered/i.test(msg);
      return json({ error: dup ? "用户名已存在" : msg }, dup ? 409 : 400);
    }

    const newUserId = created.user.id;

    // handle_new_user trigger inserts default 'anchor' role.
    // If admin requested, replace it.
    if (role === "admin") {
      await admin.from("user_roles").delete().eq("user_id", newUserId);
      const { error: insertRoleErr } = await admin
        .from("user_roles")
        .insert({ user_id: newUserId, role: "admin" });
      if (insertRoleErr) {
        return json(
          { error: `用户已创建，但角色设置失败：${insertRoleErr.message}` },
          500,
        );
      }
    }

    // Upsert staff_profile with real_name + shop binding
    if (real_name || shop_id) {
      const profilePayload: Record<string, unknown> = { user_id: newUserId };
      if (real_name) profilePayload.real_name = real_name;
      if (shop_id) profilePayload.shop_id = shop_id;
      const { error: profileErr } = await admin
        .from("staff_profiles")
        .upsert(profilePayload, { onConflict: "user_id" });
      if (profileErr) {
        console.error("staff_profiles upsert failed:", profileErr);
      }
    }

    // Sync display_name to profiles table
    if (real_name) {
      await admin
        .from("profiles")
        .update({ display_name: real_name })
        .eq("user_id", newUserId);
    }

    return json({
      success: true,
      user_id: newUserId,
      username,
      role,
    });
  } catch (e) {
    console.error("admin-create-user error:", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});
