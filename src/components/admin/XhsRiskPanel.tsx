// 小红书发文核查 · Worker Cookie 配置
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Save, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export function XhsRiskPanel() {
  const [cookie, setCookie] = useState('');
  const [ua, setUa] = useState(DEFAULT_UA);
  const [status, setStatus] = useState<{ status?: string; at?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['xhs_worker_cookie', 'xhs_worker_user_agent', 'xhs_worker_cookie_status']);
    const map: Record<string, string> = {};
    for (const r of data || []) map[(r as any).key] = String((r as any).value || '');
    setCookie(map.xhs_worker_cookie || '');
    setUa(map.xhs_worker_user_agent || DEFAULT_UA);
    try {
      setStatus(map.xhs_worker_cookie_status ? JSON.parse(map.xhs_worker_cookie_status) : null);
    } catch {
      setStatus(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    const rows = [
      { key: 'xhs_worker_cookie', value: cookie.trim() },
      { key: 'xhs_worker_user_agent', value: ua.trim() || DEFAULT_UA },
    ];
    const { error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('已保存');
    // 重置状态显示
    await supabase.from('app_settings').upsert({
      key: 'xhs_worker_cookie_status',
      value: JSON.stringify({ status: 'unknown', at: new Date().toISOString() }),
    });
    load();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">小红书发文核查</h2>
        <p className="text-xs text-muted-foreground mt-1">
          店员领券后需在小红书发探店笔记。Worker 会用下面这个自用账号的登录态去访问用户提交的笔记链接、
          比对作者主页和关键词。请粘贴一个专门用于爬取的小红书 web 版账号 cookie。
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs">
            当前状态：
            {status?.status === 'ok' && <span className="text-green-600">正常（最近一次核查成功）</span>}
            {status?.status === 'expired' && <span className="text-destructive">Cookie 已失效，请重新粘贴</span>}
            {status?.status === 'unknown' && <span className="text-muted-foreground">未核查</span>}
            {!status?.status && <span className="text-muted-foreground">未使用</span>}
            {status?.at && (
              <span className="text-muted-foreground ml-2">
                · {new Date(status.at).toLocaleString('zh-CN')}
              </span>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} />
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Cookie（完整复制浏览器 DevTools 里的 Cookie 字符串）</Label>
          <Textarea
            rows={5}
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
            placeholder="web_session=...; a1=...; xsecappid=...;"
            className="text-xs font-mono"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">User-Agent（一般不用改）</Label>
          <Input value={ua} onChange={(e) => setUa(e.target.value)} className="text-xs font-mono" />
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
            保存
          </Button>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <h3 className="text-sm font-semibold">怎么拿 Cookie？</h3>
        <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-1">
          <li>用电脑 Chrome 打开 xiaohongshu.com 并登录（建议用一个专门的小号）</li>
          <li>按 F12 打开开发者工具 → Application → Cookies → https://www.xiaohongshu.com</li>
          <li>选中所有 Cookie，右键 Copy → Copy all as string，粘贴到上方文本框</li>
          <li>如果长期不用小红书 web，Cookie 大概每 30 天需要重新粘贴一次</li>
        </ol>
      </Card>
    </div>
  );
}
