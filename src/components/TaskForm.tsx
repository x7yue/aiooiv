import { useCallback, useRef, useState } from 'react';
import { useTasksStore } from '../stores/tasks';

type TaskMode = 'generate' | 'edit';
type FormErrors = Partial<Record<'prompt' | 'sourceImage' | 'submit', string>>;

const SIZES = ['1024x1024', '1024x1536', '1536x1024', 'auto'] as const;
const QUALITIES = ['low', 'medium', 'high'] as const;
const COUNTS = [1, 2, 3, 4] as const;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

const SIZE_LABELS: Record<(typeof SIZES)[number], string> = {
  '1024x1024': '1024x1024',
  '1024x1536': '1024x1536',
  '1536x1024': '1536x1024',
  auto: '自动',
};

const QUALITY_LABELS: Record<(typeof QUALITIES)[number], string> = {
  low: '低',
  medium: '中',
  high: '高',
};

export function TaskForm() {
  const createTask = useTasksStore((s) => s.createTask);

  const [mode, setMode] = useState<TaskMode>('generate');
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<string>('1024x1024');
  const [quality, setQuality] = useState<string>('medium');
  const [n, setN] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  const clearError = (field: keyof FormErrors) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const clearImage = useCallback(() => {
    setImageBase64(null);
    setImageMimeType(null);
    setImagePreview(null);
    setImageName(null);
    clearError('sourceImage');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const validateFile = (file: File): string | null => {
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type as (typeof SUPPORTED_IMAGE_TYPES)[number])) {
      return '请使用 PNG、JPG 或 WebP 图片。';
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return '图片大小不能超过 12 MB。';
    }

    return null;
  };

  const handleFile = useCallback((file: File) => {
    const fileError = validateFile(file);
    if (fileError) {
      setErrors((current) => ({ ...current, sourceImage: fileError }));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setErrors((current) => ({ ...current, sourceImage: '无法读取这张图片，请换一张重试。' }));
        return;
      }

      const [, base64] = reader.result.split(',');
      if (!base64) {
        setErrors((current) => ({ ...current, sourceImage: '无法准备这张图片用于编辑。' }));
        return;
      }

      setImagePreview(reader.result);
      setImageBase64(base64);
      setImageMimeType(file.type);
      setImageName(file.name);
      setErrors((current) => {
        const next = { ...current };
        delete next.sourceImage;
        return next;
      });
    };
    reader.onerror = () => {
      setErrors((current) => ({ ...current, sourceImage: '无法读取这张图片，请换一张重试。' }));
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      const file = event.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const validateForm = (): boolean => {
    const nextErrors: FormErrors = {};

    if (!prompt.trim()) {
      nextErrors.prompt = '请先描述你想生成的图像。';
    }

    if (mode === 'edit' && !imageBase64) {
      nextErrors.sourceImage = '创建图生图任务前，请先添加源图片。';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submitTask = async () => {
    if (submittingRef.current) return;
    if (!validateForm()) return;

    submittingRef.current = true;
    setSubmitting(true);
    setErrors((current) => {
      const next = { ...current };
      delete next.submit;
      return next;
    });

    try {
      await createTask(
        prompt.trim(),
        mode,
        { size, quality, n },
        mode === 'edit' ? imageBase64 ?? undefined : undefined,
        mode === 'edit' ? imageMimeType ?? undefined : undefined,
      );
      setPrompt('');
      setErrors({});
      if (mode === 'edit') clearImage();
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法创建任务，请检查设置后重试。';
      setErrors((current) => ({ ...current, submit: message }));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await submitTask();
  };

  const handlePromptKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void submitTask();
    }
  };

  const switchMode = (nextMode: TaskMode) => {
    setMode(nextMode);
    setErrors({});
  };

  const promptLength = prompt.trim().length;

  return (
    <form onSubmit={handleSubmit} className={`task-form-grid ${mode === 'edit' ? 'is-edit' : 'is-generate'}`} noValidate>
      <div className="mode-toggle task-form-mode" role="group" aria-label="任务模式">
        <button
          type="button"
          className={`mode-toggle-btn ${mode === 'generate' ? 'active' : ''}`}
          onClick={() => switchMode('generate')}
          aria-pressed={mode === 'generate'}
        >
          <GenerateIcon />
          文生图
        </button>
        <button
          type="button"
          className={`mode-toggle-btn ${mode === 'edit' ? 'active' : ''}`}
          onClick={() => switchMode('edit')}
          aria-pressed={mode === 'edit'}
        >
          <EditIcon />
          图生图
        </button>
      </div>

      {mode === 'edit' && (
        <div className="task-form-source">
          <div className="field-row-label">
            <label id="source-image-label" className="field-label">
              源图片
            </label>
              <span className="field-hint">PNG / JPG / WebP · 最大 12 MB</span>
          </div>
          {imagePreview ? (
            <div className="source-image-preview">
              <img
                src={imagePreview}
                alt="用于图生图编辑的源图片"
                width={328}
                height={160}
                className="w-full h-40 object-cover rounded-lg border border-[var(--c-border)]"
              />
              <div className="source-image-meta">
                <span title={imageName ?? undefined}>{imageName ?? '源图片已就绪'}</span>
                <button type="button" onClick={clearImage} aria-label="移除源图片">
                  <CloseIcon size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`upload-zone ${dragOver ? 'drag-over' : ''} ${errors.sourceImage ? 'field-invalid' : ''}`}
              role="button"
              tabIndex={0}
              aria-labelledby="source-image-label"
              aria-describedby={errors.sourceImage ? 'source-image-help source-image-error' : 'source-image-help'}
              aria-invalid={Boolean(errors.sourceImage)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
            >
              <UploadIcon />
              <span className="text-sm text-[var(--c-text-muted)]">
                拖入图片，或点击选择文件
              </span>
              <span id="source-image-help" className="text-[11px] text-[var(--c-text-muted)] opacity-80">
                使用清晰的源图片可以获得更好的编辑效果。
              </span>
            </div>
          )}
          <input
            ref={fileInputRef}
            name="sourceImage"
            type="file"
            accept={SUPPORTED_IMAGE_TYPES.join(',')}
            onChange={handleFileSelect}
            className="hidden"
            aria-label="上传源图片"
          />
          {errors.sourceImage && (
            <p id="source-image-error" className="field-error" role="alert">
              {errors.sourceImage}
            </p>
          )}
        </div>
      )}

      <div className="task-form-prompt">
        <div className="field-row-label">
          <label htmlFor="task-prompt" className="field-label">
            提示词
          </label>
          <span className="field-hint">快捷键：Ctrl/Cmd + Enter</span>
        </div>
        <textarea
          id="task-prompt"
          value={prompt}
          name="prompt"
          onChange={(event) => {
            setPrompt(event.target.value);
            clearError('prompt');
          }}
          onKeyDown={handlePromptKeyDown}
          placeholder={mode === 'generate' ? '描述你想生成的图像…' : '描述你想对图片做出的修改…'}
          spellCheck={true}
          rows={4}
          className={`field-input prompt-input ${errors.prompt ? 'field-invalid' : ''}`}
          aria-invalid={Boolean(errors.prompt)}
          aria-describedby={errors.prompt ? 'task-prompt-help task-prompt-error' : 'task-prompt-help'}
        />
        <div id="task-prompt-help" className="prompt-meta-row">
          <span>建议写清主体、风格、光线和构图。</span>
          <span>{promptLength} 字</span>
        </div>
        {errors.prompt && (
          <p id="task-prompt-error" className="field-error" role="alert">
            {errors.prompt}
          </p>
        )}
      </div>

      <div className="task-form-controls">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="task-size" className="field-label">
            尺寸
          </label>
          <select id="task-size" name="size" value={size} onChange={(event) => setSize(event.target.value)} className="field-select">
            {SIZES.map((s) => (
              <option key={s} value={s}>{SIZE_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="task-quality" className="field-label">
            质量
          </label>
          <select id="task-quality" name="quality" value={quality} onChange={(event) => setQuality(event.target.value)} className="field-select">
            {QUALITIES.map((q) => (
              <option key={q} value={q}>{QUALITY_LABELS[q]}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="task-n" className="field-label">
            数量
          </label>
          <select id="task-n" name="n" value={n} onChange={(event) => setN(Number(event.target.value))} className="field-select">
            {COUNTS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {errors.submit && (
        <p className="field-error submit-error" role="alert">
          {errors.submit}
        </p>
      )}

      <button type="submit" disabled={submitting} className="btn-primary task-form-submit" title="快捷键：Ctrl/Cmd + Enter">
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <SpinnerIcon />
            创建中…
          </span>
        ) : mode === 'generate' ? (
          <span className="flex items-center justify-center gap-2">
            <GenerateIcon />
            开始生成
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <EditIcon />
            编辑图片
          </span>
        )}
      </button>
    </form>
  );
}

function GenerateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--c-text-muted)]" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
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
