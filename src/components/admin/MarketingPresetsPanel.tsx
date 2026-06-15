// 营销预设管理 — admin only。可编辑品牌话术 / 平台描述 / 口吻描述 / 视频镜位规则。
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Presets = {
  brand_system_prompt: string;
  platform_brief: Record<string, string>;
  tone_brief: Record<string, string>;
  video_type_rules: Record<string, any>;
};

const EMPTY: Presets = {
  brand_system_prompt: '',
  platform_brief: {},
  tone_brief: {},
  video_type_rules: {},
};

export function MarketingPresetsPanel() {
  const [data, setData] = useState<Presets>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: rows, error } = await supabase
      .from('marketing_presets' as any)
      .select('key, value');
    if (error) { toast.error(error.message); setLoading(false); return; }
    const map: any = { ...EMPTY };
    (rows as any[] || []).forEach((r) => { map[r.key] = r.value; });
    setData(map);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const saveKey = async (key: keyof Presets, value: any) => {
    setSaving(key);
    const { error } = await supabase
      .from('marketing_presets' as any)
      .upsert({ key, value }, { onConflict: 'key' });
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    toast.success('已保存,新生成立即生效');
  };

  if (loading) return <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">营销预设</h2>
        <p className="text-xs text-muted-foreground mt-1">
          这里改一次,全员的「文案 / 视频脚本」生成立刻生效。无需重发。
        </p>
      </div>

      <Accordion type="multiple" defaultValue={['brand']} className="space-y-3">
        {/* 品牌话术 */}
        <AccordionItem value="brand" className="border border-border rounded-lg px-3">
          <AccordionTrigger className="text-sm hover:no-underline">品牌话术（写给 AI 的角色定位 / 铁律）</AccordionTrigger>
          <AccordionContent className="space-y-2 pt-2">
            <Textarea
              value={data.brand_system_prompt}
              onChange={(e) => setData({ ...data, brand_system_prompt: e.target.value })}
              rows={14}
              className="text-xs font-mono"
            />
            <Button size="sm" onClick={() => saveKey('brand_system_prompt', data.brand_system_prompt)} disabled={saving === 'brand_system_prompt'}>
              {saving === 'brand_system_prompt' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}保存
            </Button>
          </AccordionContent>
        </AccordionItem>

        {/* 平台 */}
        <AccordionItem value="platform" className="border border-border rounded-lg px-3">
          <AccordionTrigger className="text-sm hover:no-underline">平台描述（每个平台的写作要求）</AccordionTrigger>
          <AccordionContent className="space-y-3 pt-2">
            <KeyValueEditor
              value={data.platform_brief}
              onChange={(v) => setData({ ...data, platform_brief: v })}
              keyPlaceholder="xhs / douyin / shipinhao / pyq"
              valuePlaceholder="标题/正文/话题 要求"
            />
            <Button size="sm" onClick={() => saveKey('platform_brief', data.platform_brief)} disabled={saving === 'platform_brief'}>
              {saving === 'platform_brief' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}保存
            </Button>
          </AccordionContent>
        </AccordionItem>

        {/* 口吻 */}
        <AccordionItem value="tone" className="border border-border rounded-lg px-3">
          <AccordionTrigger className="text-sm hover:no-underline">文案口吻（写法风格 — 文案页 chip 来源）</AccordionTrigger>
          <AccordionContent className="space-y-3 pt-2">
            <p className="text-[11px] text-muted-foreground">
              这里加 / 删的 key 会**直接**出现在「AI 文案」页的 chip 选项里。
            </p>
            <KeyValueEditor
              value={data.tone_brief}
              onChange={(v) => setData({ ...data, tone_brief: v })}
              keyPlaceholder="口吻名(如 种草)"
              valuePlaceholder="一句话给 AI 的写法约束"
            />
            <Button size="sm" onClick={() => saveKey('tone_brief', data.tone_brief)} disabled={saving === 'tone_brief'}>
              {saving === 'tone_brief' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}保存
            </Button>
          </AccordionContent>
        </AccordionItem>

        {/* 视频镜位 */}
        <AccordionItem value="video" className="border border-border rounded-lg px-3">
          <AccordionTrigger className="text-sm hover:no-underline">视频镜位规则 (JSON)</AccordionTrigger>
          <AccordionContent className="space-y-2 pt-2">
            <p className="text-[11px] text-muted-foreground">
              结构: {`{ video_type: { label, required: [{slot,label,minCount,hint}], recommended: [...], scriptHint } }`}
            </p>
            <Textarea
              value={JSON.stringify(data.video_type_rules, null, 2)}
              onChange={(e) => {
                try {
                  setData({ ...data, video_type_rules: JSON.parse(e.target.value) });
                } catch {
                  // 允许过渡态;真正校验在保存时
                }
              }}
              rows={18}
              className="text-[11px] font-mono"
            />
            <Button size="sm" onClick={() => {
              if (!data.video_type_rules || typeof data.video_type_rules !== 'object') {
                toast.error('JSON 格式不对');
                return;
              }
              saveKey('video_type_rules', data.video_type_rules);
            }} disabled={saving === 'video_type_rules'}>
              {saving === 'video_type_rules' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}保存
            </Button>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function KeyValueEditor({
  value, onChange, keyPlaceholder, valuePlaceholder,
}: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
}) {
  const entries = Object.entries(value);
  const [newKey, setNewKey] = useState('');
  return (
    <div className="space-y-2">
      {entries.map(([k, v]) => (
        <div key={k} className="border border-border rounded p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-accent">{k}</span>
            <Button size="sm" variant="ghost" onClick={() => {
              const next = { ...value }; delete next[k]; onChange(next);
            }}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
          <Textarea
            value={v}
            onChange={(e) => onChange({ ...value, [k]: e.target.value })}
            rows={2}
            className="text-xs resize-none"
          />
        </div>
      ))}
      <div className="flex gap-2 items-center pt-1">
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder={keyPlaceholder}
          className="text-xs h-8 flex-1"
        />
        <Button size="sm" variant="outline" onClick={() => {
          const k = newKey.trim();
          if (!k) return;
          if (value[k] !== undefined) { toast.error('已存在'); return; }
          onChange({ ...value, [k]: '' });
          setNewKey('');
        }}>
          <Plus className="w-3.5 h-3.5" />新增
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">{valuePlaceholder}</p>
    </div>
  );
}
