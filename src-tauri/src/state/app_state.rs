use std::{collections::HashMap, sync::Arc};

use rusqlite::Connection;
use tokio::{sync::Mutex, task::JoinHandle};

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<std::sync::Mutex<Connection>>,
    pub running_tasks: Arc<Mutex<HashMap<String, JoinHandle<()>>>>,
}

impl AppState {
    pub fn new(connection: Connection) -> Self {
        Self {
            db: Arc::new(std::sync::Mutex::new(connection)),
            running_tasks: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}
