import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import { Loader2, Save, FlaskConical, Sparkles, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

type Provider = 'lovable' | 'doubao' | 'custom';
type Precision = 'economy' | 'standard' | 'high';

interface Settings {
  provider: Provider;
  model: string;
  precision: Precision;
  enableWebSearch: boolean;
  custom: { baseUrl: string; apiKey: string; model: string };
}

const LOVABLE_MODELS: { value: string; label: string; tag: string }[] = [
  { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', tag: '最快' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', tag: '平衡 · 推荐' },
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', tag: '新一代' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', tag: '最强多模态' },
  { value: 'openai/gpt-5-nano', label: 'GPT-5 Nano', tag: '快' },
  { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini', tag: '平衡' },
  { value: 'openai/gpt-5', label: 'GPT-5', tag: '最强' },
];

const DOUBAO_MODELS: { value: string; label: string; tag: string }[] = [
  { value: 'doubao-seed-1-6-250615', label: '豆包 Seed 1.6 (视觉)', tag: '最新 · 推荐' },
  { value: 'doubao-1-5-vision-pro-32k-250115', label: '豆包 1.5 Vision Pro', tag: '稳定' },
  { value: 'doubao-1-5-vision-lite-32k-250115', label: '豆包 1.5 Vision Lite', tag: '极速' },
];

const PRECISION_OPTIONS: { value: Precision; label: string; desc: string }[] = [
  { value: 'economy', label: '极速', desc: '约 1 秒，适合大量普通商品（lite 模型）' },
  { value: 'standard', label: '标准（推荐）', desc: '约 2 秒，瓷器/漆器细节可辨（flash 模型）' },
  { value: 'high', label: '高精度', desc: '约 3-5 秒，复杂鉴定专用（pro 模型）' },
];

const DEFAULT: Settings = {
  provider: 'lovable',
  model: 'google/gemini-2.5-flash',
  precision: 'standard',
  custom: { baseUrl: '', apiKey: '', model: '' },
};

export function AISettingsPanel() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT);
  const [hadStoredKey, setHadStoredKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'ai_model')
      .maybeSingle();
    if (data?.value) {
      const v = data.value as unknown as Partial<Settings> & { precision?: Precision };
      const provider: Provider =
        v.provider === 'custom' ? 'custom'
        : v.provider === 'doubao' ? 'doubao'
        : 'lovable';
      const merged: Settings = {
        provider,
        model: v.model || DEFAULT.model,
        precision: (['economy', 'standard', 'high'] as Precision[]).includes(v.precision as Precision)
          ? (v.precision as Precision) : 'standard',
        custom: {
          baseUrl: v.custom?.baseUrl || '',
          apiKey: '', // 不回填明文
          model: v.custom?.model || '',
        },
      };
      setSettings(merged);
      setHadStoredKey(!!v.custom?.apiKey);
    }
    setLoading(false);
  };

  const save = async () => {
    if (!isAdmin) return;
    if (settings.provider === 'custom') {
      if (!settings.custom.baseUrl.trim() || !settings.custom.model.trim()) {
        toast.error('请填写自定义接口的 Base URL 和模型名称');
        return;
      }
      if (!hadStoredKey && !settings.custom.apiKey.trim()) {
        toast.error('请填写 API Key');
        return;
      }
    }

    setSaving(true);
    try {
      // 读取已有以保留旧 apiKey（若用户没改）
      const { data: existing } = await supabase
        .from('app_settings').select('value').eq('key', 'ai_model').maybeSingle();
      const existingKey = (existing?.value as unknown as Settings | null)?.custom?.apiKey || '';
      const finalKey = settings.custom.apiKey.trim() || existingKey;

      const value: Settings = {
        provider: settings.provider,
        model: settings.model,
        precision: settings.precision,
        custom: {
          baseUrl: settings.custom.baseUrl.trim(),
          apiKey: finalKey,
          model: settings.custom.model.trim(),
        },
      };

      const { error } = await supabase
        .from('app_settings')
        .upsert([{ key: 'ai_model', value: value as any, updated_at: new Date().toISOString() }]);
      if (error) throw error;
      toast.success('设置已保存，下一次识别即生效');
      setHadStoredKey(!!finalKey);
      setSettings((p) => ({ ...p, custom: { ...p.custom, apiKey: '' } }));
    } catch (e) {
      console.error(e);
      toast.error('保存失败：可能权限不足');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const body: any = { provider: settings.provider, model: settings.model };
      if (settings.provider === 'custom') {
        body.baseUrl = settings.custom.baseUrl;
        body.apiKey = settings.custom.apiKey; // 若空则后端使用已存储的
        body.model = settings.custom.model;
      }
      const { data, error } = await supabase.functions.invoke('test-ai-model', { body });
      if (error) throw error;
      if (data?.ok) {
        setTestResult({ ok: true, message: data.message || '连接成功' });
      } else {
        setTestResult({ ok: false, message: data?.error || '测试失败' });
      }
    } catch (e: any) {
      setTestResult({ ok: false, message: e?.message || '测试失败' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" />
        加载中...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!isAdmin && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            仅管理员可修改 AI 模型设置。当前可查看但无法保存。
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            识别模型来源
          </CardTitle>
          <CardDescription>选择系统识别商品时使用的 AI 模型，全局生效。</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={settings.provider}
            onValueChange={(v) => setSettings((p) => {
              const np = v as Provider;
              let model = p.model;
              if (np === 'doubao' && !DOUBAO_MODELS.some((m) => m.value === model)) {
                model = DOUBAO_MODELS[0].value;
              } else if (np === 'lovable' && !LOVABLE_MODELS.some((m) => m.value === model)) {
                model = DEFAULT.model;
              }
              return { ...p, provider: np, model };
            })}
            className="space-y-3"
            disabled={!isAdmin}
          >
            <label className="flex items-start gap-3 p-3 rounded-lg border border-border/60 cursor-pointer hover:bg-muted/40">
              <RadioGroupItem value="lovable" id="r-lovable" className="mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-medium text-sm">Lovable AI</div>
                <div className="text-xs text-muted-foreground">
                  内置 Gemini 与 GPT-5 系列，无需额外配置。flash-lite 最快，1-2 秒识别。
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border border-accent/60 bg-accent/5 cursor-pointer hover:bg-accent/10">
              <RadioGroupItem value="doubao" id="r-doubao" className="mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-medium text-sm flex items-center gap-1.5">
                  豆包 · 火山方舟
                  <span className="text-[10px] px-1.5 py-px rounded-full bg-accent text-accent-foreground">中文古玩首选</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  字节自研多模态模型，对汉字落款、日系品牌、动漫 IP 识别准确度极高，2-4 秒。已内置 API Key，开箱即用。
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border border-border/60 cursor-pointer hover:bg-muted/40">
              <RadioGroupItem value="custom" id="r-custom" className="mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-medium text-sm">自定义 OpenAI 兼容接口</div>
                <div className="text-xs text-muted-foreground">
                  接入 DeepSeek、Qwen、自部署等。需填写 Base URL、API Key 与模型名。
                </div>
              </div>
            </label>
          </RadioGroup>
        </CardContent>
      </Card>

      {settings.provider === 'lovable' && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">识别精度</CardTitle>
              <CardDescription>影响识别准确率与速度。多角度模式会自动升一档。</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={settings.precision}
                onValueChange={(v) =>
                  setSettings((p) => ({ ...p, precision: v as Precision }))
                }
                className="space-y-2"
                disabled={!isAdmin}
              >
                {PRECISION_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border/60 cursor-pointer hover:bg-muted/40"
                  >
                    <RadioGroupItem value={opt.value} className="mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="font-medium text-sm">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">高级：手动指定模型（可选）</CardTitle>
              <CardDescription>留作"标准"即按上面精度自动选择；选具体型号则覆盖。</CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={settings.model}
                onValueChange={(v) => setSettings((p) => ({ ...p, model: v }))}
                disabled={!isAdmin}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOVABLE_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      <div className="flex items-center gap-2">
                        <span>{m.label}</span>
                        <span className="text-[10px] px-1.5 py-px rounded-full bg-muted text-muted-foreground">{m.tag}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </>
      )}

      {settings.provider === 'doubao' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">豆包模型</CardTitle>
            <CardDescription>选择火山方舟上的豆包视觉模型。API Key 已内置，无需填写。</CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={DOUBAO_MODELS.some((m) => m.value === settings.model) ? settings.model : DOUBAO_MODELS[0].value}
              onValueChange={(v) => setSettings((p) => ({ ...p, model: v }))}
              disabled={!isAdmin}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOUBAO_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <div className="flex items-center gap-2">
                      <span>{m.label}</span>
                      <span className="text-[10px] px-1.5 py-px rounded-full bg-accent/20 text-accent-foreground">{m.tag}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-2">
              提示：保存后用下方"测试连接"按钮可以验证豆包是否通畅。
            </p>
          </CardContent>
        </Card>
      )}

      {settings.provider === 'custom' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">自定义接口配置</CardTitle>
            <CardDescription>需兼容 OpenAI Chat Completions 格式且支持 vision（图像输入）。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input
                value={settings.custom.baseUrl}
                onChange={(e) => setSettings((p) => ({ ...p, custom: { ...p.custom, baseUrl: e.target.value } }))}
                placeholder="https://api.deepseek.com/v1"
                disabled={!isAdmin}
              />
              <p className="text-[11px] text-muted-foreground">不要包含 /chat/completions 后缀</p>
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={settings.custom.apiKey}
                  onChange={(e) => setSettings((p) => ({ ...p, custom: { ...p.custom, apiKey: e.target.value } }))}
                  placeholder={hadStoredKey ? '已配置 · 留空则不修改' : 'sk-...'}
                  disabled={!isAdmin}
                  className="pr-10"
                />
                <button type="button" onClick={() => setShowKey((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>模型名称</Label>
              <Input
                value={settings.custom.model}
                onChange={(e) => setSettings((p) => ({ ...p, custom: { ...p.custom, model: e.target.value } }))}
                placeholder="如：deepseek-vl2"
                disabled={!isAdmin}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {testResult && (
        <Alert variant={testResult.ok ? 'default' : 'destructive'}>
          {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertDescription>{testResult.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2 justify-end sticky bottom-0 bg-background pt-2">
        <Button variant="outline" onClick={test} disabled={testing || !isAdmin}>
          {testing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FlaskConical className="w-4 h-4 mr-1.5" />}
          测试连接
        </Button>
        <Button onClick={save} disabled={saving || !isAdmin}>
          {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
          保存设置
        </Button>
      </div>
    </div>
  );
}
