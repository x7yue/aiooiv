import { useEffect, useRef } from 'react';
import { Settings } from './Settings';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
        ),
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
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="settings-dialog-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className="settings-dialog-panel"
        role="dialog"
        aria-labelledby="settings-dialog-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-dialog-header">
          <h2 id="settings-dialog-title" className="text-sm font-semibold tracking-tight text-[var(--c-text)]">设置</h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="settings-dialog-close"
            aria-label="关闭设置"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="settings-dialog-body">
          <Settings />
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
