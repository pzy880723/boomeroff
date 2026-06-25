// 图片放大查看器：全屏暗背景 + 支持多图左右切换 + 手势滑动
// 注意：拦截 pointerdown 冒泡，避免父级 Radix Dialog 误判为"外部点击"而被一并关闭。
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

  // 阻止 pointerdown 冒泡到 document —— Radix Dialog 用全局 pointerdown 判定外部点击
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

  return createPortal(
    <div
      ref={rootRef}
      data-lightbox-root
      className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center select-none"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button
        type="button"
        className="absolute top-3 right-3 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="关闭"
      >
        <X className="w-5 h-5" />
      </button>

      {images.length > 1 && (
        <>
          <button
            type="button"
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
            disabled={safeIdx === 0}
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            aria-label="上一张"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
            disabled={safeIdx === images.length - 1}
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            aria-label="下一张"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-xs bg-black/40 px-2 py-0.5 rounded">
            {safeIdx + 1} / {images.length}
          </div>
        </>
      )}

      <img
        src={src}
        alt=""
        className="max-w-[95vw] max-h-[90vh] object-contain pointer-events-none"
        draggable={false}
      />
    </div>,
    document.body,
  );
}
