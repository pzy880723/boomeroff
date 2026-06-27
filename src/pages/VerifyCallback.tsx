// 火山真人认证 H5 完成后的回跳页:
// URL 形如 /verify-callback?bytedToken=xxx&resultCode=10000&...
// 这里只是友好提示用户回到 App,真正的入库由 App 内点「我已完成」触发
export default function VerifyCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('resultCode');
  const ok = code === '10000';
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4 bg-card border border-border rounded-xl p-6 shadow-sm">
        <div className={['w-14 h-14 rounded-full flex items-center justify-center mx-auto text-2xl',
          ok ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600'].join(' ')}>
          {ok ? '✓' : '!'}
        </div>
        <h1 className="text-lg font-semibold">
          {ok ? '真人认证完成' : '认证未通过'}
        </h1>
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          {ok
            ? '请回到 App，点击「我已完成，开始入库」完成最后一步。'
            : '请回到 App 重新扫码,或更换光线 / 角度后再试一次。'}
        </p>
        {!ok && code && (
          <p className="text-[10px] text-muted-foreground">错误码: {code}</p>
        )}
      </div>
    </div>
  );
}
