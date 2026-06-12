import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, XCircle, Send, ShieldCheck, Info } from 'lucide-react';

type SendResult = {
  ok?: boolean;
  error?: string;
  detail?: any;
  config?: {
    sdk_app_id: string | null;
    sign_name: string | null;
    template_id: string | null;
    sign_source?: string;
    sign_length?: number;
    sign_contains_replacement?: boolean;
    sign_decode_error?: string | null;
    sign_codepoints?: string[];
    sign_b64_configured?: boolean;
  };
};
type VerifyResult = { ok?: boolean; reason?: string; message?: string; error?: string };

export function SmsTestPanel() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [config, setConfig] = useState<SendResult['config'] | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    supabase.functions.invoke('sms-test', { body: { action: 'diagnose' } })
      .then(({ data }) => setConfig((data as SendResult)?.config || null))
      .catch(() => setConfig(null));
  }, []);

  const handleSend = async () => {
    setSendResult(null);
    setVerifyResult(null);
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('sms-test', {
        body: { action: 'send', phone: phone.trim() },
      });
      if (error) {
        const parsed = await parseFunctionError(error);
        setSendResult({
          ok: false,
          error: parsed?.error || error.message,
          detail: parsed?.detail || parsed,
          config: parsed?.config,
        });
        if (parsed?.config) setConfig(parsed.config);
      } else {
        setSendResult(data as SendResult);
        if ((data as SendResult)?.config) setConfig((data as SendResult).config || null);
        if ((data as SendResult)?.ok) setCooldown(60);
      }
    } catch (e: any) {
      setSendResult({ ok: false, error: String(e) });
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    setVerifyResult(null);
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('sms-test', {
        body: { action: 'verify', phone: phone.trim(), code: code.trim() },
      });
      if (error) setVerifyResult({ ok: false, error: error.message });
      else setVerifyResult(data as VerifyResult);
    } catch (e: any) {
      setVerifyResult({ ok: false, error: String(e) });
    } finally {
      setVerifying(false);
    }
  };

  const cfg = sendResult?.config || config;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> 短信测试
        </h2>
        <p className="text-xs text-muted-foreground">
          输入手机号,直接走腾讯云真实链路发送 OTP,并可即时校验验证码是否正确。仅记录在测试表,不影响业务数据。
        </p>
      </div>

      {cfg && (
        <Card className="p-3 bg-muted/40">
          <div className="flex items-start gap-2 text-xs">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <div className="text-muted-foreground">当前腾讯云配置(后端实际使用):</div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline">应用ID: {cfg.sdk_app_id || '未配置'}</Badge>
                <Badge variant="outline">签名: {cfg.sign_name || '未配置'}</Badge>
                <Badge variant="outline">模板: {cfg.template_id || '未配置'}</Badge>
                <Badge variant="outline">来源: {cfg.sign_source === 'base64' ? '编码签名' : cfg.sign_source === 'safe_default' ? '安全内置签名' : '普通签名'}</Badge>
                <Badge variant="outline">长度: {cfg.sign_length ?? '未知'}</Badge>
                <Badge variant={cfg.sign_contains_replacement ? 'destructive' : 'outline'}>
                  损坏字符: {cfg.sign_contains_replacement ? '有' : '无'}
                </Badge>
              </div>
              {cfg.sign_decode_error && (
                <div className="text-[10px] text-destructive break-all">
                  编码签名读取异常，已改用安全内置签名: {cfg.sign_decode_error}
                </div>
              )}
              {cfg.sign_codepoints && cfg.sign_codepoints.length > 0 && (
                <div className="text-[10px] text-muted-foreground break-all">
                  编码点: {cfg.sign_codepoints.join(' ')}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <Label htmlFor="phone">手机号(中国大陆 11 位)</Label>
        <div className="flex gap-2">
          <Input
            id="phone"
            placeholder="例如 13800138000"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
            inputMode="numeric"
            maxLength={11}
          />
          <Button onClick={handleSend} disabled={sending || cooldown > 0 || phone.length !== 11}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span className="ml-1.5">
              {cooldown > 0 ? `${cooldown}s` : '发送验证码'}
            </span>
          </Button>
        </div>

        {sendResult && (
          sendResult.ok ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription className="text-xs">
                已发送,请查收。5 分钟内有效。
                {sendResult.detail?.request_id && (
                  <div className="mt-1 text-muted-foreground">
                    RequestId: {sendResult.detail.request_id}
                  </div>
                )}
                {sendResult.detail?.serial_no && (
                  <div className="text-muted-foreground">
                    SerialNo: {sendResult.detail.serial_no}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription className="text-xs space-y-1">
                <div>发送失败:{sendResult.error || '未知错误'}</div>
                {sendResult.detail && (
                  <pre className="text-[10px] bg-background/40 p-2 rounded overflow-auto max-h-40">
{JSON.stringify(sendResult.detail, null, 2)}
                  </pre>
                )}
              </AlertDescription>
            </Alert>
          )
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <Label htmlFor="code">验证码(6 位)</Label>
        <div className="flex gap-2">
          <Input
            id="code"
            placeholder="收到的 6 位验证码"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            maxLength={6}
          />
          <Button onClick={handleVerify} disabled={verifying || code.length !== 6 || phone.length !== 11} variant="secondary">
            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            <span className="ml-1.5">校验</span>
          </Button>
        </div>

        {verifyResult && (
          verifyResult.ok ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription className="text-xs">✅ 验证通过</AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                ❌ {verifyResult.message || verifyResult.error || verifyResult.reason || '校验失败'}
              </AlertDescription>
            </Alert>
          )
        )}
      </Card>
    </div>
  );
}

async function parseFunctionError(error: any) {
  const response = error?.context;
  if (response && typeof response.clone === 'function') {
    try {
      return await response.clone().json();
    } catch {
      try {
        return { error: error.message, detail: await response.clone().text() };
      } catch {
        return { error: error.message };
      }
    }
  }
  return { error: error?.message || String(error), detail: response };
}
