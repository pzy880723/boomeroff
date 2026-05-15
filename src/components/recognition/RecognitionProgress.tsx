import { useEffect, useMemo, useState } from 'react';
import { Loader2, Check, Sparkles, Zap } from 'lucide-react';

export type RecognitionPhase = 'reading' | 'matching' | 'generating' | 'done';

interface Props {
  /** 当前已知阶段(由调用方推进):reading → matching;generating 由本组件根据耗时智能判断 */
  phase: RecognitionPhase;
  /** 已用时(ms)。用于:① 计时器显示 ② 智能从 matching → generating 的转换 */
  elapsedMs: number;
  /** 完成时 __pipeline.source。若包含 cache 则压缩第三段为"命中缓存"。 */
  pipelineSource?: string;
}

interface StepDef {
  key: 'reading' | 'matching' | 'generating';
  label: string;
}

const STEPS: StepDef[] = [
  { key: 'reading', label: '正在读取这张图片' },
  { key: 'matching', label: '正在比对历史与知识库' },
  { key: 'generating', label: 'AI 正在生成文案与定价' },
];

const ORDER: Record<StepDef['key'], number> = { reading: 0, matching: 1, generating: 2 };

/**
 * 三段进度遮罩。语义对应识别管线的真实阶段:
 *   ① 读取(客户端 hash + 上传)
 *   ② 比对(edge function 内 hash_cache → name_cache)
 *   ③ 生成(走 AI 时才进入)
 *
 * 命中缓存时第 ③ 段直接被标记为"命中缓存,跳过",避免视觉跳变。
 */
export function RecognitionProgress({ phase, elapsedMs, pipelineSource }: Props) {
  // 智能升档:matching 阶段超过 1.2s 还没结果,基本是在走 AI 了 → 自动进入 generating
  const [autoBumped, setAutoBumped] = useState(false);
  useEffect(() => {
    if (phase !== 'matching') {
      setAutoBumped(false);
      return;
    }
    const id = window.setTimeout(() => setAutoBumped(true), 1200);
    return () => window.clearTimeout(id);
  }, [phase]);

  const isCacheHit = useMemo(
    () => phase === 'done' && pipelineSource ? /cache/i.test(pipelineSource) : false,
    [phase, pipelineSource],
  );

  /** 当前真正高亮的阶段索引 */
  const activeIndex = useMemo(() => {
    if (phase === 'done') return isCacheHit ? 1 : 2; // 命中缓存只到第 2 段;否则跑完第 3 段
    if (phase === 'generating') return 2;
    if (phase === 'matching') return autoBumped ? 2 : 1;
    return 0;
  }, [phase, autoBumped, isCacheHit]);

  return (
    <div className="absolute inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center animate-fade-in px-6">
      <div className="w-full max-w-[18rem] text-white">
        {/* 顶部小标 */}
        <div className="flex items-center gap-2 mb-5">
          <Loader2 className="w-4 h-4 animate-spin text-accent" strokeWidth={2} />
          <span className="text-[13px] tracking-wide font-medium">AI 正在识别</span>
          <Sparkles className="w-3.5 h-3.5 text-accent/80 animate-pulse-glow ml-auto" />
        </div>

        {/* 三段步骤 */}
        <ul className="space-y-2.5">
          {STEPS.map((step) => {
            const idx = ORDER[step.key];
            const done = phase === 'done' ? (idx <= activeIndex) : idx < activeIndex;
            const active = phase !== 'done' && idx === activeIndex;
            // 命中缓存时:第 3 段不算"完成",而是"跳过"
            const skipped = isCacheHit && idx === 2;
            const isDoneStyle = (done && !skipped) || (skipped);

            return (
              <li
                key={step.key}
                className={`flex items-center gap-2.5 text-[13px] leading-tight transition-all duration-200 ${
                  skipped
                    ? 'text-white/45'
                    : isDoneStyle
                      ? 'text-accent'
                      : active
                        ? 'text-white'
                        : 'text-white/35'
                }`}
              >
                <span
                  className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center transition-all ${
                    skipped
                      ? 'bg-white/5 ring-1 ring-white/15'
                      : isDoneStyle
                        ? 'bg-accent/15 ring-1 ring-accent/40'
                        : active
                          ? 'bg-white/10 ring-1 ring-white/30'
                          : 'ring-1 ring-white/15'
                  }`}
                >
                  {skipped ? (
                    <Zap className="w-2.5 h-2.5 text-white/55" strokeWidth={2.5} />
                  ) : isDoneStyle ? (
                    <Check className="w-2.5 h-2.5 text-accent animate-scale-in" strokeWidth={3} />
                  ) : active ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" strokeWidth={2.5} />
                  ) : null}
                </span>
                <span className="truncate">
                  {skipped ? '已命中缓存,跳过 AI' : step.label}
                  {active && <span className="inline-block ml-1 animate-pulse">···</span>}
                </span>
              </li>
            );
          })}
        </ul>

        {/* 计时器 */}
        <div className="mt-5 text-center text-[11px] text-white/45 tabular-nums">
          {(elapsedMs / 1000).toFixed(1)}s
        </div>
      </div>
    </div>
  );
}
