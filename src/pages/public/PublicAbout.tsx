import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Camera, Heart, Aperture } from 'lucide-react';

export default function PublicAbout() {
  return (
    <div className="container max-w-screen-md py-5 space-y-6">
      {/* Hero */}
      <section className="px-1">
        <div className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground/80">About</div>
        <h1 className="mt-2 font-display text-[28px] leading-[1.15] tracking-tight">
          每件中古好物，<br />都有一段值得被听见的故事。
        </h1>
        <p className="mt-3 text-[13.5px] text-foreground/75 leading-relaxed">
          一只昭和年代的清水烧茶碗、一台九十年代的 Walkman、一枚七十年代的玻璃胸针——
          货架上的小标签写不下它们的来历。打开相机拍一拍，AI 会替你把这些细节娓娓道来。
        </p>
      </section>

      <div className="h-px bg-border/60" />

      {/* 三步使用 */}
      <section className="space-y-4">
        <div className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground/80">How it works</div>
        <ol className="space-y-3">
          <Step n="01" title="对准物件拍一张" desc="光线充足、主体居中，让物件占满画面 2/3。" />
          <Step n="02" title="等 1-3 秒" desc="AI 给出名称、年代、产地，以及背后的小故事。" />
          <Step n="03" title="分享或继续" desc="喜欢的话一键匿名发到中古圈，或者继续拍下一件。" />
        </ol>
      </section>

      <div className="h-px bg-border/60" />

      {/* 中古圈 */}
      <section className="space-y-2">
        <div className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground/80">Community</div>
        <h2 className="font-display text-[20px] tracking-tight">关于「中古圈」</h2>
        <p className="text-[13px] text-foreground/75 leading-relaxed">
          这里汇集了顾客和店主一起拍下的中古好物，像逛市集一样滑动浏览，
          说不定你的下一件心头好就藏在其中。
        </p>
      </section>

      {/* 小提示 */}
      <section className="rounded-2xl bg-accent/8 ring-1 ring-accent/20 p-5 space-y-2">
        <div className="font-display text-sm tracking-tight">小提示</div>
        <ul className="text-[12.5px] text-foreground/80 leading-relaxed space-y-1.5">
          <li>· 有铭文 / 底款时单独补一张近照效果更好</li>
          <li>· AI 会尽力，但偶尔也会认错——欢迎多角度补拍</li>
          <li>· 完全免费，无需注册</li>
        </ul>
      </section>

      {/* 品牌卡 */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-primary text-primary-foreground p-5 shadow-elevated">
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-accent/20 blur-2xl" />
        <div className="relative space-y-2">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4" />
            <div className="text-[10px] tracking-[0.22em] uppercase opacity-80">Boomer-off</div>
          </div>
          <p className="font-display text-[18px] leading-snug tracking-tight">
            一家专注日本中古杂货的实体店
          </p>
          <p className="text-[12.5px] leading-relaxed opacity-85">
            我们相信每件旧物都值得被重新看见，也希望这个小工具能让你逛店时多一点惊喜。
          </p>
        </div>
      </section>

      <Button asChild className="w-full" size="lg">
        <Link to="/u">
          <Camera className="w-4 h-4 mr-2" /> 现在就拍一拍
        </Link>
      </Button>

      <div className="text-center pt-1 pb-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground/70 tracking-[0.2em] uppercase">
          <Aperture className="w-3 h-3" />
          BOOMER-OFF · 中古杂货
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <li className="flex gap-4 p-3 rounded-2xl bg-card/60 ring-1 ring-border/50">
      <span className="font-display text-[20px] text-accent tabular-nums shrink-0 leading-none mt-0.5">
        {n}
      </span>
      <div className="space-y-0.5">
        <div className="text-[14px] font-medium leading-tight">{title}</div>
        <div className="text-[12.5px] text-muted-foreground leading-relaxed">{desc}</div>
      </div>
    </li>
  );
}
