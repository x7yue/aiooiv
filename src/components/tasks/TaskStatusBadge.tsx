import type { Task } from '../../lib/commands';

interface TaskStatusBadgeProps {
  status: Task['status'];
}

const STATUS_CONFIG: Record<Task['status'], { label: string; className: string }> = {
  pending: { label: '排队中', className: 'status-pending' },
  running: { label: '运行中', className: 'status-running' },
  completed: { label: '已完成', className: 'status-completed' },
  failed: { label: '失败', className: 'status-failed' },
};

export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span className={`status-badge ${config.className}`}>
      {status === 'running' && <span className="status-pulse" aria-hidden="true" />}
      {config.label}
    </span>
  );
}
