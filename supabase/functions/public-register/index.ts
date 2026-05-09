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
  display_name: z.string().trim().max(32).optional(),
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      const first = parsed.error.errors[0]?.message ?? "参数错误";
      return json({ error: first }, 400);
    }
    const { username, password, display_name } = parsed.data;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const email = `${username.toLowerCase()}@boomeroff.local`;

    // Pre-check: detect existing user to give precise feedback
    {
      const { data: list } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1,
        // @ts-ignore - filter is supported at the GoTrue API level
        filter: `email.eq.${email}`,
      });
      const existing = (list?.users || []).find(
        (u) => (u.email || "").toLowerCase() === email,
      );
      if (existing) {
        const { data: roleRow } = await admin
          .from("user_roles")
          .select("suspended")
          .eq("user_id", existing.id)
          .maybeSingle();
        const suspended = roleRow?.suspended === true;
        return json(
          {
            error: suspended
              ? "您已提交过申请，正在等待管理员审核，请耐心等待"
              : "该用户名已被注册，请直接登录或更换用户名",
          },
          409,
        );
      }
    }

    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: display_name || username },
      });

    if (createErr || !created.user) {
      const msg = createErr?.message ?? "注册失败";
      const friendly = /already|exists|registered/i.test(msg)
        ? "用户名已存在"
        : msg;
      return json({ error: friendly }, 400);
    }

    const newUserId = created.user.id;

    // handle_new_user trigger inserts default 'anchor' role.
    // Mark suspended=true so user must wait for admin approval.
    const { error: suspendErr } = await admin
      .from("user_roles")
      .update({
        suspended: true,
        suspended_at: new Date().toISOString(),
      })
      .eq("user_id", newUserId);

    if (suspendErr) {
      console.error("Failed to mark new user as suspended:", suspendErr);
    }

    return json({
      success: true,
      message: "注册成功，等待管理员审核",
    });
  } catch (e) {
    console.error("public-register error:", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});
