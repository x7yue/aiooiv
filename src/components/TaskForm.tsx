import { useCallback, useRef, useState } from 'react';
import { useCreationDraftStore, createReferenceId, MAX_REFERENCE_IMAGES, type DraftReferenceImage, type TaskMode } from '../stores/creationDraft';
import { useTasksStore } from '../stores/tasks';
import type { SourceImageInput } from '../lib/commands';

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

const SOURCE_LABELS: Record<DraftReferenceImage['source'], string> = {
  upload: '上传',
  generated: '历史',
  snapshot: '快照',
};

export function TaskForm() {
  const createTask = useTasksStore((s) => s.createTask);
  const mode = useCreationDraftStore((s) => s.mode);
  const setMode = useCreationDraftStore((s) => s.setMode);
  const referenceImages = useCreationDraftStore((s) => s.referenceImages);
  const addReferenceImages = useCreationDraftStore((s) => s.addReferenceImages);
  const removeReferenceImage = useCreationDraftStore((s) => s.removeReferenceImage);
  const clearReferenceImages = useCreationDraftStore((s) => s.clearReferenceImages);

  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<string>('1024x1024');
  const [quality, setQuality] = useState<string>('medium');
  const [n, setN] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
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

  const validateFile = (file: File): string | null => {
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type as (typeof SUPPORTED_IMAGE_TYPES)[number])) {
      return '请使用 PNG、JPG 或 WebP 图片。';
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return '图片大小不能超过 12 MB。';
    }

    return null;
  };

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      const remainingSlots = MAX_REFERENCE_IMAGES - referenceImages.length;
      if (remainingSlots <= 0) {
        setErrors((current) => ({ ...current, sourceImage: `最多只能选择 ${MAX_REFERENCE_IMAGES} 张参考图。` }));
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const selectedFiles = files.slice(0, remainingSlots);
      const rejectedMessages: string[] = [];
      const nextImages: DraftReferenceImage[] = [];

      for (const file of selectedFiles) {
        const fileError = validateFile(file);
        if (fileError) {
          rejectedMessages.push(`${file.name}: ${fileError}`);
          continue;
        }

        try {
          nextImages.push(await fileToReferenceImage(file));
        } catch {
          rejectedMessages.push(`${file.name}: 无法读取这张图片，请换一张重试。`);
        }
      }

      if (files.length > remainingSlots) {
        rejectedMessages.push(`已达到上限，只加入前 ${remainingSlots} 张图片。`);
      }

      if (nextImages.length > 0) {
        addReferenceImages(nextImages);
      }

      setErrors((current) => {
        const next = { ...current };
        if (rejectedMessages.length > 0) {
          next.sourceImage = rejectedMessages[0];
        } else {
          delete next.sourceImage;
        }
        return next;
      });

      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [addReferenceImages, referenceImages.length],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      void handleFiles(event.dataTransfer.files);
    },
    [handleFiles],
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
      if (event.target.files) void handleFiles(event.target.files);
    },
    [handleFiles],
  );

  const validateForm = (): boolean => {
    const nextErrors: FormErrors = {};

    if (!prompt.trim()) {
      nextErrors.prompt = '请先描述你想生成的图像。';
    }

    if (mode === 'edit' && referenceImages.length === 0) {
      nextErrors.sourceImage = '创建图生图任务前，请先添加至少一张参考图片。';
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
      const sourceImages = mode === 'edit' ? toSourceImageInputs(referenceImages) : undefined;
      if (mode === 'edit' && (!sourceImages || sourceImages.length === 0)) {
        throw new Error('参考图片数据不完整，请移除后重新添加。');
      }

      await createTask(
        prompt.trim(),
        mode,
        { size, quality, n },
        sourceImages,
      );
      setPrompt('');
      setErrors({});
      if (mode === 'edit') clearReferenceImages();
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
  const referenceCount = referenceImages.length;

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
              参考图片
            </label>
            <span className="field-hint">{referenceCount}/{MAX_REFERENCE_IMAGES} · PNG / JPG / WebP · 单张 12 MB</span>
          </div>

          <div className="reference-dock" aria-live="polite">
            {referenceImages.length > 0 && (
              <div className="reference-strip" aria-label="已选择的参考图片">
                {referenceImages.map((image, index) => (
                  <article key={image.id} className="reference-thumb-card">
                    <img src={image.previewUrl} alt={`参考图片 ${index + 1}: ${image.name}`} width={132} height={96} loading="lazy" />
                    <span className="reference-index">{index + 1}</span>
                    <span className={`reference-source reference-source-${image.source}`}>{SOURCE_LABELS[image.source]}</span>
                    <div className="reference-thumb-meta">
                      <span title={image.name}>{image.name}</span>
                      <button type="button" onClick={() => removeReferenceImage(image.id)} aria-label={`移除参考图片 ${image.name}`}>
                        <CloseIcon size={13} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`upload-zone reference-upload-zone ${dragOver ? 'drag-over' : ''} ${errors.sourceImage ? 'field-invalid' : ''}`}
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
              <ReferenceIcon />
              <span className="text-sm text-[var(--c-text-muted)]">
                拖入一组参考图，或点击继续添加
              </span>
              <span id="source-image-help" className="text-[11px] text-[var(--c-text-muted)] opacity-80">
                可混合使用本地图片和画廊中的生成结果。
              </span>
            </div>
          </div>

          <input
            ref={fileInputRef}
            name="sourceImage"
            type="file"
            accept={SUPPORTED_IMAGE_TYPES.join(',')}
            multiple
            onChange={handleFileSelect}
            className="hidden"
            aria-label="上传参考图片"
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
          placeholder={mode === 'generate' ? '描述你想生成的图像…' : '描述如何综合这些参考图片…'}
          spellCheck={true}
          rows={4}
          className={`field-input prompt-input ${errors.prompt ? 'field-invalid' : ''}`}
          aria-invalid={Boolean(errors.prompt)}
          aria-describedby={errors.prompt ? 'task-prompt-help task-prompt-error' : 'task-prompt-help'}
        />
        <div id="task-prompt-help" className="prompt-meta-row">
          <span>建议写清主体、风格、光线、构图，以及每张参考图的作用。</span>
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
            编辑 {referenceCount} 张参考图
          </span>
        )}
      </button>
    </form>
  );
}

async function fileToReferenceImage(file: File): Promise<DraftReferenceImage> {
  const dataUrl = await readFileAsDataUrl(file);
  const [, base64] = dataUrl.split(',');
  if (!base64) {
    throw new Error('Missing base64 data');
  }

  return {
    id: createReferenceId('upload'),
    source: 'upload',
    previewUrl: dataUrl,
    name: file.name,
    mimeType: file.type,
    base64,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unexpected FileReader result'));
      }
    };
    reader.onerror = () => reject(new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
}

function toSourceImageInputs(referenceImages: DraftReferenceImage[]): SourceImageInput[] {
  return referenceImages.flatMap((image): SourceImageInput[] => {
    if (image.base64) {
      return [{
        sourceType: 'upload',
        base64: image.base64,
        mimeType: image.mimeType,
        name: image.name,
      }];
    }

    if (image.path) {
      return [{
        sourceType: 'stored',
        path: image.path,
        name: image.name,
      }];
    }

    return [];
  });
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

function ReferenceIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--c-text-muted)]" aria-hidden="true">
      <rect x="3" y="3" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 14l-4.5-4.5L9 17" />
      <path d="M12 21h.01" />
      <path d="M17 21h.01" />
      <path d="M7 21h.01" />
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
