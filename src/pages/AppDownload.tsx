import { ArrowRight, CheckCircle2, Download, ExternalLink, ShieldCheck, Smartphone, Sparkles } from "lucide-react";

const androidApkUrl = "/downloads/boomer-go-android.apk";
const iosTestFlightUrl = "";

function InstallCard({
  label,
  title,
  description,
  action,
  href,
  disabled,
}: {
  label: string;
  title: string;
  description: string;
  action: string;
  href?: string;
  disabled?: boolean;
}) {
  const buttonClass =
    "group mt-8 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold transition sm:w-auto sm:min-w-52";

  return (
    <article className="relative overflow-hidden rounded-[2rem] border border-white/12 bg-white/[0.07] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.32em] text-[#F8D17D]">{label}</p>
          <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">{title}</h2>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#EC0000] shadow-lg">
          <Smartphone className="h-6 w-6" />
        </div>
      </div>
      <p className="mt-5 max-w-sm text-sm leading-7 text-white/68">{description}</p>
      {disabled ? (
        <button className={`${buttonClass} cursor-not-allowed bg-white/10 text-white/45`} disabled>
          {action}
          <ExternalLink className="h-4 w-4" />
        </button>
      ) : (
        <a className={`${buttonClass} bg-white text-[#1E130C] hover:-translate-y-0.5 hover:bg-[#FFF5DF]`} href={href}>
          {action}
          <Download className="h-4 w-4 transition group-hover:translate-y-0.5" />
        </a>
      )}
    </article>
  );
}

export default function AppDownload() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#130C08] text-white">
      <section className="relative isolate px-5 py-8 sm:px-8 lg:px-12">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_12%,rgba(236,0,0,0.34),transparent_33%),radial-gradient(circle_at_88%_18%,rgba(248,209,125,0.18),transparent_28%),linear-gradient(180deg,#20140D_0%,#130C08_55%,#090604_100%)]" />
        <div className="absolute left-1/2 top-10 -z-10 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full border border-white/10 bg-[#EC0000]/10 blur-3xl" />

        <nav className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#EC0000] text-sm font-black shadow-[0_12px_36px_rgba(236,0,0,0.35)]">
              GO
            </div>
            <div>
              <p className="text-sm font-black tracking-[-0.03em]">BOOMER GO</p>
              <p className="text-xs text-white/45">员工安装入口</p>
            </div>
          </div>
          <a className="hidden rounded-full border border-white/15 px-4 py-2 text-xs font-medium text-white/70 transition hover:border-white/35 hover:text-white sm:inline-flex" href="https://ai.boomeroff.com">
            返回网页版
          </a>
        </nav>

        <div className="mx-auto grid max-w-6xl items-center gap-10 pb-12 pt-16 lg:grid-cols-[1.08fr_0.92fr] lg:pb-20 lg:pt-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#F8D17D]/25 bg-[#F8D17D]/10 px-4 py-2 text-xs font-semibold text-[#FFE7A8]">
              <Sparkles className="h-3.5 w-3.5" />
              最新移动版 · iOS / Android
            </div>
            <h1 className="mt-6 max-w-3xl text-5xl font-black leading-[0.92] tracking-[-0.075em] sm:text-7xl lg:text-8xl">
              把 BOOMER GO 装进手机。
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-8 text-white/66 sm:text-lg">
              给门店和运营同事使用的移动安装页。iPhone 走 TestFlight，安卓手机直接下载安装包；打开这个页面就能拿到当前测试版本。
            </p>
            <div className="mt-8 grid gap-3 text-sm text-white/70 sm:grid-cols-3">
              {["先装 TestFlight", "安卓允许未知来源", "更新包会覆盖旧版"].map((item) => (
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3" key={item}>
                  <CheckCircle2 className="h-4 w-4 text-[#F8D17D]" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[25rem]">
            <div className="absolute -inset-6 rounded-[3rem] bg-[#EC0000]/30 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2.6rem] border border-white/15 bg-[#EC0000] p-7 shadow-[0_35px_90px_rgba(236,0,0,0.42)]">
              <div className="aspect-square rounded-[2rem] bg-[#EC0000] p-7 ring-1 ring-white/20">
                <div className="flex h-full flex-col items-center justify-center text-center text-white">
                  <p className="text-[2.35rem] font-black leading-none tracking-[-0.08em] sm:text-[2.8rem]">BOOMER</p>
                  <p className="mt-3 text-[5.8rem] font-black leading-[0.76] tracking-[-0.12em] sm:text-[7rem]">GO</p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between text-sm">
                <span className="rounded-full bg-white px-4 py-2 font-bold text-[#EC0000]">Mobile Preview</span>
                <span className="text-white/75">v1.0 · internal</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative border-t border-white/10 bg-[#0C0805] px-5 py-12 sm:px-8 lg:px-12">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-2">
          <InstallCard
            label="iPhone / iPad"
            title="iOS TestFlight"
            description="适合 iPhone 同事测试使用。等 TestFlight 邀请链接开通后，这个按钮会直接跳转到 Apple 官方 TestFlight 安装页。"
            action={iosTestFlightUrl ? "打开 TestFlight" : "等待 TestFlight 链接"}
            href={iosTestFlightUrl || undefined}
            disabled={!iosTestFlightUrl}
          />
          <InstallCard
            label="Android"
            title="安卓 APK"
            description="适合安卓同事直接安装。下载后如果系统提示风险，请选择允许来自浏览器的安装权限。"
            action="下载 Android APK"
            href={androidApkUrl}
          />
        </div>

        <div className="mx-auto mt-8 grid max-w-6xl gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[2rem] border border-[#F8D17D]/20 bg-[#F8D17D]/10 p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-[#F8D17D]" />
              <h2 className="text-lg font-black tracking-[-0.03em]">内部测试说明</h2>
            </div>
            <p className="mt-4 text-sm leading-7 text-white/62">
              这个入口只用于 BOOMER 内部测试。iOS 版本需要 TestFlight 邀请；安卓版本会直接下载测试包。
            </p>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.32em] text-white/40">Install checklist</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {[
                ["1", "选择系统", "iPhone 点 TestFlight，安卓点 APK。"],
                ["2", "完成安装", "按系统提示完成授权和下载。"],
                ["3", "登录使用", "用员工账号进入识物与知识库。"],
              ].map(([step, title, body]) => (
                <div className="rounded-2xl bg-black/22 p-4" key={step}>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-black text-[#1E130C]">{step}</span>
                  <h3 className="mt-4 font-bold">{title}</h3>
                  <p className="mt-2 text-xs leading-6 text-white/52">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <a className="mx-auto mt-10 flex w-fit items-center gap-2 text-sm font-semibold text-[#F8D17D] transition hover:text-white" href="https://ai.boomeroff.com">
          打开 BOOMER 网页版
          <ArrowRight className="h-4 w-4" />
        </a>
      </section>
    </main>
  );
}
