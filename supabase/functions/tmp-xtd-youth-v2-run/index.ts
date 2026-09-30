// 临时固定任务运行器:national-day-20260930-xintiandi-youth-v2(text-generated-character)。执行后删除。
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildArkTaskBody } from "../_shared/seedance-submit.ts";
import { resolveSeedanceModel } from "../_shared/seedance-models.ts";

const TOKEN_SHA = "4ebb4c871d56487dad431b16dd8dd1dda54ba068baf16abe7962f141710e6ab3";
const BID = "national-day-20260930-xintiandi-youth-v2";
const KEY = `campaign:${BID}`;
const MODEL = "doubao-seedance-2-5-260628";
const EP = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
const BASE = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/product-images/campaigns%2F${BID}%2F`;
const REFS = ["01_33.jpg","02_35_s.jpg","03_28_s.jpg","04_17.jpg","05_36_s.jpg","06_32.jpg","07_37_s.jpg","08_06.jpg","09_20.jpg"].map((f) => BASE + f);

const PROMPT = `上海新天地东台里 BOOMER·OFF Vintage 国庆年轻游客探店广告。完整25秒，9:16竖屏，1080p，原生中文有声。一个连续音画成片，剪辑在这一次生成内完成。
参考图片顺序必须严格绑定：
图片1=附件33.jpg：新天地真实正面门头，粉红色BOOMER·OFF与浅粉色手写Vintage招牌；图片2=35.jpg：同店侧面门头与开放入口；图片3=28.jpg：店内整体关系；图片4=17.jpg：玩具货架；图片5=36.jpg：瓷器货架；图片6=32.jpg：瓷器杯碟岛台；图片7=37.jpg：黑胶唱片与老数码；图片8=06.jpg：玩具通道与底层藤编翻找筐；图片9=20.jpg：布贴手作材料。仅这9张真实门店参考，不提供人物参考图。
角色：由模型原创生成一名约25岁的中国成年女生，不复刻任何具体真人或已有参考脸。自然黑色齐下巴短发、清爽亲切的笑容，蓝色工装外套、炭灰内搭、米色宽松工装裤、黑白帆布鞋、灰色斜挎包；全片使用同一名女生，脸、短发、衣服保持一致。自然皮肤纹理、细小毛孔、真实发丝和棉布褶皱；青春旅行感，轻快兴奋，像真朋友带路，不做塑料磨皮脸。
场景：所有场景只对应这组新天地真实照片。保留白色裸顶、轨道灯、黑色洞洞板木层架、木岛台、藤筐的结构和密度。店铺为开放入口，不生成开门、门框、街边立面。
0–4秒：从第一帧女生就站在真实入口前，人物半身与原门头Logo同框；一只手向上明确指着BOOMER·OFF招牌、眼睛看镜头，同时说开场台词。镜头胸口高度24mm，轻快向前跟进；人物立即转身招呼跟上，顺畅走入开放入口。绝不以无人门头空镜开场，不从纯照片静帧开始。原招牌字形、内容、大小关系、粉红与浅粉颜色必须保持；不得凭空改Logo。
4–9秒：35mm侧跟到图片4的密集玩具架前，她眼睛一亮，低头拿起一件照片中的小玩具，短暂看向镜头；镜头顺着手部动作快速切商品近景。玩具保持真实形状，不活过来，不融合。
9–14秒：切图片5、6的瓷器区，女生双手托一只真实参考中的花纹杯碟，轻转角度让釉面受光；再随横向运镜来到图片7的黑胶与老数码，唱片格、音箱、旧电脑维持真实比例，不声称设备可用。不得给玩具标欧洲来源。
14–19秒：回到图片8同店货架底部藤筐，女生蹲下轻快翻看小物，拿起一件笑着展示，身体动作连续自然；只在18–19秒带过图片9手作台和挑布贴动作，手作不抢主题。
19–25秒：女生拿着选中的小物面对镜头招手，略向入口方向走，背景仍能识别新天地真实陈列；一句明确到店指令，然后说免费冰箱贴结尾，话说完再收镜。无需冰箱贴实物特写，无夸张特效，无额外静止门头落版。
全片仅这位女生一个主说话者，自然明亮年轻女声、普通话、略快且兴奋、轻重音鲜明、吐字清楚，无卡顿、重复、吞字、机械配音，品牌BOOMER OFF自然读英语。商品特写时同一声音连续画外音，人物正面说话时口型同步。总口播25秒内完整收尾，BGM较低，不压人声，环境有轻脚步和翻找声。精确台词（按顺序一遍，不能循环）：
“国庆到新天地，直接冲东台里的 BOOMER OFF！日本中古玩具，日本和欧洲中古瓷器，黑胶、老数码，一整家中古杂货铺，全场六块九起！进门就翻，一框接一框，越淘越上头！手作区还能顺便玩一下。逛新天地，就来这里淘！最后别忘了到店免费领冰箱贴！”
不添加烧录字幕、额外广告大字、价格牌或伪造店名；实际招牌与参考里已有文字必须保留原貌。真实相机实拍质感，动态自然、商品清晰，轻快剪辑，人物手正常，无畸变、无新增陌生门店。`;

async function sha(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return j({ error: "method" }, 405);
  if ((await sha(req.headers.get("x-run-token") || "")) !== TOKEN_SHA) return j({ error: "forbidden" }, 403);
  const { action } = await req.json().catch(() => ({}));
  const ark = Deno.env.get("ARK_API_KEY")!;
  const H = { Authorization: `Bearer ${ark}`, "Content-Type": "application/json" };
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: row } = await sb.from("app_settings").select("value").eq("key", KEY).maybeSingle();
  const rec: any = (row?.value as any) || {};
  const save = async (v: any) => sb.from("app_settings").upsert({ key: KEY, value: v }, { onConflict: "key" });

  const listRes = await fetch(`${EP}?page_num=1&page_size=50&filter.model=${MODEL}`, { headers: H });
  const list = await listRes.json().catch(() => ({}));
  const tasks = (list.items || []).map((t: any) => ({ id: t.id, status: t.status, created_at: t.created_at }));

  if (action === "check") return j({ db_task_id: rec.task_id ?? null, db_status: rec.status, ark_list_http: listRes.status, ark_tasks: tasks });

  if (action === "query") {
    const id = rec.task_id;
    if (!id) return j({ error: "no task_id" }, 400);
    const r = await fetch(`${EP}/${id}`, { headers: H });
    const t = await r.json().catch(() => ({}));
    rec.status = t.status ?? rec.status;
    if (t.content?.video_url) rec.video_url = t.content.video_url;
    if (t.usage) rec.usage = t.usage;
    if (t.error) rec.task_error = t.error;
    rec.last_query_at = new Date().toISOString();
    await save(rec);
    return j({ http: r.status, id: t.id, status: t.status, model: t.model, duration: t.duration, resolution: t.resolution, ratio: t.ratio, video_url: t.content?.video_url, usage: t.usage, error: t.error });
  }

  if (action === "submit") {
    if (rec.task_id) return j({ reused: true, task_id: rec.task_id });
    if (!listRes.ok) return j({ error: "ark list failed, refusing submit", http: listRes.status, list }, 409);
    if (tasks.length) return j({ error: "ark already has tasks for model, refusing submit", tasks }, 409);
    if (rec.submit_lock) return j({ error: "locked", lock: rec.submit_lock }, 409);
    rec.submit_lock = new Date().toISOString();
    await save(rec);
    const built = buildArkTaskBody({ model: resolveSeedanceModel(MODEL), prompt: PROMPT, ratio: "9:16", duration: 25, resolution: "1080p", referenceImages: REFS, generateAudio: true });
    const r = await fetch(EP, { method: "POST", headers: H, body: JSON.stringify(built.body) });
    const out = await r.json().catch(() => ({}));
    const attempt: any = { at: new Date().toISOString(), scheme: "text-generated-character", reference_count: built.referenceCount, http_status: r.status };
    if (r.ok && out.id) {
      rec.task_id = out.id; rec.status = "submitted"; attempt.outcome = "task_created"; attempt.task_id = out.id;
    } else {
      attempt.outcome = "rejected_no_task_created"; attempt.code = out.error?.code; attempt.message = out.error?.message;
      attempt.request_id = r.headers.get("x-request-id") || r.headers.get("x-tt-logid") || out.request_id;
      rec.status = "failed_text_generated_character";
    }
    rec.scheme = "text-generated-character"; rec.reference_count = 9; rec.duration = built.duration;
    rec.attempts = [...(rec.attempts || []), attempt];
    await save(rec);
    return j({ ...attempt, mode: built.mode, duration: built.duration });
  }
  return j({ error: "action" }, 400);
});
