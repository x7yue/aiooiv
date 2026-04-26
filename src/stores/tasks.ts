import { create } from 'zustand';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import * as cmd from '../lib/commands';
import type { SourceImageInput, Task, TaskUpdatePayload } from '../lib/commands';

const TASK_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;

interface TasksState {
  tasks: Task[];
  loading: boolean;
  loadTasks: () => Promise<void>;
  createTask: (
    prompt: string,
    taskType: 'generate' | 'edit',
    params: cmd.TaskParams,
    sourceImages?: SourceImageInput[],
  ) => Promise<string>;
  cancelTask: (taskId: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  setupEventListener: () => Promise<UnlistenFn>;
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  loading: false,

  loadTasks: async () => {
    set({ loading: true });
    const tasks = await cmd.listTasks();
    set({ tasks, loading: false });
  },

  createTask: async (prompt, taskType, params, sourceImages) => {
    const paramsJson = JSON.stringify(params);
    const taskId = await cmd.createTask(prompt, taskType, paramsJson, sourceImages);
    await get().loadTasks();
    return taskId;
  },

  cancelTask: async (taskId) => {
    await cmd.cancelTask(taskId);
    await get().loadTasks();
  },

  deleteTask: async (taskId) => {
    await cmd.deleteTask(taskId);
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== taskId) }));
  },

  setupEventListener: async () => {
    const unlisten = await listen<TaskUpdatePayload>('task-updated', (event) => {
      const payload = event.payload;
      if (!isTaskStatus(payload.status)) {
        console.warn('忽略未知任务状态更新', payload.status);
        return;
      }

      if (payload.result_paths !== undefined && !isStringArray(payload.result_paths)) {
        console.warn('忽略格式错误的任务图片路径更新', payload.id);
        return;
      }

      const status = payload.status;
      const resultPaths = payload.result_paths;
      const error = payload.error;
      const completedAt = payload.completed_at;

      set((state) => ({
        tasks: state.tasks.map((task) => {
          if (task.id !== payload.id) return task;
          return {
            ...task,
            status,
            result_paths: resultPaths ? JSON.stringify(resultPaths) : task.result_paths,
            error: error ?? task.error,
            completed_at:
              completedAt ?? (status === 'completed' || status === 'failed'
                ? task.completed_at
                : null),
          };
        }),
      }));
    });
    return unlisten;
  },
}));

function isTaskStatus(status: string): status is Task['status'] {
  return TASK_STATUSES.includes(status as Task['status']);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
