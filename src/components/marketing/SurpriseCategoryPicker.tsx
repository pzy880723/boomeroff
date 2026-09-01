import { PackageSearch, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  SURPRISE_CONTENT_SCOPES,
  type SurpriseContentScopeKey,
} from '@/lib/surpriseContentScope';

export function SurpriseCategoryPicker({
  value,
  onChange,
  onStart,
  onClose,
  busy,
}: {
  value: SurpriseContentScopeKey;
  onChange: (value: SurpriseContentScopeKey) => void;
  onStart: (value: SurpriseContentScopeKey) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const selected = SURPRISE_CONTENT_SCOPES.find((scope) => scope.key === value) || SURPRISE_CONTENT_SCOPES[0];

  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
      <div className="text-center space-y-1.5">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent/10 text-accent">
          <PackageSearch className="h-5 w-5" />
        </div>
        <h3 className="text-base font-semibold">这条视频主讲什么？</h3>
        <p className="text-xs text-muted-foreground">先选商品类别，BOOMER 再按对应规则挑图、写脚本</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {SURPRISE_CONTENT_SCOPES.map((scope, index) => {
          const active = scope.key === value;
          return (
            <button
              key={scope.key}
              type="button"
              onClick={() => onChange(scope.key)}
              className={[
                'rounded-xl border px-3 py-3 text-left transition active:scale-[0.98]',
                index === 0 ? 'col-span-2' : '',
                active
                  ? 'border-accent bg-accent/10 ring-1 ring-accent/20'
                  : 'border-border bg-card hover:border-accent/40',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{scope.label}</span>
                <span className={active ? 'h-2 w-2 rounded-full bg-accent' : 'h-2 w-2 rounded-full bg-muted'} />
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{scope.hint}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        已选择「{selected.label}」。第一镜仍固定使用当前门店的真实门头，其他镜头只从本店真实素材中挑选。
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="h-11 px-4" onClick={onClose} disabled={busy}>
          <X className="mr-1 h-4 w-4" />关闭
        </Button>
        <Button className="h-11 flex-1" onClick={() => onStart(selected.key)} disabled={busy}>
          <Sparkles className="mr-1.5 h-4 w-4" />
          按「{selected.label}」开始写脚本
        </Button>
      </div>
    </div>
  );
}
