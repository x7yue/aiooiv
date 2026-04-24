mod commands;
mod services;
mod state;

use serde::Serialize;
use state::app_state::AppState;
use tauri::Manager;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "type", content = "message")]
pub enum AppError {
    #[error("{0}")]
    Message(String),
}

impl AppError {
    pub fn message(message: String) -> Self {
        Self::Message(message)
    }
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        Self::Message(value.to_string())
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(value: rusqlite::Error) -> Self {
        Self::Message(value.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(value: serde_json::Error) -> Self {
        Self::Message(value.to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let conn = services::db::init_db(app.handle())?;
            app.manage(AppState::new(conn));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::tasks::create_task,
            commands::tasks::cancel_task,
            commands::tasks::list_tasks,
            commands::tasks::get_task,
            commands::tasks::delete_task
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
