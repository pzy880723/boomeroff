import { Sparkles, Film, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STRATEGY_HINT, STRATEGY_LABEL, type RenderStrategy } from '@/lib/renderStrategyPref';

const OPTIONS: { v: RenderStrategy; icon: typeof Sparkles }[] = [
  { v: 'auto', icon: Sparkles },
  { v: 'one_shot', icon: Film },
  { v: 'per_shot', icon: Layers },
];

interface Props {
  value: RenderStrategy;
  onChange: (v: RenderStrategy) => void;
  className?: string;
}

export function RenderStrategyPicker({ value, onChange, className }: Props) {
  return (
    <div className={cn('rounded-xl border bg-card p-3 space-y-2', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">渲染方式</span>
        <span className="text-[10px] text-muted-foreground">
          {STRATEGY_HINT[value]}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map(({ v, icon: Icon }) => {
          const active = value === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11px] transition',
                active
                  ? 'border-accent bg-accent/10 text-accent shadow-sm'
                  : 'border-border bg-background text-muted-foreground hover:border-accent/40',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="font-medium">{STRATEGY_LABEL[v]}</span>
            </button>
          );
        })}
      </div>
      {value === 'auto' && (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          智能模式当前等同「逐镜拼接」:按分镜逐段渲染后由系统拼接成片,保证画面与分镜一致。
        </p>
      )}
      {value === 'one_shot' && (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          仅生成 9 张分镜静帧作为参考图,丢给模型一次性出片,不再逐段拼接。仅支持 ≤15s,镜头切换由模型自行安排。
        </p>
      )}
      {value === 'per_shot' && (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          每个分镜单独渲染,前端 ffmpeg 拼接成片,角色一致性最强,时长不限,适合长视频或需要逐镜替换参考图。
        </p>
      )}
    </div>
  );
}
