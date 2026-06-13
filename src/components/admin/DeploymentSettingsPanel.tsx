// 部署设置：对外域名（用于二维码/分享链接）
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, Globe, AlertCircle } from 'lucide-react';
import { loadPublicBaseUrl, savePublicBaseUrl, getPublicBaseUrl } from '@/lib/publicBaseUrl';
import { toast } from 'sonner';

export function DeploymentSettingsPanel() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      await loadPublicBaseUrl();
      setUrl(getPublicBaseUrl().startsWith('http') ? getPublicBaseUrl() : '');
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePublicBaseUrl(url);
      toast.success('已保存，新生成的二维码和分享链接将使用该域名');
    } catch (e: any) {
      toast.error('保存失败：' + (e?.message || '权限不足'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="w-4 h-4" /> 对外部署域名
        </CardTitle>
        <CardDescription className="text-xs">
          海报二维码、活动分享链接、券领取链接都会使用这里配置的域名。留空则使用当前访问的域名（仅本地预览用）。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">部署后的正式域名</Label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://shop.your-domain.com"
            inputMode="url"
          />
          <p className="text-[11px] text-muted-foreground">示例：https://boomeroff.lovable.app 或你自己的腾讯云域名</p>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            修改后已经生成过的海报需要重新生成才会用上新域名。
          </AlertDescription>
        </Alert>

        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
          保存
        </Button>
      </CardContent>
    </Card>
  );
}
