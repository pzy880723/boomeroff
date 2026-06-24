// Seedance 2.0 子版本选择器:3 张卡片,展示画质/速度/费用差异。
import { Check, Clock, Coins, Monitor, Sparkles, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SEEDANCE_2_MODELS, type SeedanceModel } from '@/lib/seedanceModels';

interface Props {
  value: string;
  onChange: (modelId: string) => void;
  className?: string;
  compact?: boolean;
}

export function SeedanceModelPicker({ value, onChange, className, compact }: Props) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-foreground/85">渲染模型</h3>
        <span className="text-[10px] text-muted-foreground">Seedance 2.0 · 单段直出 ≤15s</span>
      </div>
      <div className={cn('grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3')}>
        {SEEDANCE_2_MODELS.map((m) => (
          <ModelCard
            key={m.id}
            model={m}
            selected={value === m.id}
            onSelect={() => m.available && onChange(m.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ModelCard({
  model,
  selected,
  onSelect,
}: {
  model: SeedanceModel;
  selected: boolean;
  onSelect: () => void;
}) {
  const disabled = !model.available;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      title={`model: ${model.id}`}
      className={cn(
        'relative text-left rounded-lg border p-2.5 transition-all',
        'flex flex-col gap-1.5',
        selected
          ? 'border-accent ring-2 ring-accent/30 bg-accent/5'
          : 'border-border bg-card hover:border-accent/50',
        disabled && 'opacity-55 cursor-not-allowed hover:border-border',
      )}
    >
      {/* 顶部:名字 + 徽章 */}
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0">
          <div className="text-xs font-semibold truncate">{model.label}</div>
          <div className="text-[10px] text-accent/85 mt-0.5 truncate">{model.tagline}</div>
        </div>
        {model.recommended && !disabled && (
          <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground font-semibold">
            <Sparkles className="w-2.5 h-2.5" />推荐
          </span>
        )}
        {disabled && (
          <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
            <Lock className="w-2.5 h-2.5" />未开放
          </span>
        )}
        {selected && !disabled && (
          <span className="shrink-0 w-4 h-4 rounded-full bg-accent text-accent-foreground inline-flex items-center justify-center">
            <Check className="w-3 h-3" />
          </span>
        )}
      </div>

      {/* 规格 */}
      <div className="space-y-1 text-[10.5px] text-foreground/80">
        <Row icon={<Clock className="w-3 h-3" />} k="最长" v={`${model.max_duration} 秒`} />
        <Row
          icon={<Monitor className="w-3 h-3" />}
          k="分辨率"
          v={model.resolutions.join(' / ')}
        />
        <Row icon={<Clock className="w-3 h-3 opacity-0" />} k="速度" v={model.speed} />
        <Row icon={<Coins className="w-3 h-3" />} k="费用" v={model.cost} />
      </div>

      {/* 适合 */}
      <div className="text-[10px] text-muted-foreground leading-snug pt-0.5 border-t border-border/60">
        {disabled && model.available_at
          ? `${model.available_at} 开放 · ${model.best_for}`
          : `适合:${model.best_for}`}
      </div>
    </button>
  );
}

function Row({ icon, k, v }: { icon: React.ReactNode; k: string; v: string }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-muted-foreground shrink-0 w-10">{k}</span>
      <span className="truncate">{v}</span>
    </div>
  );
}
