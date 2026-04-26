import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { Task } from '../lib/commands';

interface ImagePreviewProps {
  task: Task;
  onUseAsReference?: (path: string, index: number) => void;
  onClose: () => void;
}

export function ImagePreview({ task, onUseAsReference, onClose }: ImagePreviewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const images = useMemo(() => {
    if (!task.result_paths) return [];
    try {
      const paths: string[] = JSON.parse(task.result_paths);
      return paths.map((p) => ({ path: p, src: convertFileSrc(p) }));
    } catch {
      return [];
    }
  }, [task.result_paths]);

  const hasMultiple = images.length > 1;

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % images.length);
  }, [images.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    closeButtonRef.current?.focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && hasMultiple) goNext();
      if (e.key === 'ArrowLeft' && hasMultiple) goPrev();
      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;

        const focusable = Array.from(
          panel.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])'),
        ).filter((element) => !element.hasAttribute('disabled'));

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, hasMultiple, goNext, goPrev]);

  if (images.length === 0) return null;

  const current = images[currentIndex];

  return (
    <div
      className="preview-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Content */}
      <div
        ref={panelRef}
        className="relative z-10 flex flex-col items-center gap-4 max-w-[90vw] max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          ref={closeButtonRef}
          onClick={onClose}
          className="absolute -top-2 -right-2 z-20 p-2 rounded-full bg-[var(--c-surface-2)] text-[var(--c-text-muted)] hover:text-[var(--c-text)] hover:bg-[var(--c-surface-3)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-accent)]"
          aria-label="关闭预览"
        >
          <CloseIcon />
        </button>

        {/* Image */}
        <div className="relative flex items-center justify-center">
          {hasMultiple && (
            <button
              onClick={goPrev}
              className="absolute left-[-48px] p-2 rounded-full bg-[var(--c-surface-2)] text-[var(--c-text-muted)] hover:text-[var(--c-text)] hover:bg-[var(--c-surface-3)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-accent)]"
              aria-label="上一张图片"
            >
              <ChevronLeftIcon />
            </button>
          )}

          <img
            src={current.src}
            alt={`生成图片 ${currentIndex + 1}`}
            width={800}
            height={800}
            loading="eager"
            className="max-w-[80vw] max-h-[80vh] rounded-xl object-contain shadow-2xl"
          />

          {hasMultiple && (
            <button
              onClick={goNext}
              className="absolute right-[-48px] p-2 rounded-full bg-[var(--c-surface-2)] text-[var(--c-text-muted)] hover:text-[var(--c-text)] hover:bg-[var(--c-surface-3)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-accent)]"
              aria-label="下一张图片"
            >
              <ChevronRightIcon />
            </button>
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center gap-4 text-sm text-[var(--c-text-muted)]">
          {hasMultiple && (
            <span>{currentIndex + 1} / {images.length}</span>
          )}
          {onUseAsReference && (
            <button
              type="button"
              className="preview-reference-btn"
              onClick={() => onUseAsReference(current.path, currentIndex)}
            >
              <ReferenceIcon />
              用当前图作参考
            </button>
          )}
          <span className="truncate max-w-md" title={task.prompt}>{task.prompt}</span>
        </div>
      </div>
    </div>
  );
}

// ── Icons ──────────────────────────────────────────

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ReferenceIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M21 14l-4.5-4.5L9 17" />
    </svg>
  );
}
