// 公开免登录领取页（短信落地页）：输入手机号 → 跳转到 /u/c/:short
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Ticket, AlertTriangle, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import logo from '@/assets/boomer-off-vintage-logo.png';

export default function PublicClaimByPhone() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    setErrorMsg(null);
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      toast.error('请输入正确的 11 位手机号');
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('voucher-claim-by-phone', {
      body: { phone },
    });
    setSubmitting(false);
    const errMsg = (data as any)?.error || error?.message;
    if (errMsg) {
      setErrorMsg(errMsg);
      return;
    }
    const shortCode = (data as any)?.short_code;
    if (shortCode) {
      navigate(`/u/c/${shortCode}`, { replace: true });
    } else {
      setErrorMsg('未能找到您的优惠券');
    }
  };

  // 金色光点粒子
  const particles = Array.from({ length: 8 }, (_, i) => ({
    left: `${(i * 13 + 7) % 90 + 5}%`,
    top: `${(i * 23 + 11) % 80 + 10}%`,
    delay: `${i * 0.4}s`,
    duration: `${2 + (i % 3)}s`,
    size: i % 3 === 0 ? 'w-1.5 h-1.5' : 'w-1 h-1',
  }));

  return (
    <div
      className="min-h-screen relative overflow-hidden flex items-center justify-center px-5 py-10"
      style={{ background: 'linear-gradient(160deg,#1a0f06 0%,#2a1808 60%,#3b2410 100%)' }}
    >
      {/* 背景径向光晕 */}
      <div
        className="absolute -top-32 -left-20 w-[420px] h-[420px] rounded-full blur-3xl opacity-40 animate-pulse"
        style={{ background: 'radial-gradient(circle, #f59e0b 0%, transparent 70%)', animationDuration: '5s' }}
      />
      <div
        className="absolute -bottom-32 -right-20 w-[460px] h-[460px] rounded-full blur-3xl opacity-30 animate-pulse"
        style={{ background: 'radial-gradient(circle, #fbbf24 0%, transparent 70%)', animationDuration: '7s', animationDelay: '1s' }}
      />
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[300px] h-[300px] rounded-full blur-3xl opacity-20 animate-pulse"
        style={{ background: 'radial-gradient(circle, #fcd34d 0%, transparent 70%)', animationDuration: '6s', animationDelay: '0.5s' }}
      />

      {/* 金色粒子 */}
      {particles.map((p, i) => (
        <div
          key={i}
          className={`absolute ${p.size} rounded-full bg-amber-200 opacity-60 animate-pulse pointer-events-none`}
          style={{
            left: p.left,
            top: p.top,
            animationDelay: p.delay,
            animationDuration: p.duration,
            boxShadow: '0 0 8px rgba(252,211,77,0.8)',
          }}
        />
      ))}

      <div className="relative max-w-sm w-full flex flex-col items-center">
        {/* Logo */}
        <div className="animate-fade-in" style={{ animationDuration: '0.7s' }}>
          <img
            src={logo}
            alt="BOOMER-OFF"
            className="h-14 w-auto drop-shadow-[0_0_20px_rgba(252,211,77,0.35)]"
          />
        </div>

        {/* 标题区 */}
        <div
          className="text-center mt-10 animate-fade-in"
          style={{ animationDuration: '0.7s', animationDelay: '0.15s', animationFillMode: 'both' }}
        >
          <div className="relative inline-flex items-center justify-center mb-4">
            {/* 旋转金环 */}
            <svg
              className="absolute inset-0 w-16 h-16 animate-spin"
              style={{ animationDuration: '14s' }}
              viewBox="0 0 64 64"
              fill="none"
            >
              <circle
                cx="32"
                cy="32"
                r="30"
                stroke="url(#goldRing)"
                strokeWidth="1"
                strokeDasharray="4 6"
              />
              <defs>
                <linearGradient id="goldRing" x1="0" y1="0" x2="64" y2="64">
                  <stop offset="0%" stopColor="#fcd34d" stopOpacity="0.9" />
                  <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#fcd34d" stopOpacity="0.9" />
                </linearGradient>
              </defs>
            </svg>
            <div className="w-16 h-16 flex items-center justify-center rounded-full bg-amber-400/10 backdrop-blur-sm">
              <Ticket className="w-7 h-7 text-amber-200" strokeWidth={1.5} />
            </div>
          </div>
          <h1 className="text-xl font-semibold tracking-wide bg-gradient-to-b from-amber-100 to-amber-300 bg-clip-text text-transparent">
            领取您的专属优惠券
          </h1>
          <p className="text-[12px] text-amber-200/60 mt-2">
            输入活动报名时填写的手机号即可领取
          </p>
        </div>

        {/* 卡片 */}
        <div
          className="w-full mt-7 rounded-2xl p-5 space-y-4 backdrop-blur-md border animate-fade-in"
          style={{
            background: 'rgba(252, 211, 77, 0.04)',
            borderColor: 'rgba(252, 211, 77, 0.18)',
            boxShadow: '0 10px 40px -10px rgba(0,0,0,0.6), inset 0 1px 0 rgba(252,211,77,0.08)',
            animationDuration: '0.7s',
            animationDelay: '0.3s',
            animationFillMode: 'both',
          }}
        >
          <div className="space-y-1.5">
            <label className="text-[11px] text-amber-200/70 tracking-wider uppercase">手机号</label>
            <input
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value.replace(/\D/g, '').slice(0, 11));
                setErrorMsg(null);
              }}
              inputMode="numeric"
              maxLength={11}
              placeholder="请输入 11 位手机号"
              autoFocus
              className="w-full h-11 px-3 rounded-lg bg-amber-950/30 border border-amber-200/20 text-amber-50 placeholder:text-amber-200/30 text-base tracking-wider outline-none transition focus:border-amber-300/60 focus:bg-amber-950/40 focus:ring-2 focus:ring-amber-300/20"
            />
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 text-[12px] text-amber-100 bg-red-900/30 border border-red-400/20 rounded-md p-2.5 animate-fade-in">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-200" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || phone.length !== 11}
            className="group relative w-full h-12 rounded-xl font-semibold text-[15px] overflow-hidden transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:scale-[1.02] enabled:active:scale-[0.99]"
            style={{
              background: 'linear-gradient(135deg, #fcd34d 0%, #f59e0b 50%, #d97706 100%)',
              color: '#2a1808',
              boxShadow: '0 8px 24px -6px rgba(245,158,11,0.55), inset 0 1px 0 rgba(255,255,255,0.4)',
            }}
          >
            {/* 按钮内闪光 */}
            <span
              className="absolute inset-0 -translate-x-full group-enabled:group-hover:translate-x-full transition-transform duration-700"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
              }}
            />
            <span className="relative inline-flex items-center justify-center gap-1.5">
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  正在领取...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  立即领取
                </>
              )}
            </span>
          </button>

          <p className="text-[11px] text-amber-200/40 text-center leading-relaxed">
            仅限通过审核的活动申请人领取
            <br />
            如有疑问请联系门店工作人员
          </p>
        </div>
      </div>
    </div>
  );
}
