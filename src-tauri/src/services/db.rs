use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::{AppError, AppResult};

const INTERRUPTED_TASK_MESSAGE: &str =
    "应用上次异常退出，未完成的任务已自动标记为失败，请重新创建任务。";

const TASKS_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    task_type TEXT NOT NULL,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL,
    params_json TEXT NOT NULL,
    source_image_path TEXT,
    result_paths TEXT,
    error TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
);
"#;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub task_type: String,
    pub prompt: String,
    pub status: String,
    pub params_json: String,
    pub source_image_path: Option<String>,
    pub result_paths: Option<String>,
    pub error: Option<String>,
    pub created_at: i64,
    pub completed_at: Option<i64>,
}

pub fn init_db(app: &tauri::AppHandle) -> AppResult<Connection> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::message(e.to_string()))?;
    std::fs::create_dir_all(&app_data_dir)?;

    let db_path = app_data_dir.join("app.sqlite");
    let conn = Connection::open(db_path)?;
    conn.execute_batch(TASKS_SCHEMA)?;
    recover_interrupted_tasks(&conn)?;

    Ok(conn)
}

fn recover_interrupted_tasks(conn: &Connection) -> AppResult<()> {
    let recovered = conn.execute(
        r#"
        UPDATE tasks
        SET status = 'failed', error = ?1, completed_at = strftime('%s', 'now')
        WHERE status IN ('pending', 'running')
        "#,
        params![INTERRUPTED_TASK_MESSAGE],
    )?;

    if recovered > 0 {
        log::warn!(
            "recovered {} interrupted tasks from previous session",
            recovered
        );
    }

    Ok(())
}

pub fn insert_task(conn: &Connection, task: &Task) -> AppResult<()> {
    conn.execute(
        r#"
        INSERT INTO tasks (
            id, task_type, prompt, status, params_json,
            source_image_path, result_paths, error, created_at, completed_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        "#,
        params![
            task.id,
            task.task_type,
            task.prompt,
            task.status,
            task.params_json,
            task.source_image_path,
            task.result_paths,
            task.error,
            task.created_at,
            task.completed_at
        ],
    )?;
    Ok(())
}

pub fn update_task(
    conn: &Connection,
    task_id: &str,
    status: &str,
    result_paths: Option<&str>,
    error: Option<&str>,
    completed_at: Option<i64>,
) -> AppResult<()> {
    conn.execute(
        r#"
        UPDATE tasks
        SET status = ?2, result_paths = ?3, error = ?4, completed_at = ?5
        WHERE id = ?1
        "#,
        params![task_id, status, result_paths, error, completed_at],
    )?;

    Ok(())
}

pub fn get_task(conn: &Connection, task_id: &str) -> AppResult<Option<Task>> {
    let task = conn
        .query_row(
            r#"
            SELECT id, task_type, prompt, status, params_json,
                   source_image_path, result_paths, error, created_at, completed_at
            FROM tasks
            WHERE id = ?1
            "#,
            params![task_id],
            row_to_task,
        )
        .optional()?;

    Ok(task)
}

pub fn list_tasks(conn: &Connection) -> AppResult<Vec<Task>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, task_type, prompt, status, params_json,
               source_image_path, result_paths, error, created_at, completed_at
        FROM tasks
        ORDER BY created_at DESC
        "#,
    )?;

    let rows = stmt.query_map([], row_to_task)?;
    let mut tasks = Vec::new();
    for row in rows {
        tasks.push(row?);
    }

    Ok(tasks)
}

pub fn delete_task(conn: &Connection, task_id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![task_id])?;
    Ok(())
}

fn row_to_task(row: &rusqlite::Row<'_>) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?,
        task_type: row.get(1)?,
        prompt: row.get(2)?,
        status: row.get(3)?,
        params_json: row.get(4)?,
        source_image_path: row.get(5)?,
        result_paths: row.get(6)?,
        error: row.get(7)?,
        created_at: row.get(8)?,
        completed_at: row.get(9)?,
    })
}
