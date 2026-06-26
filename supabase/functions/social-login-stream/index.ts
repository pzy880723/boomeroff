// SSE proxy: streams worker /login through to the browser, then on `success`
// fetches the new worker account id and writes the social_accounts row.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { SAU_BASE, sauHeaders, sauGetAccounts, PLATFORM_CODE, PLATFORM_LABEL } from "../_shared/sau.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const shopId = url.searchParams.get("shop_id") || "";
    const platform = url.searchParams.get("platform") || "";
    const alias = (url.searchParams.get("alias") || "").trim();
    // Browser EventSource cannot set Authorization header. Allow access_token in query string.
    const accessToken = url.searchParams.get("access_token") || (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");

    if (!shopId || !platform || !alias) {
      return new Response(JSON.stringify({ error: "shop_id / platform / alias required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!PLATFORM_CODE[platform]) {
      return new Response(JSON.stringify({ error: `unsupported platform ${platform}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "missing access_token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authn + authz
    const supaUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    );
    const { data: claims, error: cErr } = await supaUser.auth.getClaims(accessToken);
    if (cErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    // verify user can use this shop (admin or staff of shop)
    const { data: roleRow } = await supa.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    const isAdmin = roleRow?.role === "admin";
    if (!isAdmin) {
      const { data: sp } = await supa.from("staff_profiles").select("shop_id").eq("user_id", userId).maybeSingle();
      if (sp?.shop_id !== shopId) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // worker_account_key: deterministic, tenant-scoped, ascii-only.
    const safeAlias = alias.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 32) || "account";
    const workerKey = `shop_${shopId.slice(0, 8)}_${safeAlias}`;

    // Open SSE to worker
    const upstream = await fetch(`${SAU_BASE}/login?type=${PLATFORM_CODE[platform]}&id=${encodeURIComponent(workerKey)}`, {
      method: "GET", headers: sauHeaders({ Accept: "text/event-stream" }),
    });
    if (!upstream.ok || !upstream.body) {
      return new Response(`data: ${JSON.stringify({ status: "error", message: `worker ${upstream.status}` })}\n\n`, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const dec = new TextDecoder();
        const reader = upstream.body!.getReader();
        let buffer = "";

        const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += dec.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || "";
            for (const raw of lines) {
              const line = raw.trim();
              if (!line.startsWith("data:")) continue;
              const json = line.slice(5).trim();
              if (!json) continue;
              let payload: any = null;
              try { payload = JSON.parse(json); } catch { continue; }

              // Rewrite worker image path -> our HTTPS proxy
              if (payload?.status === "qrcode" && typeof payload?.image === "string") {
                const filename = payload.image.includes("filename=")
                  ? new URL(`http://x${payload.image}`).searchParams.get("filename") || ""
                  : "";
                if (filename) {
                  const projectId = Deno.env.get("SUPABASE_URL")!.replace(/^https?:\/\//, "").split(".")[0];
                  payload.image = `https://${projectId}.functions.supabase.co/social-asset-proxy?filename=${encodeURIComponent(filename)}`;
                }
              }

              if (payload?.status === "success") {
                // pull latest worker accounts, find ours, upsert
                try {
                  const accounts = await sauGetAccounts();
                  const mine = accounts.find((a) => a[1] === PLATFORM_CODE[platform] && a[3] === workerKey);
                  if (mine) {
                    const [wid, , , wname] = mine;
                    await supa.from("social_accounts").upsert({
                      shop_id: shopId,
                      platform,
                      account_name: wname || alias,
                      worker_account_key: workerKey,
                      worker_account_id: wid,
                      cookie_status: "active",
                      last_check_at: new Date().toISOString(),
                      created_by: userId,
                    }, { onConflict: "shop_id,platform,worker_account_key" });
                    payload.account = { worker_account_id: wid, label: PLATFORM_LABEL[platform], name: wname || alias };
                  }
                } catch (e) {
                  console.error("upsert account failed", e);
                }
              }

              send(payload);
              if (payload?.status === "success" || payload?.status === "error") {
                controller.close();
                return;
              }
            }
          }
          controller.close();
        } catch (e) {
          try { send({ status: "error", message: String(e) }); } catch { /* ignore */ }
          try { controller.close(); } catch { /* ignore */ }
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
