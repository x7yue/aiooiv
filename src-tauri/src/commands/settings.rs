use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::{AppError, AppResult};

const SETTINGS_STORE: &str = "settings.json";
const DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub base_url: String,
    pub api_key: String,
}

#[tauri::command]
pub async fn get_settings(app: AppHandle) -> AppResult<AppSettings> {
    read_settings(&app)
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, base_url: String, api_key: String) -> AppResult<()> {
    log::info!("save_settings called");

    let store = app
        .store(SETTINGS_STORE)
        .map_err(|e| AppError::message(e.to_string()))?;

    store.set("base_url", serde_json::json!(base_url));
    store.set("api_key", serde_json::json!(api_key));
    store.save().map_err(|e| AppError::message(e.to_string()))?;

    log::info!("save_settings: store saved successfully");
    Ok(())
}

pub fn read_settings(app: &AppHandle) -> AppResult<AppSettings> {
    let store = app
        .store(SETTINGS_STORE)
        .map_err(|e| AppError::message(e.to_string()))?;

    let base_url = store
        .get("base_url")
        .and_then(|v| v.as_str().map(ToOwned::to_owned))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_BASE_URL.to_owned());

    let api_key = store
        .get("api_key")
        .and_then(|v| v.as_str().map(ToOwned::to_owned))
        .unwrap_or_default();

    log::debug!("read_settings: settings loaded");

    Ok(AppSettings { base_url, api_key })
}
