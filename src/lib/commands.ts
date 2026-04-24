import { invoke } from '@tauri-apps/api/core';

// ── Types ──────────────────────────────────────────

export interface Task {
  id: string;
  task_type: 'generate' | 'edit';
  prompt: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  params_json: string;
  source_image_path: string | null;
  result_paths: string | null;
  error: string | null;
  created_at: number;
  completed_at: number | null;
}

export interface TaskUpdatePayload {
  id: string;
  status: string;
  result_paths?: string[];
  error?: string;
  completed_at?: number;
}

export interface Settings {
  base_url: string;
  api_key: string;
}

export interface TaskParams {
  size: string;
  quality: string;
  n: number;
}

// ── Tauri Command Wrappers ─────────────────────────

export async function getSettings(): Promise<Settings> {
  return invoke<Settings>('get_settings');
}

export async function saveSettings(base_url: string, api_key: string): Promise<void> {
  return invoke<void>('save_settings', { baseUrl: base_url, apiKey: api_key });
}

export async function createTask(
  prompt: string,
  task_type: 'generate' | 'edit',
  params_json: string,
  source_image_base64?: string,
  source_image_mime_type?: string,
): Promise<string> {
  return invoke<string>('create_task', {
    prompt,
    taskType: task_type,
    paramsJson: params_json,
    sourceImageBase64: source_image_base64 ?? null,
    sourceImageMimeType: source_image_mime_type ?? null,
  });
}

export async function cancelTask(task_id: string): Promise<void> {
  return invoke<void>('cancel_task', { taskId: task_id });
}

export async function listTasks(): Promise<Task[]> {
  return invoke<Task[]>('list_tasks');
}

export async function getTask(task_id: string): Promise<Task> {
  return invoke<Task>('get_task', { taskId: task_id });
}

export async function deleteTask(task_id: string): Promise<void> {
  return invoke<void>('delete_task', { taskId: task_id });
}
