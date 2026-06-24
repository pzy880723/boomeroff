// Seedance 2.0 子版本选择器:折叠式单行 + Popover 展开三选项。
import { useState } from 'react';
import { Check, ChevronDown, Clock, Coins, Lock, Monitor, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { SEEDANCE_2_MODELS, getSeedanceModel, getSeedanceShortLabel, type SeedanceModel } from '@/lib/seedanceModels';

interface Props {
  value: string;
  onChange: (modelId: string) => void;
  className?: string;
  compact?: boolean;
}

export function SeedanceModelPicker({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const current = getSeedanceModel(value);
  const shortLabel = getSeedanceShortLabel(value);

  const handleSelect = (m: SeedanceModel) => {
    if (!m.available) {
      toast(`${m.label} ${m.available_at ? m.available_at + ' 开放' : '暂未开放'}`);
      return;
    }
    if (m.id !== value) {
      onChange(m.id);
      toast.success(`已选 ${m.label}`);
    }
    setOpen(false);
  };

  const topRes = current.resolutions[current.resolutions.length - 1];

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
            {current.recommended && <Sparkles className="w-3 h-3" />}
            <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[280px] p-1.5">
          <div className="space-y-1">
            {SEEDANCE_2_MODELS.map((m) => (
              <ModelRow
                key={m.id}
                model={m}
                selected={value === m.id}
                onSelect={() => handleSelect(m)}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <span className="text-[10px] text-muted-foreground truncate">
        最长 {current.max_duration}s · {topRes} · {current.speed}
      </span>
    </div>
  );
}

function ModelRow({
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
      className={cn(
        'w-full text-left rounded-md p-2 transition-colors border',
        selected
          ? 'border-accent bg-accent/10'
          : 'border-transparent hover:bg-muted',
        disabled && !selected && 'opacity-60',
      )}
    >
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
        <Spec icon={<Monitor className="w-2.5 h-2.5" />} v={model.resolutions.join('/')} />
        <Spec icon={<Clock className="w-2.5 h-2.5 opacity-0" />} v={`速度 ${model.speed}`} />
        <Spec icon={<Coins className="w-2.5 h-2.5" />} v={`费用 ${model.cost}`} />
      </div>
      <div className="text-[10px] text-muted-foreground/80 mt-1 leading-snug">
        适合:{model.best_for}
      </div>
    </button>
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
