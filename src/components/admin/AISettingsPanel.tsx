import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, FlaskConical, Sparkles, AlertCircle, CheckCircle2, Globe } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

type ModelId = 'google/gemini-2.5-flash-lite' | 'google/gemini-2.5-flash' | 'google/gemini-2.5-pro';

interface Settings {
  model: ModelId;
  enableWebSearch: boolean;
  enableQuickMatch: boolean;
}

const MODELS: { value: ModelId; label: string; tag: string; desc: string }[] = [
  { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', tag: '极速', desc: '约 1-2 秒，普通商品够用' },
  { value: 'google/gemini-2.5-flash',      label: 'Gemini 2.5 Flash',      tag: '推荐', desc: '约 2-3 秒，瓷器/漆器细节可辨' },
  { value: 'google/gemini-2.5-pro',        label: 'Gemini 2.5 Pro',        tag: '高精度', desc: '约 4-6 秒，复杂鉴定专用（多角度自动用此档）' },
];

const DEFAULT: Settings = {
  model: 'google/gemini-2.5-flash',
  enableWebSearch: false,
  enableQuickMatch: false,
};

export function AISettingsPanel() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT);
  const [savedSettings, setSavedSettings] = useState<Settings>(DEFAULT);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'ai_model').maybeSingle();
    if (data?.value) {
      const v = data.value as any;
      const merged: Settings = {
        model: MODELS.some(m => m.value === v.model) ? v.model : DEFAULT.model,
        enableWebSearch: typeof v.enableWebSearch === 'boolean' ? v.enableWebSearch : false,
        enableQuickMatch: typeof v.enableQuickMatch === 'boolean' ? v.enableQuickMatch : false,
      };
      setSettings(merged);
      setSavedSettings(merged);
    }
    setLoading(false);
  };

  const save = async () => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      const value: Settings = { model: settings.model, enableWebSearch: settings.enableWebSearch };
      const { error } = await supabase
        .from('app_settings')
        .upsert([{ key: 'ai_model', value: value as any, updated_at: new Date().toISOString() }]);
      if (error) throw error;
      setSavedSettings(value);
      toast.success('已保存，下一次识别即生效');
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
      const { data, error } = await supabase.functions.invoke('test-ai-model', {
        body: { model: settings.model },
      });
      if (error) throw error;
      if (data?.ok) setTestResult({ ok: true, message: data.message || '连接成功' });
      else setTestResult({ ok: false, message: data?.error || '测试失败' });
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

  const modelLabel = MODELS.find(m => m.value === savedSettings.model)?.label || savedSettings.model;

  return (
    <div className="space-y-5">
      {!isAdmin && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>仅管理员可修改 AI 设置。</AlertDescription>
        </Alert>
      )}

      {/* 当前生效配置 */}
      <Card className="border-primary/40 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            当前生效配置
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 pb-3 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">模型</span>
            <span className="font-medium">{modelLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">联网搜索</span>
            <span className="font-medium">{savedSettings.enableWebSearch ? '🟢 已开启' : '⚪ 已关闭'}</span>
          </div>
          <p className="text-[10px] text-muted-foreground pt-1">
            识别结果卡顶部会显示本次实际链路（缓存命中 / Gemini · 联网核实 等），可直接验证。
          </p>
        </CardContent>
      </Card>

      {/* 模型选择 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            识别模型
          </CardTitle>
          <CardDescription>
            统一使用 Lovable AI（Gemini）。多角度拍照时会自动升档到 Pro。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={settings.model}
            onValueChange={(v) => setSettings(p => ({ ...p, model: v as ModelId }))}
            disabled={!isAdmin}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODELS.map(m => (
                <SelectItem key={m.value} value={m.value}>
                  <div className="flex items-center gap-2">
                    <span>{m.label}</span>
                    <span className="text-[10px] px-1.5 py-px rounded-full bg-muted text-muted-foreground">{m.tag}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-2">
            {MODELS.find(m => m.value === settings.model)?.desc}
          </p>
        </CardContent>
      </Card>

      {/* 联网搜索 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            联网搜索
          </CardTitle>
          <CardDescription>
            开启后，Gemini 遇到不熟悉的外文品牌、型号编号、底款铭文、动漫 IP 时，会通过 Google 搜索自动核实再回答。常见品类仍秒出。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2.5">
            <div className="space-y-0.5">
              <div className="text-sm font-medium">允许 AI 联网搜索</div>
              <div className="text-xs text-muted-foreground">
                {settings.enableWebSearch ? '已开启 · 拿不准时自动联网' : '已关闭 · 仅用模型自身知识'}
              </div>
            </div>
            <Switch
              checked={settings.enableWebSearch}
              onCheckedChange={(v) => setSettings(p => ({ ...p, enableWebSearch: v }))}
              disabled={!isAdmin}
            />
          </div>
        </CardContent>
      </Card>

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
