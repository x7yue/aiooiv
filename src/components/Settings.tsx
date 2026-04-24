import { useState, useEffect, useRef } from 'react';
import { useSettingsStore } from '../stores/settings';

export function Settings() {
  const { base_url, api_key, loaded, saveSettings } = useSettingsStore();
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (loaded) {
      setUrl(base_url);
      setKey(api_key);
    }
  }, [loaded, base_url, api_key]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) {
        window.clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await saveSettings(url, key);
      setSaved(true);
      if (savedTimerRef.current !== null) {
        window.clearTimeout(savedTimerRef.current);
      }
      savedTimerRef.current = window.setTimeout(() => {
        setSaved(false);
        savedTimerRef.current = null;
      }, 2000);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="settings-skeleton">
        <div className="h-4 w-24 rounded bg-white/5 animate-pulse" />
        <div className="h-9 w-full rounded-lg bg-white/5 animate-pulse mt-2" />
        <div className="h-4 w-16 rounded bg-white/5 animate-pulse mt-4" />
        <div className="h-9 w-full rounded-lg bg-white/5 animate-pulse mt-2" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="settings-url" className="text-xs font-medium tracking-wide uppercase text-[var(--c-text-muted)]">
          接口地址
        </label>
        <input
          id="settings-url"
          name="base_url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="例如：https://api.openai.com/v1"
          autoComplete="url"
          inputMode="url"
          spellCheck={false}
          className="field-input"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="settings-key" className="text-xs font-medium tracking-wide uppercase text-[var(--c-text-muted)]">
          API 密钥
        </label>
        <div className="relative">
          <input
            id="settings-key"
            name="api_key"
            type={showKey ? 'text' : 'password'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-…"
            autoComplete="off"
            spellCheck={false}
            className="field-input pr-10"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--c-text-muted)] hover:text-[var(--c-text)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-accent)]"
            aria-label={showKey ? '隐藏 API 密钥' : '显示 API 密钥'}
          >
            {showKey ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary mt-1"
        aria-live="polite"
      >
        {saving ? (
          <span className="flex items-center justify-center gap-2">
            <SpinnerIcon />
            保存中…
          </span>
        ) : saved ? (
          <span className="flex items-center justify-center gap-2">
            <CheckIcon />
            已保存
          </span>
        ) : (
          '保存设置'
        )}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" opacity="0.3" />
      <path d="M12 2v4" strokeWidth="3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
