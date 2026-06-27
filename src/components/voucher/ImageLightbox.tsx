// 通用图片放大查看器
// 设计要点(2025-06 重做):
// - 关闭按钮做大,放右上 + 底部各一个,手指好点中
// - 图片留出 ≥56px 四周空白,点空白也能退出
// - 左右大箭头 + 触摸滑动 + 键盘 ← → / Esc
// - portal 到 body + 拦截 pointerdown 冒泡,避免 Radix Dialog 被一并关闭
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export function ImageLightbox({
  open, onClose, images, initialIndex = 0,
}: {
  open: boolean;
  onClose: () => void;
  images: string[];
  initialIndex?: number;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => { if (open) setIdx(initialIndex); }, [open, initialIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(images.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, images.length, onClose]);

  // 拦截 pointerdown 冒泡,Radix Dialog 用全局 pointerdown 判定外部点击
  useEffect(() => {
    if (!open) return;
    const el = rootRef.current;
    if (!el) return;
    const stop = (e: Event) => { e.stopPropagation(); };
    el.addEventListener('pointerdown', stop, true);
    el.addEventListener('pointerup', stop, true);
    el.addEventListener('mousedown', stop, true);
    el.addEventListener('touchstart', stop, true);
    return () => {
      el.removeEventListener('pointerdown', stop, true);
      el.removeEventListener('pointerup', stop, true);
      el.removeEventListener('mousedown', stop, true);
      el.removeEventListener('touchstart', stop, true);
    };
  }, [open]);

  if (!open || images.length === 0) return null;

  const safeIdx = Math.max(0, Math.min(idx, images.length - 1));
  const src = images[safeIdx];
  const goPrev = () => setIdx((i) => Math.max(0, i - 1));
  const goNext = () => setIdx((i) => Math.min(images.length - 1, i + 1));

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null || touchStartY.current == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX.current;
    const dy = t.clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goNext(); else goPrev();
    }
  };

  const stop = (e: React.MouseEvent | React.TouchEvent) => e.stopPropagation();

  return createPortal(
    <div
      ref={rootRef}
      data-lightbox-root
      className="fixed inset-0 z-[200] bg-black/92 select-none"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 12px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
      }}
    >
      {/* 顶部条:页码 + 关闭(大按钮) */}
      <div
        className="absolute top-0 inset-x-0 flex items-center justify-between px-3 pt-3 pointer-events-none"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        {images.length > 1 ? (
          <div
            className="pointer-events-auto text-white/90 text-[12px] bg-black/55 backdrop-blur px-3 py-1.5 rounded-full"
            onClick={stop}
          >
            {safeIdx + 1} / {images.length}
          </div>
        ) : <div />}
        <button
          type="button"
          className="pointer-events-auto w-12 h-12 rounded-full bg-white text-black shadow-xl flex items-center justify-center active:scale-95 transition-transform"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          aria-label="关闭"
        >
          <X className="w-6 h-6" strokeWidth={2.5} />
        </button>
      </div>

      {/* 左右大箭头 */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/15 backdrop-blur text-white hover:bg-white/25 active:scale-95 disabled:opacity-25 flex items-center justify-center"
            disabled={safeIdx === 0}
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            aria-label="上一张"
          >
            <ChevronLeft className="w-7 h-7" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/15 backdrop-blur text-white hover:bg-white/25 active:scale-95 disabled:opacity-25 flex items-center justify-center"
            disabled={safeIdx === images.length - 1}
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            aria-label="下一张"
          >
            <ChevronRight className="w-7 h-7" strokeWidth={2.5} />
          </button>
        </>
      )}

      {/* 居中图片,留出空白便于"点空白关闭" */}
      <div className="absolute inset-0 flex items-center justify-center px-14 py-20">
        <img
          src={src}
          alt=""
          className="max-w-full max-h-full object-contain pointer-events-none"
          draggable={false}
        />
      </div>

      {/* 底部:圆点 + 关闭胶囊 */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 pb-3 pointer-events-none"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 14px)' }}
      >
        {images.length > 1 && images.length <= 12 && (
          <div className="pointer-events-auto flex gap-1.5 bg-black/45 backdrop-blur px-2.5 py-1.5 rounded-full" onClick={stop}>
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                className={[
                  'w-1.5 h-1.5 rounded-full transition-all',
                  i === safeIdx ? 'bg-white w-4' : 'bg-white/45',
                ].join(' ')}
                aria-label={`第 ${i + 1} 张`}
              />
            ))}
          </div>
        )}
        <button
          type="button"
          className="pointer-events-auto px-5 py-2 rounded-full bg-white/95 text-black text-[13px] font-medium shadow-xl active:scale-95"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
          关闭
        </button>
      </div>
    </div>,
    document.body,
  );
}
