// 图片放大查看器：全屏暗背景 + 支持多图左右切换
import { useEffect, useState } from 'react';
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

  useEffect(() => { if (open) setIdx(initialIndex); }, [open, initialIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(images.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, images.length, onClose]);

  if (!open || images.length === 0) return null;

  const src = images[Math.max(0, Math.min(idx, images.length - 1))];

  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute top-3 right-3 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="关闭"
      >
        <X className="w-5 h-5" />
      </button>

      {images.length > 1 && (
        <>
          <button
            type="button"
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
            disabled={idx === 0}
            onClick={(e) => { e.stopPropagation(); setIdx((i) => Math.max(0, i - 1)); }}
            aria-label="上一张"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
            disabled={idx === images.length - 1}
            onClick={(e) => { e.stopPropagation(); setIdx((i) => Math.min(images.length - 1, i + 1)); }}
            aria-label="下一张"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-xs bg-black/40 px-2 py-0.5 rounded">
            {idx + 1} / {images.length}
          </div>
        </>
      )}

      <img
        src={src}
        alt=""
        className="max-w-[95vw] max-h-[90vh] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}
