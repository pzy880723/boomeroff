import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Aperture, Lightbulb, Camera, Layers, FileText, Share2 } from 'lucide-react';
import { CameraStage, type CameraStageHandle } from '@/components/recognition/CameraStage';
import { useGuestRecognition } from '@/hooks/useGuestRecognition';
import { GuestOnboarding, type OnboardStep } from '@/components/public/GuestOnboarding';

const ONBOARD_STEPS: OnboardStep[] = [
  {
    targetId: 'onboard-start-camera',
    title: '对准它，按下快门',
    desc: '让物件占满画面 2/3，AI 1-3 秒读懂年代、产地与小故事。',
    placement: 'top',
    shape: 'pill',
    icon: Camera,
  },
  {
    targetId: 'onboard-multi-mode',
    title: '复杂物件，多拍几张更准',
    desc: '切到「多角度合并」最多 5 张，正面、底款、铭牌一起送 AI 综合判断。',
    placement: 'bottom',
    shape: 'pill',
    icon: Layers,
  },
  {
    title: '识别完，自动写好种草文',
    desc: '小红书 / 朋友圈 / 微信三种风格随便切，复制即用，朋友秒懂这件好在哪。',
    icon: FileText,
  },
  {
    title: '让更多人看见你的发现',
    desc: '一键以「游客」身份匿名发布到中古圈，不需要登录、不留账号。',
    icon: Share2,
  },
];

export default function PublicScan() {
  const navigate = useNavigate();
  const { recognize, remaining } = useGuestRecognition();
  const stageRef = useRef<CameraStageHandle>(null);
  const [showOnboarding, setShowOnboarding] = useState(
    () => typeof window !== 'undefined' && !sessionStorage.getItem('guest_onboarding_shown_v1'),
  );

  const handleRecognize = async (images: string[]): Promise<boolean> => {
    const r = await recognize(images.length > 1 ? images : images[0]);
    if (!r) return false;
    sessionStorage.setItem('guest_result', JSON.stringify(r));
    sessionStorage.setItem('guest_result_image', images[0]);
    navigate('/u/result');
    return true;
  };

  return (
    <div className="container max-w-screen-md py-4 space-y-5">
      {/* 编辑式头图 */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-primary text-primary-foreground shadow-elevated">
        <div className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 80% 60%, white 1px, transparent 1px)',
            backgroundSize: '32px 32px, 28px 28px',
          }}
        />
        <div className="relative px-5 py-6 sm:px-6 sm:py-7">
          <div className="flex items-center gap-1.5 text-[10px] tracking-[0.22em] uppercase opacity-80">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            AI 在线 · 1-3 秒识别
          </div>
          <h1 className="mt-3 font-display text-[26px] sm:text-[30px] leading-[1.15] tracking-tight">
            拍一拍，<br className="sm:hidden" />读懂这件中古
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed opacity-85 max-w-[26rem]">
            不知道这是什么？对准它按下快门，AI 会告诉你它的年代、产地与背后的小故事。
          </p>
          {typeof remaining === 'number' && (
            <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur text-[11px] tabular-nums ring-1 ring-white/20">
              <Sparkles className="w-3 h-3" />
              今日剩余 {remaining} 次免费识别
            </div>
          )}
        </div>
      </section>

      <CameraStage ref={stageRef} onRecognize={handleRecognize} keepPreviewAfterSuccess={false} />

      {/* 拍摄小贴士 */}
      <section className="mx-3 sm:mx-4 rounded-2xl bg-card/60 ring-1 ring-border/60 backdrop-blur p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-accent/15 text-accent flex items-center justify-center">
            <Lightbulb className="w-4 h-4" strokeWidth={2} />
          </span>
          <div className="font-display text-sm tracking-tight">拍出更好的识别效果</div>
        </div>
        <ul className="text-[12.5px] text-muted-foreground space-y-2 leading-relaxed">
          <Tip n="01">让物件占满画面 2/3，背景越简单越准</Tip>
          <Tip n="02">有铭文 / 底款时单独补一张近照</Tip>
          <Tip n="03">识别完可一键匿名分享到「中古圈」</Tip>
        </ul>
      </section>

      {/* 品牌底栏 */}
      <div className="text-center pt-1 pb-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground/70 tracking-[0.2em] uppercase">
          <Aperture className="w-3 h-3" />
          BOOMER-OFF · 中古杂货
        </div>
      </div>

      {showOnboarding && (
        <GuestOnboarding
          steps={ONBOARD_STEPS}
          onDone={() => {
            sessionStorage.setItem('guest_onboarding_shown_v1', '1');
            setShowOnboarding(false);
          }}
        />
      )}
    </div>
  );
}

// keep tail intact below

function Tip({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="font-display text-[11px] text-accent tabular-nums shrink-0 mt-px">{n}</span>
      <span>{children}</span>
    </li>
  );
}
