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
  real_name: z.string().trim().min(1, "请填写真实姓名").max(32).optional(),
  shop_id: z.string().uuid("请选择所属门店"),
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
    const { username, password, display_name, real_name, shop_id } = parsed.data;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const email = `${username.toLowerCase()}@boomeroff.local`;

    // Look up existing user by email (paginate auth.users — small user base)
    const findExistingUser = async (): Promise<{ id: string } | null> => {
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await admin.auth.admin.listUsers({
          page,
          perPage: 200,
        });
        if (error) {
          console.error("listUsers error:", error);
          return null;
        }
        const found = (data?.users || []).find(
          (u) => (u.email || "").toLowerCase() === email,
        );
        if (found) return { id: found.id };
        if (!data?.users || data.users.length < 200) return null;
      }
      return null;
    };

    const respondExisting = async (userId: string) => {
      const { data: roleRow } = await admin
        .from("user_roles")
        .select("suspended")
        .eq("user_id", userId)
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
    };

    // Pre-check: detect existing user to give precise feedback
    const pre = await findExistingUser();
    if (pre) {
      return await respondExisting(pre.id);
    }

    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: display_name || real_name || username },
      });

    if (createErr || !created.user) {
      const msg = createErr?.message ?? "注册失败";
      // Race condition: user created between pre-check and now → still respond cleanly
      if (/already|exists|registered/i.test(msg)) {
        const post = await findExistingUser();
        if (post) return await respondExisting(post.id);
        return json({ error: "用户名已存在" }, 409);
      }
      return json({ error: msg }, 400);
    }

    const newUserId = created.user.id;

    // handle_new_user trigger inserts default role='anchor' role_code='staff'.
    // Mark suspended=true so user must wait for admin approval; also ensure role_code is set
    // (兜底：老库历史触发器可能没写 role_code)
    const { error: suspendErr } = await admin
      .from("user_roles")
      .update({
        suspended: true,
        suspended_at: new Date().toISOString(),
        role_code: "staff",
      })
      .eq("user_id", newUserId);

    if (suspendErr) {
      console.error("Failed to mark new user as suspended:", suspendErr);
    }

    // 写入员工档案，绑定门店和真实姓名
    const profilePayload: Record<string, unknown> = { user_id: newUserId, shop_id };
    if (real_name) profilePayload.real_name = real_name;
    const { error: profileErr } = await admin
      .from("staff_profiles")
      .upsert(profilePayload, { onConflict: "user_id" });
    if (profileErr) {
      console.error("Failed to create staff_profile:", profileErr);
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
