use std::path::PathBuf;

use base64::Engine;
use tauri::Manager;

use crate::{AppError, AppResult};

pub fn save_image(
    app_handle: &tauri::AppHandle,
    base64_data: &str,
    task_id: &str,
    index: usize,
) -> AppResult<PathBuf> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::message(e.to_string()))?;
    let images_dir = app_data_dir.join("images");
    std::fs::create_dir_all(&images_dir)?;

    let path = images_dir.join(format!("{task_id}_{index}.png"));
    let image_bytes = base64::engine::general_purpose::STANDARD
        .decode(strip_data_url_prefix(base64_data))
        .map_err(|e| AppError::message(e.to_string()))?;
    std::fs::write(&path, image_bytes)?;

    Ok(path)
}

fn strip_data_url_prefix(value: &str) -> &str {
    value
        .split_once(',')
        .map(|(_, content)| content)
        .unwrap_or(value)
}
