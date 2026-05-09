import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Crown, Info } from 'lucide-react';
import { getLevelInfo, EXP_RULES, LEVELS } from '@/lib/level';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';

export function LevelCard({ totalExp }: { totalExp: number }) {
  const info = getLevelInfo(totalExp);
  const [open, setOpen] = useState(false);

  return (
    <Card className="p-4 bg-gradient-primary text-primary-foreground relative overflow-hidden">
      <div className="absolute -right-4 -top-4 opacity-10">
        <Crown className="w-24 h-24" />
      </div>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <button
            type="button"
            aria-label="查看等级规则"
            className="w-full flex items-center justify-between mb-2 text-left cursor-pointer rounded-md -mx-1 px-1 py-1 hover:bg-primary-foreground/10 active:bg-primary-foreground/15 transition-colors"
          >
            <span className="flex items-center gap-2">
              <span className="text-base font-semibold">Lv.{info.level} {info.title}</span>
              {info.isMax && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-foreground/20">已满级</span>
              )}
            </span>
            <span className="flex items-center gap-1.5 text-xs opacity-90 px-2 py-1 -mr-1 rounded-md bg-primary-foreground/10">
              <Info className="w-3.5 h-3.5" /> 等级规则
            </span>
          </button>
        </DrawerTrigger>
        <DrawerContent>
            <DrawerHeader><DrawerTitle>等级与经验规则</DrawerTitle></DrawerHeader>
            <div className="px-4 pb-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <p className="text-sm font-medium mb-2">10 级体系</p>
                <div className="space-y-1.5">
                  {LEVELS.map((l) => (
                    <div key={l.lv} className={`flex items-center justify-between text-sm py-1.5 px-2 rounded ${l.lv === info.level ? 'bg-primary/10 font-medium' : ''}`}>
                      <span>Lv.{l.lv} · {l.title}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{l.threshold} EXP</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">经验获取方式</p>
                <div className="space-y-1.5">
                  {EXP_RULES.map((r) => (
                    <div key={r.name} className="flex items-center justify-between text-sm py-1 px-2">
                      <span className="text-muted-foreground">{r.name}</span>
                      <span className="font-medium text-primary">{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      <div className="flex items-center justify-between text-xs opacity-90 mb-1.5">
        <span className="tabular-nums">{info.totalExp} EXP</span>
        <span className="tabular-nums">
          {info.isMax ? '已达顶峰 🏆' : `距 Lv.${info.level + 1} 还差 ${info.expForNext - info.expIntoLevel}`}
        </span>
      </div>
      <div className="h-2 bg-primary-foreground/20 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary-foreground transition-all"
          style={{ width: `${Math.min(info.progress * 100, 100)}%` }}
        />
      </div>
    </Card>
  );
}
