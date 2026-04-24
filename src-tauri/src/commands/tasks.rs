use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::{
    commands::settings::read_settings,
    services::{
        db::{self, Task},
        image_store, openai,
    },
    state::app_state::AppState,
    AppError, AppResult,
};

const SUPPORTED_SOURCE_IMAGE_MIME_TYPES: &[&str] = &["image/png", "image/jpeg", "image/webp"];

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TaskUpdatePayload {
    id: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    result_paths: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    completed_at: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct TaskParams {
    #[serde(default = "default_size")]
    size: String,
    #[serde(default = "default_quality")]
    quality: String,
    #[serde(default = "default_n")]
    n: u8,
}

fn default_size() -> String {
    "1024x1024".to_owned()
}

fn default_quality() -> String {
    "medium".to_owned()
}

fn default_n() -> u8 {
    1
}

#[tauri::command]
pub async fn create_task(
    app: AppHandle,
    state: State<'_, AppState>,
    prompt: String,
    task_type: String,
    params_json: String,
    source_image_base64: Option<String>,
    source_image_mime_type: Option<String>,
) -> AppResult<String> {
    let params: TaskParams = serde_json::from_str(&params_json)
        .map_err(|e| AppError::message(format!("Invalid params_json: {e}")))?;

    if task_type != "generate" && task_type != "edit" {
        return Err(AppError::message(
            "task_type must be 'generate' or 'edit'".to_owned(),
        ));
    }

    if task_type == "edit" && source_image_base64.is_none() {
        return Err(AppError::message(
            "source_image_base64 is required for edit task".to_owned(),
        ));
    }

    if task_type == "edit" && source_image_mime_type.is_none() {
        return Err(AppError::message(
            "source_image_mime_type is required for edit task".to_owned(),
        ));
    }

    if let Some(mime_type) = source_image_mime_type.as_deref() {
        validate_source_image_mime_type(mime_type)?;
    }

    let task_id = Uuid::new_v4().to_string();
    let created_at = Utc::now().timestamp();

    {
        let db = state
            .db
            .lock()
            .map_err(|_| AppError::message("DB lock poisoned".to_owned()))?;
        db::insert_task(
            &db,
            &Task {
                id: task_id.clone(),
                task_type: task_type.clone(),
                prompt: prompt.clone(),
                status: "pending".to_owned(),
                params_json: params_json.clone(),
                source_image_path: None,
                result_paths: None,
                error: None,
                created_at,
                completed_at: None,
            },
        )?;
    }

    let task_id_for_spawn = task_id.clone();
    let app_for_spawn = app.clone();
    let state_for_spawn = state.inner().clone();

    let handle = tokio::spawn(async move {
        if let Err(error) = run_task(
            app_for_spawn,
            state_for_spawn,
            task_id_for_spawn,
            prompt,
            task_type,
            params,
            source_image_base64,
            source_image_mime_type,
        )
        .await
        {
            log::error!("task execution failed: {error}");
        }
    });

    state
        .running_tasks
        .lock()
        .await
        .insert(task_id.clone(), handle);

    Ok(task_id)
}

#[tauri::command]
pub async fn cancel_task(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
) -> AppResult<()> {
    let handle = state.running_tasks.lock().await.remove(&task_id);
    if let Some(handle) = handle {
        handle.abort();
    }

    update_task_status(
        &app,
        state.inner(),
        &task_id,
        "failed",
        None,
        Some("Task cancelled".to_owned()),
    )?;

    Ok(())
}

#[tauri::command]
pub async fn list_tasks(state: State<'_, AppState>) -> AppResult<Vec<Task>> {
    let db = state
        .db
        .lock()
        .map_err(|_| AppError::message("DB lock poisoned".to_owned()))?;
    db::list_tasks(&db)
}

#[tauri::command]
pub async fn get_task(state: State<'_, AppState>, task_id: String) -> AppResult<Task> {
    let db = state
        .db
        .lock()
        .map_err(|_| AppError::message("DB lock poisoned".to_owned()))?;
    db::get_task(&db, &task_id)?
        .ok_or_else(|| AppError::message(format!("Task not found: {task_id}")))
}

#[tauri::command]
pub async fn delete_task(state: State<'_, AppState>, task_id: String) -> AppResult<()> {
    let task = {
        let db = state
            .db
            .lock()
            .map_err(|_| AppError::message("DB lock poisoned".to_owned()))?;
        db::get_task(&db, &task_id)?
    };

    if let Some(task) = task {
        if let Some(result_paths) = task.result_paths {
            let paths: Vec<String> = serde_json::from_str(&result_paths)
                .map_err(|e| AppError::message(format!("Invalid result_paths JSON: {e}")))?;
            for path in paths {
                if let Err(err) = std::fs::remove_file(&path) {
                    log::warn!("failed to remove image file {path}: {err}");
                }
            }
        }

        let db = state
            .db
            .lock()
            .map_err(|_| AppError::message("DB lock poisoned".to_owned()))?;
        db::delete_task(&db, &task_id)?;
    }

    Ok(())
}

async fn run_task(
    app: AppHandle,
    state: AppState,
    task_id: String,
    prompt: String,
    task_type: String,
    params: TaskParams,
    source_image_base64: Option<String>,
    source_image_mime_type: Option<String>,
) -> AppResult<()> {
    log::info!(
        "[task:{}] starting: type={}, params={:?}",
        task_id,
        task_type,
        params
    );
    update_task_status(&app, &state, &task_id, "running", None, None)?;

    let settings = read_settings(&app)?;
    log::debug!("[task:{}] settings loaded", task_id);

    let image_b64_list = if task_type == "edit" {
        let source = source_image_base64.ok_or_else(|| {
            AppError::message("source_image_base64 is required for edit tasks".to_owned())
        })?;
        let source_mime_type = source_image_mime_type.ok_or_else(|| {
            AppError::message("source_image_mime_type is required for edit tasks".to_owned())
        })?;
        validate_source_image_mime_type(&source_mime_type)?;
        log::info!("[task:{}] calling edit_image", task_id);
        openai::edit_image(
            &settings.base_url,
            &settings.api_key,
            &source,
            &source_mime_type,
            &prompt,
            &params.size,
            &params.quality,
            params.n,
        )
        .await
    } else {
        log::info!("[task:{}] calling generate_image", task_id);
        openai::generate_image(
            &settings.base_url,
            &settings.api_key,
            &prompt,
            &params.size,
            &params.quality,
            params.n,
        )
        .await
    };

    match image_b64_list {
        Ok(images) => {
            log::info!(
                "[task:{}] received {} images, saving to disk",
                task_id,
                images.len()
            );
            let mut saved_paths = Vec::with_capacity(images.len());
            for (index, image) in images.iter().enumerate() {
                let path = image_store::save_image(&app, image, &task_id, index)?;
                log::info!("[task:{}] saved image {}", task_id, index);
                saved_paths.push(path.to_string_lossy().to_string());
            }

            update_task_status(&app, &state, &task_id, "completed", Some(saved_paths), None)?;
            log::info!("[task:{}] completed successfully", task_id);
        }
        Err(err) => {
            log::error!("[task:{}] failed: {}", task_id, err);
            update_task_status(
                &app,
                &state,
                &task_id,
                "failed",
                None,
                Some(err.to_string()),
            )?;
        }
    }

    state.running_tasks.lock().await.remove(&task_id);
    Ok(())
}

fn validate_source_image_mime_type(mime_type: &str) -> AppResult<()> {
    if SUPPORTED_SOURCE_IMAGE_MIME_TYPES.contains(&mime_type) {
        return Ok(());
    }

    Err(AppError::message(
        "source image must be PNG, JPEG, or WebP".to_owned(),
    ))
}

fn update_task_status(
    app: &AppHandle,
    state: &AppState,
    task_id: &str,
    status: &str,
    result_paths: Option<Vec<String>>,
    error: Option<String>,
) -> AppResult<()> {
    let completed_at = if status == "completed" || status == "failed" {
        Some(Utc::now().timestamp())
    } else {
        None
    };

    let result_paths_json = result_paths
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|e| AppError::message(e.to_string()))?;

    {
        let db = state
            .db
            .lock()
            .map_err(|_| AppError::message("DB lock poisoned".to_owned()))?;
        db::update_task(
            &db,
            task_id,
            status,
            result_paths_json.as_deref(),
            error.as_deref(),
            completed_at,
        )?;
    }

    app.emit(
        "task-updated",
        TaskUpdatePayload {
            id: task_id.to_owned(),
            status: status.to_owned(),
            result_paths,
            error,
            completed_at,
        },
    )
    .map_err(|e| AppError::message(e.to_string()))?;

    Ok(())
}
