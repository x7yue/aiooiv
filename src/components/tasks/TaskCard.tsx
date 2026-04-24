import { useMemo, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { Task } from '../../lib/commands';
import { TaskStatusBadge } from './TaskStatusBadge';

interface TaskCardProps {
  task: Task;
  isConfirmingDelete: boolean;
  onPreview: () => void;
  onCancel: () => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onRetry: () => void;
  onCopyError: () => void;
  retryDisabledReason?: string;
  retrying?: boolean;
  copiedError?: boolean;
  actionMessage?: string;
}

export function TaskCard({
  task,
  isConfirmingDelete,
  onPreview,
  onCancel,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  onRetry,
  onCopyError,
  retryDisabledReason,
  retrying = false,
  copiedError = false,
  actionMessage,
}: TaskCardProps) {
  const [errorExpanded, setErrorExpanded] = useState(false);
  const thumbnail = useMemo(() => getTaskThumbnail(task), [task]);
  const timeAgo = useMemo(() => formatTimeAgo(task.created_at), [task.created_at]);
  const completedAt = useMemo(
    () => (task.completed_at ? formatTimeAgo(task.completed_at) : null),
    [task.completed_at],
  );

  const isFailed = task.status === 'failed';
  const isClickable = task.status === 'completed' && thumbnail !== null;
  const taskTypeLabel = task.task_type === 'generate' ? '文生图' : '图生图';
  const retryReasonId = `${task.id}-retry-reason`;
  const rawErrorId = `${task.id}-raw-error`;
  const failureInsight = useMemo(() => getFailureInsight(task), [task]);

  const cardBody = (
    <>
      <div className="task-card-visual" aria-hidden={!thumbnail}>
        {thumbnail ? (
          <img src={thumbnail} alt="生成任务缩略图" width={64} height={64} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[var(--c-surface-2)]">
            {task.task_type === 'generate' ? <GenerateIcon /> : <EditIcon />}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-2 py-0.5">
        <div className="flex items-center gap-2">
          <TaskStatusBadge status={task.status} />
          <span className="task-type-pill">{taskTypeLabel}</span>
          <span className="text-xs text-[var(--c-text-muted)] ml-auto shrink-0" title={formatTimestamp(task.created_at)}>
            {timeAgo}
          </span>
        </div>

        {isFailed ? (
          <div className="task-card-failed-line">
            <p className="task-card-prompt task-card-prompt--failed" title={task.prompt}>
              {task.prompt}
            </p>

            <section
              className={`task-error-panel ${errorExpanded ? 'expanded' : ''}`}
              role="region"
              aria-live="polite"
              aria-label="失败任务错误和恢复选项"
            >
              <div className="failure-report-row">
                <div className="failure-report-copy">
                  <span className="failure-report-icon" aria-hidden="true">
                    <FailureIcon />
                  </span>
                  <strong>{failureInsight.title}</strong>
                </div>

                <div className="failure-report-actions" role="group" aria-label="失败任务恢复操作">
                  <button
                    type="button"
                    className="failure-primary-action"
                    onClick={onRetry}
                    disabled={Boolean(retryDisabledReason) || retrying}
                    title={retryDisabledReason ?? '用相同提示词和参数重新创建任务'}
                    aria-describedby={retryDisabledReason ? retryReasonId : undefined}
                  >
                    <RetryIcon />
                    {retrying ? '重试中' : '重试'}
                  </button>
                  {task.error && (
                    <button
                      type="button"
                      className="task-mini-action"
                      onClick={onCopyError}
                      title="复制完整错误信息"
                    >
                      <CopyIcon />
                      {copiedError ? '已复制' : '复制'}
                    </button>
                  )}
                  {task.error && (
                    <button
                      type="button"
                      className="task-error-toggle"
                      onClick={() => setErrorExpanded((current) => !current)}
                      aria-expanded={errorExpanded}
                      aria-controls={rawErrorId}
                    >
                      {errorExpanded ? '收起' : '详情'}
                    </button>
                  )}
                </div>
              </div>

              {errorExpanded && (
                <p className="failure-report-summary">
                  <span className="failure-report-code">{failureInsight.code}</span>
                  {failureInsight.summary}
                </p>
              )}

              {(retryDisabledReason || actionMessage) && (
                <div className="task-error-feedback">
                  {retryDisabledReason && (
                    <span id={retryReasonId} className="task-action-hint">
                      {retryDisabledReason}
                    </span>
                  )}
                  {actionMessage && (
                    <span className="task-action-hint" role="status">
                      {actionMessage}
                    </span>
                  )}
                </div>
              )}

              {task.error && (
                <p id={rawErrorId} className="task-error" title={task.error} hidden={!errorExpanded}>
                  {task.error}
                </p>
              )}
            </section>
          </div>
        ) : (
          <p className="task-card-prompt" title={task.prompt}>
            {task.prompt}
          </p>
        )}

        {completedAt && task.status === 'completed' && (
          <p className="text-[11px] text-[var(--c-text-muted)]">
            完成于 {completedAt}
          </p>
        )}
      </div>
    </>
  );

  return (
    <article className={`task-card ${isClickable ? 'cursor-pointer' : ''} ${isFailed ? 'task-card--failed' : ''}`}>
      {isClickable ? (
        <button
          type="button"
          className="task-card-main clickable"
          onClick={onPreview}
          aria-label={`打开该任务的生成图片，提示词：${task.prompt}`}
        >
          {cardBody}
        </button>
      ) : (
        <div className="task-card-main">
          {cardBody}
        </div>
      )}

      <div className="task-card-actions">
        {task.status === 'running' && (
          <button
            onClick={onCancel}
            className="task-action-btn text-[var(--c-warning)]"
            aria-label="取消运行中的任务"
            title="取消"
            type="button"
          >
            <StopIcon />
          </button>
        )}

        {isConfirmingDelete ? (
          <div className="task-delete-confirm" role="group" aria-label="确认删除任务">
            <span>删除？</span>
            <button type="button" onClick={onConfirmDelete} className="task-delete-confirm-yes">
              是
            </button>
            <button type="button" onClick={onCancelDelete} className="task-delete-confirm-no">
              否
            </button>
          </div>
        ) : (
          <button
            onClick={onRequestDelete}
            className="task-action-btn text-[var(--c-text-muted)] hover:text-[var(--c-error)]"
            aria-label="删除任务"
            title="删除"
            type="button"
          >
            <TrashIcon />
          </button>
        )}
      </div>
    </article>
  );
}

interface FailureInsight {
  code: string;
  title: string;
  summary: string;
}

function getFailureInsight(task: Task): FailureInsight {
  const error = task.error?.toLowerCase() ?? '';

  if (error.includes('did not contain image data') || error.includes('image data')) {
    return {
      code: '响应无图像',
      title: '模型没有返回图片',
      summary: '服务端响应完成了，但没有解析到可保存的图像数据。通常可以直接重试；如果连续出现，请检查模型或 base_url 配置。',
    };
  }

  if (error.includes('api key') || error.includes('unauthorized') || error.includes('401')) {
    return {
      code: '鉴权失败',
      title: 'API Key 或权限异常',
      summary: '请求没有通过服务鉴权。请打开设置检查 API Key、base_url 和当前账号是否支持图像生成。',
    };
  }

  if (error.includes('timeout') || error.includes('timed out')) {
    return {
      code: '请求超时',
      title: '生成请求等待过久',
      summary: '网络或服务端响应较慢导致任务中断。建议稍后重新生成，或降低同时运行的任务数量。',
    };
  }

  if (task.task_type === 'edit') {
    return {
      code: '编辑失败',
      title: '图生图任务未完成',
      summary: '这次图片编辑没有成功。由于源图不会随失败任务持久化，重新编辑前需要再次选择源图片。',
    };
  }

  return {
    code: '生成失败',
    title: '任务未成功完成',
    summary: '生成过程中出现异常。可以先重新生成；如果多次失败，请复制错误信息用于排查设置或服务端响应。',
  };
}

function FailureIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function getTaskThumbnail(task: Task): string | null {
  if (task.status !== 'completed' || !task.result_paths) return null;

  try {
    const paths: unknown = JSON.parse(task.result_paths);
    if (Array.isArray(paths) && typeof paths[0] === 'string') {
      return convertFileSrc(paths[0]);
    }
  } catch {
    return null;
  }

  return null;
}

function formatTimeAgo(unixTimestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixTimestamp;

  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;

  return formatTimestamp(unixTimestamp);
}

function formatTimestamp(unixTimestamp: number): string {
  return new Date(unixTimestamp * 1000).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function GenerateIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--c-text-muted)]" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--c-text-muted)]" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
