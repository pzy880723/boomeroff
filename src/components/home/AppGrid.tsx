import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext, PointerSensor, TouchSensor, useSensor, useSensors, closestCorners,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, arrayMove, rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, Plus, X, Pencil, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_ICON_REGISTRY, ALL_APP_IDS, type AppIconMeta } from './appIconRegistry';
import { readAppPref, writeAppPref } from '@/lib/homeAppsPref';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

/** 长按 ~450ms 进入编辑模式 */
function useLongPress(cb: () => void, ms = 450) {
  const [t, setT] = useState<ReturnType<typeof setTimeout> | null>(null);
  return {
    onPointerDown: () => setT(setTimeout(cb, ms)),
    onPointerUp: () => { if (t) { clearTimeout(t); setT(null); } },
    onPointerLeave: () => { if (t) { clearTimeout(t); setT(null); } },
    onPointerCancel: () => { if (t) { clearTimeout(t); setT(null); } },
  };
}

/** 品牌红瓷 squircle tile —— 扁平纯色。 */
function TileFace({ meta, dragging }: { meta: AppIconMeta; dragging?: boolean }) {
  const { Icon } = meta;
  return (
    <span
      className={cn(
        'relative w-[54px] h-[54px] rounded-[26%] flex items-center justify-center',
        'bg-primary shadow-[0_4px_10px_-6px_rgba(0,0,0,0.25)]',
        'transition-transform duration-150',
        dragging && 'scale-[1.08] shadow-[0_20px_30px_-12px_rgba(0,0,0,0.4)]',
      )}
    >
      <Icon className="relative w-[26px] h-[26px] text-white" />
    </span>
  );
}


interface TileProps {
  id: string;
  editing: boolean;
  onHide: () => void;
  onEnterEdit: () => void;
}

function SortableTile({ id, editing, onHide, onEnterEdit }: TileProps) {
  const meta = APP_ICON_REGISTRY[id];
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({
    id,
    disabled: !editing,
    animateLayoutChanges: () => true,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    // 空闲时也保留过渡,让邻居"让位/回位"都有动画
    transition: transition ?? 'transform 220ms cubic-bezier(0.2, 0, 0, 1)',
    willChange: 'transform',
    zIndex: isDragging ? 30 : undefined,
  };
  const longPress = useLongPress(onEnterEdit);
  if (!meta) return null;
  const { label, to } = meta;

  const content = (
    <>
      <TileFace meta={meta} dragging={isDragging} />
      <span className="text-[11px] font-medium text-foreground text-center leading-tight mt-1.5">{label}</span>
    </>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative flex flex-col items-center py-1 select-none touch-none',
        editing && !isDragging && 'wiggle-edit',
      )}
      {...attributes}
      {...(editing ? listeners : {})}
    >
      {editing && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onHide(); }}
          className="absolute -top-1 -right-0.5 z-20 w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center shadow"
          aria-label="隐藏"
        >
          <X className="w-3 h-3" strokeWidth={3} />
        </button>
      )}
      {editing ? (
        <div className="flex flex-col items-center">{content}</div>
      ) : (
        <Link to={to} className="flex flex-col items-center" {...longPress}>{content}</Link>
      )}
    </div>
  );
}

export function AppGrid() {
  const [pref, setPref] = useState(() => readAppPref());
  const [editing, setEditing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
  );

  useEffect(() => { writeAppPref(pref); }, [pref]);

  const visible = useMemo(
    () => pref.order.filter((id) => !pref.hidden.includes(id) && APP_ICON_REGISTRY[id]),
    [pref],
  );
  const hiddenIds = ALL_APP_IDS.filter((id) => !pref.order.includes(id) || pref.hidden.includes(id));

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = visible.indexOf(String(active.id));
    const newIdx = visible.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    const newVisible = arrayMove(visible, oldIdx, newIdx);
    const hiddenFromOrder = pref.order.filter((id) => pref.hidden.includes(id));
    setPref({ ...pref, order: [...newVisible, ...hiddenFromOrder] });
  };
  const onDragCancel = () => setActiveId(null);

  const hide = (id: string) =>
    setPref({ ...pref, hidden: [...new Set([...pref.hidden, id])] });

  const showBack = (id: string) => {
    const hidden = pref.hidden.filter((h) => h !== id);
    const order = pref.order.includes(id) ? pref.order : [...pref.order, id];
    setPref({ hidden, order });
  };

  return (
    <section>
      <div className="flex items-center justify-between px-1 mb-1.5 min-h-[28px]">
        <h2 className="text-sm font-bold flex items-center gap-1.5">
          <LayoutGrid className="w-4 h-4 text-primary" /> 我的应用
        </h2>
        {editing ? (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-primary" onClick={() => setEditing(false)}>
            <Check className="w-3.5 h-3.5 mr-1" />完成
          </Button>
        ) : (
          <button
            type="button"
            aria-label="编辑图标"
            className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            onClick={() => setEditing(true)}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <SortableContext items={visible} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-4 gap-y-3 gap-x-2 overscroll-contain">
            {visible.map((id) => (
              <SortableTile
                key={id}
                id={id}
                editing={editing}
                onHide={() => hide(id)}
                onEnterEdit={() => setEditing(true)}
              />
            ))}
            {editing && (
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                  <button className="flex flex-col items-center py-1">
                    <span className="w-[54px] h-[54px] rounded-[26%] flex items-center justify-center border border-dashed border-primary/40 text-primary bg-primary/5">
                      <Plus className="w-5 h-5" />
                    </span>
                    <span className="text-[11px] font-medium text-muted-foreground mt-1.5">添加</span>
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="rounded-t-2xl">
                  <SheetHeader className="text-left"><SheetTitle>添加到首页</SheetTitle></SheetHeader>
                  <div className="grid grid-cols-4 gap-3 mt-4">
                    {hiddenIds.map((id) => {
                      const meta = APP_ICON_REGISTRY[id];
                      if (!meta) return null;
                      return (
                        <button
                          key={id}
                          className="flex flex-col items-center py-2"
                          onClick={() => { showBack(id); }}
                        >
                          <TileFace meta={meta} />
                          <span className="text-[11px] mt-1.5">{meta.label}</span>
                        </button>
                      );
                    })}
                    {!hiddenIds.length && (
                      <p className="col-span-4 text-xs text-muted-foreground text-center py-4">全部图标都已在首页 🎉</p>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}
