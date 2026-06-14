// 视频画幅图形按钮组(竖版/方形/横版)
type Aspect = '9:16' | '1:1' | '16:9';

const ITEMS: { v: Aspect; label: string; w: string; h: string }[] = [
  { v: '9:16', label: '竖版', w: 'w-3', h: 'h-[22px]' },
  { v: '1:1', label: '方形', w: 'w-[18px]', h: 'h-[18px]' },
  { v: '16:9', label: '横版', w: 'w-6', h: 'h-[14px]' },
];

export function AspectPicker({ value, onChange }: { value: Aspect; onChange: (v: Aspect) => void }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">画幅</p>
      <div className="grid grid-cols-3 gap-2.5">
        {ITEMS.map((it) => {
          const active = value === it.v;
          return (
            <button
              key={it.v}
              type="button"
              onClick={() => onChange(it.v)}
              className={[
                'flex flex-col items-center gap-2 py-3 rounded-xl border-2 transition-all active:scale-[0.97]',
                active
                  ? 'bg-primary border-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted',
              ].join(' ')}
              aria-pressed={active}
            >
              <span
                className={[
                  'block border-2 rounded-[3px]',
                  it.w,
                  it.h,
                  active ? 'border-primary-foreground' : 'border-muted-foreground/50',
                ].join(' ')}
              />
              <span className="text-[11px] font-semibold whitespace-nowrap">
                {it.label} {it.v}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
