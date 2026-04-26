use base64::Engine;
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
const MAX_SOURCE_IMAGES: usize = 16;
const MAX_SOURCE_IMAGE_BYTES: usize = 12 * 1024 * 1024;

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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceImageInput {
    source_type: String,
    base64: Option<String>,
    mime_type: Option<String>,
    path: Option<String>,
    name: Option<String>,
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
    source_images_json: Option<String>,
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

    let source_image_inputs = parse_source_image_inputs(
        &task_type,
        source_images_json,
        source_image_base64,
        source_image_mime_type,
    )?;

    let task_id = Uuid::new_v4().to_string();
    let created_at = Utc::now().timestamp();
    let source_images = resolve_source_images(&app, &source_image_inputs)?;
    let source_image_paths = save_source_image_snapshots(&app, &source_images, &task_id)?;
    let source_image_paths_json = if source_image_paths.is_empty() {
        None
    } else {
        Some(serde_json::to_string(&source_image_paths)?)
    };

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
                source_image_path: source_image_paths.first().cloned(),
                source_image_paths: source_image_paths_json.clone(),
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
            source_images,
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
pub async fn delete_task(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
) -> AppResult<()> {
    let task = {
        let db = state
            .db
            .lock()
            .map_err(|_| AppError::message("DB lock poisoned".to_owned()))?;
        db::get_task(&db, &task_id)?
    };

    if let Some(task) = task {
        let mut paths_to_remove = Vec::new();

        if let Some(source_image_path) = task.source_image_path {
            paths_to_remove.push(source_image_path);
        }

        if let Some(source_image_paths) = task.source_image_paths {
            let paths: Vec<String> = serde_json::from_str(&source_image_paths)
                .map_err(|e| AppError::message(format!("Invalid source_image_paths JSON: {e}")))?;
            paths_to_remove.extend(paths);
        }

        if let Some(result_paths) = task.result_paths {
            let paths: Vec<String> = serde_json::from_str(&result_paths)
                .map_err(|e| AppError::message(format!("Invalid result_paths JSON: {e}")))?;
            paths_to_remove.extend(paths);
        }

        paths_to_remove.sort();
        paths_to_remove.dedup();
        for path in paths_to_remove {
            if let Err(err) = image_store::remove_managed_image(&app, &path) {
                log::warn!("failed to remove image file {path}: {err}");
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
    source_images: Vec<openai::ImageInput>,
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
        if source_images.is_empty() {
            return Err(AppError::message(
                "at least one source image is required for edit tasks".to_owned(),
            ));
        }

        log::info!(
            "[task:{}] calling edit_image with {} source images",
            task_id,
            source_images.len()
        );
        openai::edit_image(
            &settings.base_url,
            &settings.api_key,
            &source_images,
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

fn parse_source_image_inputs(
    task_type: &str,
    source_images_json: Option<String>,
    legacy_source_image_base64: Option<String>,
    legacy_source_image_mime_type: Option<String>,
) -> AppResult<Vec<SourceImageInput>> {
    if task_type != "edit" {
        return Ok(Vec::new());
    }

    let mut source_images = if let Some(source_images_json) = source_images_json {
        if source_images_json.trim().is_empty() {
            Vec::new()
        } else {
            serde_json::from_str::<Vec<SourceImageInput>>(&source_images_json)
                .map_err(|e| AppError::message(format!("Invalid source_images_json: {e}")))?
        }
    } else {
        Vec::new()
    };

    if source_images.is_empty() {
        if let (Some(base64), Some(mime_type)) =
            (legacy_source_image_base64, legacy_source_image_mime_type)
        {
            source_images.push(SourceImageInput {
                source_type: "upload".to_owned(),
                base64: Some(base64),
                mime_type: Some(mime_type),
                path: None,
                name: Some("源图片".to_owned()),
            });
        }
    }

    if source_images.is_empty() {
        return Err(AppError::message(
            "at least one source image is required for edit task".to_owned(),
        ));
    }

    if source_images.len() > MAX_SOURCE_IMAGES {
        return Err(AppError::message(format!(
            "edit task can use at most {MAX_SOURCE_IMAGES} source images"
        )));
    }

    Ok(source_images)
}

fn resolve_source_images(
    app: &AppHandle,
    source_image_inputs: &[SourceImageInput],
) -> AppResult<Vec<openai::ImageInput>> {
    source_image_inputs
        .iter()
        .map(|source_image| match source_image.source_type.as_str() {
            "upload" => resolve_uploaded_source_image(source_image),
            "stored" => resolve_stored_source_image(app, source_image),
            other => Err(AppError::message(format!(
                "unsupported source image type: {other}"
            ))),
        })
        .collect()
}

fn resolve_uploaded_source_image(source_image: &SourceImageInput) -> AppResult<openai::ImageInput> {
    let base64 = source_image
        .base64
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            AppError::message("uploaded source image is missing base64 data".to_owned())
        })?;
    let mime_type = source_image.mime_type.as_deref().ok_or_else(|| {
        AppError::message("uploaded source image is missing MIME type".to_owned())
    })?;

    validate_source_image_mime_type(mime_type)?;
    validate_source_image_size(base64)?;
    if let Some(name) = source_image.name.as_deref() {
        log::debug!("resolving uploaded source image: {name}");
    }

    Ok(openai::ImageInput {
        base64: base64.to_owned(),
        mime_type: mime_type.to_owned(),
    })
}

fn resolve_stored_source_image(
    app: &AppHandle,
    source_image: &SourceImageInput,
) -> AppResult<openai::ImageInput> {
    let path = source_image
        .path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::message("stored source image is missing a path".to_owned()))?;
    let (base64, mime_type) =
        image_store::read_managed_image_as_base64(app, path, MAX_SOURCE_IMAGE_BYTES as u64)?;
    validate_source_image_mime_type(&mime_type)?;

    Ok(openai::ImageInput { base64, mime_type })
}

fn save_source_image_snapshots(
    app: &AppHandle,
    source_images: &[openai::ImageInput],
    task_id: &str,
) -> AppResult<Vec<String>> {
    let mut paths = Vec::with_capacity(source_images.len());
    for (index, source_image) in source_images.iter().enumerate() {
        let path = image_store::save_source_image(
            app,
            &source_image.base64,
            &source_image.mime_type,
            task_id,
            index,
        )?;
        paths.push(path.to_string_lossy().to_string());
    }

    Ok(paths)
}

fn validate_source_image_mime_type(mime_type: &str) -> AppResult<()> {
    if SUPPORTED_SOURCE_IMAGE_MIME_TYPES.contains(&mime_type) {
        return Ok(());
    }

    Err(AppError::message(
        "source image must be PNG, JPEG, or WebP".to_owned(),
    ))
}

fn validate_source_image_size(base64_data: &str) -> AppResult<()> {
    let image_bytes = base64::engine::general_purpose::STANDARD
        .decode(strip_data_url_prefix(base64_data))
        .map_err(|e| AppError::message(e.to_string()))?;

    if image_bytes.len() > MAX_SOURCE_IMAGE_BYTES {
        return Err(AppError::message(format!(
            "source image must be at most {} MB",
            MAX_SOURCE_IMAGE_BYTES / 1024 / 1024
        )));
    }

    Ok(())
}

fn strip_data_url_prefix(value: &str) -> &str {
    value
        .split_once(',')
        .map(|(_, content)| content)
        .unwrap_or(value)
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
