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

pub fn save_source_image(
    app_handle: &tauri::AppHandle,
    base64_data: &str,
    mime_type: &str,
    task_id: &str,
    index: usize,
) -> AppResult<PathBuf> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::message(e.to_string()))?;
    let source_images_dir = app_data_dir.join("source-images");
    std::fs::create_dir_all(&source_images_dir)?;

    let extension = extension_for_mime_type(mime_type)?;
    let path = source_images_dir.join(format!("{task_id}_{index}.{extension}"));
    let image_bytes = base64::engine::general_purpose::STANDARD
        .decode(strip_data_url_prefix(base64_data))
        .map_err(|e| AppError::message(e.to_string()))?;
    std::fs::write(&path, image_bytes)?;

    Ok(path)
}

pub fn read_managed_image_as_base64(
    app_handle: &tauri::AppHandle,
    path_value: &str,
    max_bytes: u64,
) -> AppResult<(String, String)> {
    let canonical_path = canonicalize_managed_image_path(app_handle, path_value)?;
    let file_size = std::fs::metadata(&canonical_path)?.len();
    if file_size > max_bytes {
        return Err(AppError::message(format!(
            "Referenced image must be at most {} MB",
            max_bytes / 1024 / 1024
        )));
    }

    let image_bytes = std::fs::read(&canonical_path)?;
    let base64_data = base64::engine::general_purpose::STANDARD.encode(image_bytes);
    let mime_type = mime_type_for_path(&canonical_path)?;

    Ok((base64_data, mime_type))
}

pub fn remove_managed_image(app_handle: &tauri::AppHandle, path_value: &str) -> AppResult<()> {
    let canonical_path = canonicalize_managed_image_path(app_handle, path_value)?;
    std::fs::remove_file(canonical_path)?;
    Ok(())
}

fn strip_data_url_prefix(value: &str) -> &str {
    value
        .split_once(',')
        .map(|(_, content)| content)
        .unwrap_or(value)
}

fn canonicalize_managed_image_path(
    app_handle: &tauri::AppHandle,
    path_value: &str,
) -> AppResult<PathBuf> {
    let path = PathBuf::from(path_value);
    let canonical_path = std::fs::canonicalize(&path)
        .map_err(|e| AppError::message(format!("Referenced image is not available: {e}")))?;

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::message(e.to_string()))?;
    let canonical_app_data_dir =
        std::fs::canonicalize(app_data_dir).map_err(|e| AppError::message(e.to_string()))?;
    let images_dir = canonical_app_data_dir.join("images");
    let source_images_dir = canonical_app_data_dir.join("source-images");

    if canonical_path.starts_with(&images_dir) || canonical_path.starts_with(&source_images_dir) {
        return Ok(canonical_path);
    }

    Err(AppError::message(
        "Referenced image must come from the app image library".to_owned(),
    ))
}

fn extension_for_mime_type(mime_type: &str) -> AppResult<&'static str> {
    match mime_type {
        "image/png" => Ok("png"),
        "image/jpeg" => Ok("jpg"),
        "image/webp" => Ok("webp"),
        _ => Err(AppError::message(
            "source image must be PNG, JPEG, or WebP".to_owned(),
        )),
    }
}

fn mime_type_for_path(path: &std::path::Path) -> AppResult<String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| AppError::message("Referenced image has no file extension".to_owned()))?;

    match extension.as_str() {
        "png" => Ok("image/png".to_owned()),
        "jpg" | "jpeg" => Ok("image/jpeg".to_owned()),
        "webp" => Ok("image/webp".to_owned()),
        _ => Err(AppError::message(
            "Referenced image must be PNG, JPEG, or WebP".to_owned(),
        )),
    }
}
