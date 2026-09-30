// TEMPORARY one-shot runner for campaign national-day-20260930-xintiandi-youth-v2. Delete after use.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildArkTaskBody } from "../_shared/seedance-submit.ts";
import { resolveSeedanceModel } from "../_shared/seedance-models.ts";

const KEY = "campaign:national-day-20260930-xintiandi-youth-v2";
const TOKEN_HASH = "9f7206fdae2420322567d0814072e1c484d554d078f76d6cb9af2ffebd70f7ec";
const ARK = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
const BASE = "https://narqwgwpqglathwtyevz.supabase.co/storage/v1/object/public/product-images/campaigns%2Fnational-day-20260930-xintiandi-youth-v2%2F";
const FILES = ["01_33.jpg","02_35_s.jpg","03_28_s.jpg","04_17.jpg","05_36_s.jpg","06_32.jpg","07_37_s.jpg","08_06.jpg","09_20.jpg","10_character-blue_s.jpg"];

const PROMPT = `上海新天地东台里 BOOMER·OFF Vintage 国庆年轻游客探店广告。完整25秒，9:16竖屏，1080p，原生中文有声。一个连续音画成片，剪辑在这一次生成内完成。
参考图片顺序必须严格绑定：
图片1=附件33.jpg：新天地真实正面门头，粉红色BOOMER·OFF与浅粉色手写Vintage招牌；图片2=35.jpg：同店侧面门头与开放入口；图片3=28.jpg：店内整体关系；图片4=17.jpg：玩具货架；图片5=36.jpg：瓷器货架；图片6=32.jpg：瓷器杯碟岛台；图片7=37.jpg：黑胶唱片与老数码；图片8=06.jpg：玩具通道与底层藤编翻找筐；图片9=20.jpg：布贴手作材料；图片10=character-blue.png：唯一主人公。
角色：参照图片10的短发中国成年女生，蓝色工装外套、炭灰内搭、米色宽松工装裤、黑白帆布鞋、灰色斜挎包；全片脸、短发、衣服保持一致。自然皮肤纹理、细小毛孔、真实发丝和棉布褶皱；青春旅行感，轻快兴奋，像真朋友带路，不做塑料磨皮脸。
场景：所有场景只对应这组新天地真实照片。保留白色裸顶、轨道灯、黑色洞洞板木层架、木岛台、藤筐的结构和密度。店铺为开放入口，不生成开门、门框、街边立面。
0–4秒：从第一帧女生就站在真实入口前，人物半身与原门头Logo同框；一只手向上明确指着BOOMER·OFF招牌、眼睛看镜头，同时说开场台词。镜头胸口高度24mm，轻快向前跟进；人物立即转身招呼跟上，顺畅走入开放入口。绝不以无人门头空镜开场，不从纯照片静帧开始。原招牌字形、内容、大小关系、粉红与浅粉颜色必须保持；不得凭空改Logo。
4–9秒：35mm侧跟到图片4的密集玩具架前，她眼睛一亮，低头拿起一件照片中的小玩具，短暂看向镜头；镜头顺着手部动作快速切商品近景。玩具保持真实形状，不活过来，不融合。
9–14秒：切图片5、6的瓷器区，女生双手托一只真实参考中的花纹杯碟，轻转角度让釉面受光；再随横向运镜来到图片7的黑胶与老数码，唱片格、音箱、旧电脑维持真实比例，不声称设备可用。不得给玩具标欧洲来源。
14–19秒：回到图片8同店货架底部藤筐，女生蹲下轻快翻看小物，拿起一件笑着展示，身体动作连续自然；只在18–19秒带过图片9手作台和挑布贴动作，手作不抢主题。
19–25秒：女生拿着选中的小物面对镜头招手，略向入口方向走，背景仍能识别新天地真实陈列；一句明确到店指令，然后说免费冰箱贴结尾，话说完再收镜。无需冰箱贴实物特写，无夸张特效，无额外静止门头落版。
全片仅这位女生一个主说话者，自然明亮年轻女声、普通话、略快且兴奋、轻重音鲜明、吐字清楚，无卡顿、重复、吞字、机械配音，品牌BOOMER OFF自然读英语。商品特写时同一声音连续画外音，人物正面说话时口型同步。总口播25秒内完整收尾，BGM较低，不压人声，环境有轻脚步和翻找声。精确台词（按顺序一遍，不能循环）：
“国庆到新天地，直接冲东台里的 BOOMER OFF！日本中古玩具，日本和欧洲中古瓷器，黑胶、老数码，一整家中古杂货铺，全场六块九起！进门就翻，一框接一框，越淘越上头！手作区还能顺便玩一下。逛新天地，就来这里淘！最后别忘了到店免费领冰箱贴！”
不添加烧录字幕、额外广告大字、价格牌或伪造店名；实际招牌与参考里已有文字必须保留原貌。真实相机实拍质感，动态自然、商品清晰，轻快剪辑，人物手正常，无畸变、无新增陌生门店。`;

const j = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 1), { status: s, headers: { "Content-Type": "application/json" } });
async function sha(t: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const tok = req.headers.get("x-run-token") || "";
  if (!tok || (await sha(tok)) !== TOKEN_HASH) return j({ error: "forbidden" }, 403);
  const action = new URL(req.url).searchParams.get("action") || "status";
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const arkKey = Deno.env.get("ARK_API_KEY")!;
  const { data: row } = await admin.from("app_settings").select("value").eq("key", KEY).maybeSingle();
  const rec: any = row?.value || null;

  const save = (v: any) => admin.from("app_settings").update({ value: v, updated_at: new Date().toISOString() }).eq("key", KEY);

  if (action === "submit") {
    // retry allowed ONLY if previous attempt created no provider task (verified via list)
    if (rec && (rec.task_id || rec.status !== "submitting" || !new URL(req.url).searchParams.get("confirm_no_task"))) return j({ reused: true, record: rec });
    if (!rec) {
      const lock = await admin.from("app_settings").insert({ key: KEY, value: { status: "submitting", locked_at: new Date().toISOString() } });
      if (lock.error) return j({ reused: true, lock_error: lock.error.message });
    } else {
      await save({ status: "submitting", locked_at: new Date().toISOString(), prior_attempt: { locked_at: rec.locked_at, outcome: "edge wall-clock killed before Ark responded; Ark task list showed 0 tasks" } });
    }
    const model = resolveSeedanceModel("doubao-seedance-2-5-260628");
    const refs = FILES.map((f) => BASE + f);
    const built = buildArkTaskBody({ model, prompt: PROMPT, ratio: "9:16", duration: 25, resolution: "1080p", referenceImages: refs, generateAudio: true });
    const { data: cur } = await admin.from("app_settings").select("value").eq("key", KEY).maybeSingle();
    const work = (async () => {
      let v: any = { ...(cur?.value || {}), business_id: "national-day-20260930-xintiandi-youth-v2", shop: "上海新天地店", model: model.id, duration: built.duration, resolution: "1080p", ratio: "9:16", generate_audio: true, reference_count: built.referenceCount, reference_urls: refs, mode: built.mode };
      try {
        const res = await fetch(ARK, { method: "POST", headers: { Authorization: `Bearer ${arkKey}`, "Content-Type": "application/json" }, body: JSON.stringify(built.body), signal: AbortSignal.timeout(300_000) });
        const txt = await res.text();
        let body: any; try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 500) }; }
        v = { ...v, http_status: res.status, request_id: res.headers.get("x-request-id") || res.headers.get("x-tt-logid") || null, task_id: body?.id || null, status: body?.id ? "submitted" : "submit_failed", error: body?.id ? null : (body?.error || body), submitted_at: new Date().toISOString() };
      } catch (e) {
        v = { ...v, status: "submit_unknown", error: String((e as Error)?.message || e), submitted_at: new Date().toISOString() };
      }
      await save(v);
    })();
    // @ts-ignore
    if ((globalThis as any).EdgeRuntime?.waitUntil) (globalThis as any).EdgeRuntime.waitUntil(work); else await work;
    return j({ accepted: true, poll: "action=status" }, 202);
  }

  if (action === "list") {
    const r = await fetch(`${ARK}?page_num=1&page_size=20&filter.model=doubao-seedance-2-5-260628`, { headers: { Authorization: `Bearer ${arkKey}` } });
    const t: any = await r.json().catch(() => ({}));
    const items = (t?.items || []).map((i: any) => ({ id: i.id, status: i.status, created_at: i.created_at, duration: i.duration, resolution: i.resolution, error: i.error }));
    return j({ http: r.status, total: t?.total, items, err: t?.error || null });
  }
  if (action === "adopt") {
    const id = new URL(req.url).searchParams.get("id");
    if (!id || rec?.task_id) return j({ error: "bad", record: rec });
    await save({ ...rec, business_id: "national-day-20260930-xintiandi-youth-v2", shop: "上海新天地店", model: "doubao-seedance-2-5-260628", duration: 25, resolution: "1080p", ratio: "9:16", generate_audio: true, reference_count: 10, reference_urls: FILES.map((f) => BASE + f), task_id: id, status: "submitted", note: "submit response lost (function wall-clock); task recovered from Ark list" });
    return j({ adopted: id });
  }
  if (!rec) return j({ record: null });
  if (!rec.task_id) return j({ record: rec });
  const r = await fetch(`${ARK}/${rec.task_id}`, { headers: { Authorization: `Bearer ${arkKey}` } });
  const t: any = await r.json().catch(() => ({}));
  const v = { ...rec, status: t?.status || rec.status, video_url: t?.content?.video_url || rec.video_url || null, usage: t?.usage || null, provider_error: t?.error || null, provider_duration: t?.duration ?? null, provider_resolution: t?.resolution ?? null, checked_at: new Date().toISOString() };
  await save(v);
  return j(v);
});
