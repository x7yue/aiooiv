import { useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useCreationDraftStore, createReferenceId, type DraftReferenceImage } from '../stores/creationDraft';
import { useTasksStore } from '../stores/tasks';
import type { SourceImageInput, Task, TaskParams } from '../lib/commands';
import { ImagePreview } from './ImagePreview';
import { TaskCard } from './tasks/TaskCard';

type TaskFilter = 'all' | Task['status'];
type ViewMode = 'list' | 'gallery';

const FILTERS: Array<{ value: TaskFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'running', label: '运行中' },
  { value: 'pending', label: '排队中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
];

const STATUS_SEARCH_LABELS: Record<Task['status'], string> = {
  pending: '排队中 等待',
  running: '运行中 生成中 进行中',
  completed: '已完成 完成 成功',
  failed: '失败 错误',
};

const TYPE_SEARCH_LABELS: Record<Task['task_type'], string> = {
  generate: '文生图 生成',
  edit: '图生图 编辑',
};

interface TaskListProps {
  searchTerm: string;
}

export function TaskList({ searchTerm }: TaskListProps) {
  const tasks = useTasksStore((s) => s.tasks);
  const loading = useTasksStore((s) => s.loading);
  const deleteTask = useTasksStore((s) => s.deleteTask);
  const cancelTask = useTasksStore((s) => s.cancelTask);
  const createTask = useTasksStore((s) => s.createTask);
  const addReferenceImages = useCreationDraftStore((s) => s.addReferenceImages);

  const [previewTask, setPreviewTask] = useState<Task | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [copiedErrorId, setCopiedErrorId] = useState<string | null>(null);
  const [actionMessages, setActionMessages] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<TaskFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const copiedErrorTimerRef = useRef<number | null>(null);
  const actionMessageTimersRef = useRef<Record<string, number>>({});

  const counts = useMemo(() => getTaskCounts(tasks), [tasks]);
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const visibleTasks = useMemo(() => {
    return [...tasks]
      .sort((a, b) => b.created_at - a.created_at)
      .filter((task) => activeFilter === 'all' || task.status === activeFilter)
      .filter((task) => {
        if (!normalizedSearch) return true;
        return [
          task.prompt,
          task.task_type,
          task.status,
          TYPE_SEARCH_LABELS[task.task_type],
          STATUS_SEARCH_LABELS[task.status],
          task.error ?? '',
        ]
          .some((value) => value.toLowerCase().includes(normalizedSearch));
      });
  }, [activeFilter, normalizedSearch, tasks]);

  const galleryItems = useMemo(() => {
    return visibleTasks.flatMap((task) => getGalleryItems(task));
  }, [visibleTasks]);

  useEffect(() => {
    return () => {
      if (copiedErrorTimerRef.current !== null) {
        window.clearTimeout(copiedErrorTimerRef.current);
      }

      Object.values(actionMessageTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
    };
  }, []);

  const handleConfirmDelete = async (taskId: string) => {
    await deleteTask(taskId);
    setConfirmDeleteId(null);
    if (previewTask?.id === taskId) {
      setPreviewTask(null);
    }
  };

  const handleRetryTask = async (task: Task) => {
    const disabledReason = getRetryDisabledReason(task);
    if (disabledReason) {
      setTaskActionMessage(task.id, disabledReason);
      return;
    }

    const params = parseTaskParams(task.params_json);
    if (!params) {
      setTaskActionMessage(task.id, '任务参数已损坏，无法重试');
      return;
    }

    setRetryingId(task.id);
    try {
      const sourceImages = task.task_type === 'edit' ? getStoredSourceInputs(task) : undefined;
      await createTask(task.prompt, task.task_type, params, sourceImages);
      setActiveFilter('all');
      setTaskActionMessage(task.id, '已创建新的重试任务');
    } catch (error) {
      setTaskActionMessage(task.id, getErrorMessage(error, '无法创建重试任务，请检查设置后再试'));
    } finally {
      setRetryingId(null);
    }
  };

  const handleUseGalleryItemAsReference = (item: GalleryItem) => {
    addReferenceImages([buildGeneratedReference(item.task, item.path, item.index)]);
    setTaskActionMessage(item.task.id, `已加入第 ${item.index + 1} 张图作为参考`);
  };

  const handleUseTaskAsReference = (task: Task) => {
    const [firstPath] = getResultPaths(task);
    if (!firstPath) {
      setTaskActionMessage(task.id, '这个任务没有可用的生成图片');
      return;
    }

    addReferenceImages([buildGeneratedReference(task, firstPath, 0)]);
    setTaskActionMessage(task.id, '已加入首张生成图作为参考');
  };

  const handleUsePreviewImageAsReference = (task: Task, path: string, index: number) => {
    addReferenceImages([buildGeneratedReference(task, path, index)]);
    setTaskActionMessage(task.id, `已加入预览中的第 ${index + 1} 张图作为参考`);
  };

  const handleCopyError = async (task: Task) => {
    if (!task.error) return;

    if (typeof navigator.clipboard?.writeText !== 'function') {
      setTaskActionMessage(task.id, '当前环境不支持自动复制，请展开后手动选择错误文本');
      return;
    }

    try {
      await navigator.clipboard.writeText(task.error);
      setCopiedErrorId(task.id);
      setTaskActionMessage(task.id, '完整错误已复制');
      if (copiedErrorTimerRef.current !== null) {
        window.clearTimeout(copiedErrorTimerRef.current);
      }
      copiedErrorTimerRef.current = window.setTimeout(() => {
        setCopiedErrorId((current) => (current === task.id ? null : current));
        copiedErrorTimerRef.current = null;
      }, 1800);
    } catch (error) {
      setTaskActionMessage(task.id, getErrorMessage(error, '复制失败，请展开后手动选择错误文本'));
    }
  };

  const setTaskActionMessage = (taskId: string, message: string) => {
    setActionMessages((current) => ({ ...current, [taskId]: message }));
    const previousTimer = actionMessageTimersRef.current[taskId];
    if (previousTimer !== undefined) {
      window.clearTimeout(previousTimer);
    }

    actionMessageTimersRef.current[taskId] = window.setTimeout(() => {
      setActionMessages((current) => {
        if (current[taskId] !== message) return current;
        const next = { ...current };
        delete next[taskId];
        return next;
      });
      delete actionMessageTimersRef.current[taskId];
    }, 3600);
  };

  if (loading && tasks.length === 0) {
    return <TaskListSkeleton />;
  }

  if (tasks.length === 0) {
    return (
      <EmptyState
        title="还没有生成任务"
        description="从上方创作面板创建文生图或图生图任务，开始积累你的生成历史。"
      />
    );
  }

  return (
    <section className="task-workspace" aria-label="生成队列和历史记录">
      <div className="task-results-header">
        <div className="task-toolbar-copy">
          <span className="text-xs font-semibold tracking-wide uppercase text-[var(--c-text-muted)]">生成记录</span>
          <span className="text-xs text-[var(--c-text-muted)]">
            {counts.running + counts.pending} 个进行中 · {counts.completed} 个已完成 · {counts.failed} 个失败
          </span>
        </div>

        <div className="task-results-controls">
          <div className="task-filter-row" role="group" aria-label="按状态筛选任务">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={`task-filter-chip ${activeFilter === filter.value ? 'active' : ''}`}
                onClick={() => setActiveFilter(filter.value)}
                aria-pressed={activeFilter === filter.value}
              >
                <span>{filter.label}</span>
                <span className="task-filter-count">{getFilterCount(filter.value, counts)}</span>
              </button>
            ))}
          </div>

          <div className="view-toggle-row" role="group" aria-label="切换任务展示方式">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
            >
              列表
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'gallery' ? 'active' : ''}`}
              onClick={() => setViewMode('gallery')}
              aria-pressed={viewMode === 'gallery'}
            >
              画廊
            </button>
          </div>
        </div>
      </div>

      {visibleTasks.length === 0 ? (
        <EmptyState
          compact
          title="没有匹配的任务"
          description="尝试切换状态筛选，或清空搜索关键词。"
        />
      ) : viewMode === 'gallery' ? (
        galleryItems.length === 0 ? (
          <EmptyState
            compact
            title="还没有可浏览的图片"
            description="完成的任务会出现在画廊中。你也可以切回列表查看排队或失败任务。"
          />
        ) : (
          <div className="gallery-grid" aria-label="生成图片画廊">
            {galleryItems.map((item) => (
              <article
                key={`${item.task.id}-${item.index}`}
                className="gallery-item"
              >
                <button
                  type="button"
                  className="gallery-item-main"
                  onClick={() => setPreviewTask(item.task)}
                  aria-label={`打开第 ${item.index + 1} 张生成图片，提示词：${item.task.prompt}`}
                >
                  <img src={item.src} alt={`生成图片 ${item.index + 1}`} width={160} height={160} loading="lazy" />
                  <span className="gallery-item-meta">
                    <span>{item.task.task_type === 'generate' ? '文生图' : '图生图'}</span>
                    <span>{formatShortDate(item.task.created_at)}</span>
                  </span>
                  <span className="gallery-item-prompt" title={item.task.prompt}>{item.task.prompt}</span>
                </button>
                <button
                  type="button"
                  className="gallery-reference-btn"
                  onClick={() => handleUseGalleryItemAsReference(item)}
                  aria-label={`将第 ${item.index + 1} 张生成图片用作图生图参考`}
                >
                  <ReferenceIcon />
                  用作参考
                </button>
              </article>
            ))}
          </div>
        )
      ) : (
        <div className="task-list-grid" aria-live="polite">
          {visibleTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onPreview={() => setPreviewTask(task)}
              onCancel={() => cancelTask(task.id)}
              onRequestDelete={() => setConfirmDeleteId(task.id)}
              onConfirmDelete={() => handleConfirmDelete(task.id)}
              onCancelDelete={() => setConfirmDeleteId(null)}
              onRetry={() => void handleRetryTask(task)}
              onUseAsReference={() => handleUseTaskAsReference(task)}
              onCopyError={() => void handleCopyError(task)}
              retryDisabledReason={getRetryDisabledReason(task)}
              retrying={retryingId === task.id}
              copiedError={copiedErrorId === task.id}
              actionMessage={actionMessages[task.id]}
              isConfirmingDelete={confirmDeleteId === task.id}
            />
          ))}
        </div>
      )}

      {previewTask && (
        <ImagePreview
          task={previewTask}
          onUseAsReference={(path, index) => {
            handleUsePreviewImageAsReference(previewTask, path, index);
            setPreviewTask(null);
          }}
          onClose={() => setPreviewTask(null)}
        />
      )}
    </section>
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

function parseTaskParams(paramsJson: string): TaskParams | null {
  try {
    const value: unknown = JSON.parse(paramsJson);
    if (!isTaskParams(value)) return null;
    return value;
  } catch {
    return null;
  }
}

function isTaskParams(value: unknown): value is TaskParams {
  if (typeof value !== 'object' || value === null) return false;

  const record = value as Record<string, unknown>;
  return typeof record.size === 'string'
    && typeof record.quality === 'string'
    && typeof record.n === 'number';
}

function getRetryDisabledReason(task: Task): string | undefined {
  if (task.status !== 'failed') return undefined;
  if (!parseTaskParams(task.params_json)) return '任务参数已损坏，无法重试';
  if (task.task_type === 'edit' && getStoredSourceInputs(task).length === 0) {
    return '旧图生图任务缺少源图快照，需要重新选择参考图';
  }
  return undefined;
}

function getStoredSourceInputs(task: Task): SourceImageInput[] {
  const paths = getSourcePaths(task);
  return paths.map((path, index) => ({
    sourceType: 'stored',
    path,
    name: `源图快照 ${index + 1}`,
  }));
}

function getSourcePaths(task: Task): string[] {
  if (task.source_image_paths) {
    const paths = parseStringArray(task.source_image_paths);
    if (paths.length > 0) return paths;
  }

  return task.source_image_path ? [task.source_image_path] : [];
}

function getResultPaths(task: Task): string[] {
  return task.result_paths ? parseStringArray(task.result_paths) : [];
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

interface GalleryItem {
  task: Task;
  src: string;
  path: string;
  index: number;
}

function getGalleryItems(task: Task): GalleryItem[] {
  if (task.status !== 'completed' || !task.result_paths) return [];

  try {
    return getResultPaths(task).map((path, index) => ({
      task,
      src: convertFileSrc(path),
      path,
      index,
    }));
  } catch {
    return [];
  }
}

function buildGeneratedReference(task: Task, path: string, index: number): DraftReferenceImage {
  const taskTypeLabel = task.task_type === 'generate' ? '文生图' : '图生图';
  return {
    id: createReferenceId('generated'),
    source: 'generated',
    previewUrl: convertFileSrc(path),
    name: `${taskTypeLabel}结果 ${index + 1}`,
    mimeType: 'image/png',
    path,
    taskId: task.id,
    index,
  };
}

function formatShortDate(unixTimestamp: number): string {
  return new Date(unixTimestamp * 1000).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });
}

function getTaskCounts(tasks: Task[]) {
  return tasks.reduce(
    (acc, task) => ({
      ...acc,
      [task.status]: acc[task.status] + 1,
      all: acc.all + 1,
    }),
    { all: 0, pending: 0, running: 0, completed: 0, failed: 0 } satisfies Record<TaskFilter, number>,
  );
}

function getFilterCount(filter: TaskFilter, counts: Record<TaskFilter, number>): number {
  return counts[filter];
}

function TaskListSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4" aria-label="正在加载任务">
      {[0, 1, 2].map((index) => (
        <div key={index} className="h-24 rounded-xl bg-white/5 animate-pulse" />
      ))}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  compact?: boolean;
}

function EmptyState({ title, description, compact = false }: EmptyStateProps) {
  return (
    <div className={`task-empty-state ${compact ? 'compact' : ''}`}>
      <EmptyIcon />
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm font-medium text-[var(--c-text)]">{title}</p>
        <p className="max-w-md text-xs text-[var(--c-text-muted)]">{description}</p>
      </div>
    </div>
  );
}

function EmptyIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-30" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
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
