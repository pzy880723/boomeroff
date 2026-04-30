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
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } =
      await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return json({ error: "未授权" }, 401);
    }
    const callerId = claimsData.claims.sub;

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
    const { username, password, role } = parsed.data;

    const email = `${username.toLowerCase()}@boomeroff.local`;

    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: username },
      });

    if (createErr || !created.user) {
      const msg = createErr?.message ?? "创建失败";
      const friendly = /already|exists|registered/i.test(msg)
        ? "用户名已存在"
        : msg;
      return json({ error: friendly }, 400);
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
