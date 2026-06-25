// Seedance 2.0 子版本选择器:折叠式单行 + Popover 展开三选项,并支持分辨率切换。
import { useState } from 'react';
import { Check, ChevronDown, Clock, Coins, Lock, Monitor, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  SEEDANCE_2_MODELS, getSeedanceModel, getSeedanceShortLabel,
  ALL_RESOLUTIONS, reconcileResolution,
  type SeedanceModel, type SeedanceResolution,
} from '@/lib/seedanceModels';

interface Props {
  value: string;
  onChange: (modelId: string) => void;
  resolution?: SeedanceResolution;
  onResolutionChange?: (r: SeedanceResolution) => void;
  className?: string;
  compact?: boolean;
}

export function SeedanceModelPicker({ value, onChange, resolution, onResolutionChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const current = getSeedanceModel(value);
  const shortLabel = getSeedanceShortLabel(value);
  const effectiveRes = reconcileResolution(value, resolution);

  const handleSelectModel = (m: SeedanceModel) => {
    if (!m.available) {
      toast(`${m.label} ${m.available_at ? m.available_at + ' 开放' : '暂未开放'}`);
      return;
    }
    if (m.id !== value) {
      onChange(m.id);
      const nextRes = reconcileResolution(m.id, resolution);
      if (onResolutionChange && nextRes !== effectiveRes) onResolutionChange(nextRes);
      toast.success(`已选 ${m.label} · ${nextRes}`);
    }
  };

  const handleSelectRes = (m: SeedanceModel, r: SeedanceResolution) => {
    if (!m.resolutions.includes(r)) {
      toast(`${m.label} 不支持 ${r},请切换到 Pro`);
      return;
    }
    // 切档时若当前模型不是这张卡,顺手切过去
    if (m.id !== value) onChange(m.id);
    onResolutionChange?.(r);
    toast.success(`已切到 ${r}`);
  };

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      <span className="text-xs font-semibold text-foreground/85 shrink-0">渲染模型</span>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full',
              'border-2 border-accent bg-accent/10 text-accent text-xs font-semibold',
              'hover:bg-accent/15 transition-colors',
            )}
          >
            <Check className="w-3 h-3" />
            <span>{shortLabel}</span>
            <span className="px-1 py-px rounded bg-accent/15 text-[10px]">{effectiveRes}</span>
            {current.recommended && <Sparkles className="w-3 h-3" />}
            <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[300px] p-1.5">
          <div className="space-y-1">
            {SEEDANCE_2_MODELS.map((m) => (
              <ModelRow
                key={m.id}
                model={m}
                selected={value === m.id}
                currentRes={value === m.id ? effectiveRes : undefined}
                onSelect={() => handleSelectModel(m)}
                onSelectRes={(r) => handleSelectRes(m, r)}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <span className="text-[10px] text-muted-foreground truncate">
        最长 {current.max_duration}s · {effectiveRes} · {current.speed}
      </span>
    </div>
  );
}

function ModelRow({
  model, selected, currentRes, onSelect, onSelectRes,
}: {
  model: SeedanceModel;
  selected: boolean;
  currentRes?: SeedanceResolution;
  onSelect: () => void;
  onSelectRes: (r: SeedanceResolution) => void;
}) {
  const disabled = !model.available;
  return (
    <div
      className={cn(
        'w-full rounded-md p-2 transition-colors border',
        selected ? 'border-accent bg-accent/10' : 'border-transparent hover:bg-muted',
        disabled && !selected && 'opacity-60',
      )}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-semibold truncate">{model.label}</span>
            {model.recommended && !disabled && (
              <Sparkles className="w-3 h-3 text-accent shrink-0" />
            )}
          </div>
          {selected ? (
            <Check className="w-4 h-4 text-accent shrink-0" />
          ) : disabled ? (
            <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
              <Lock className="w-2.5 h-2.5" />
              {model.available_at || '未开放'}
            </span>
          ) : null}
        </div>
        <div className="text-[10px] text-accent/85 mt-0.5">{model.tagline}</div>
        <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
          <Spec icon={<Clock className="w-2.5 h-2.5" />} v={`最长 ${model.max_duration}s`} />
          <Spec icon={<Monitor className="w-2.5 h-2.5" />} v={`默认 ${model.default_resolution}`} />
          <Spec icon={<Clock className="w-2.5 h-2.5 opacity-0" />} v={`速度 ${model.speed}`} />
          <Spec icon={<Coins className="w-2.5 h-2.5" />} v={`费用 ${model.cost}`} />
        </div>
        <div className="text-[10px] text-muted-foreground/80 mt-1 leading-snug">
          适合:{model.best_for}
        </div>
      </button>

      {!disabled && (
        <div className="mt-2 flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground shrink-0">分辨率</span>
          {ALL_RESOLUTIONS.map((r) => {
            const supported = model.resolutions.includes(r);
            const active = selected && currentRes === r;
            return (
              <button
                key={r}
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelectRes(r); }}
                className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                  active
                    ? 'border-accent bg-accent text-accent-foreground font-semibold'
                    : supported
                      ? 'border-border bg-background hover:bg-muted'
                      : 'border-dashed border-border bg-muted/40 text-muted-foreground/60',
                )}
                title={supported ? `切换到 ${r}` : `${model.label} 不支持 ${r}`}
              >
                {r}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Spec({ icon, v }: { icon: React.ReactNode; v: string }) {
  return (
    <div className="flex items-center gap-1 min-w-0">
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{v}</span>
    </div>
  );
}
