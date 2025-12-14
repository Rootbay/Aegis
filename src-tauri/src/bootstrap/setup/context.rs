use std::collections::VecDeque;
use std::sync::Arc;
use tauri::{AppHandle, Runtime};
use tokio::sync::{mpsc, Mutex};
use aegis_protocol::AepMessage;
use aegis_shared_types::AppState;
use super::network::NetworkResources;

#[derive(Clone)]
pub struct AppContext<R: Runtime> {
    pub app: AppHandle<R>,
    pub network: NetworkResources,
    pub app_state: AppState,
    pub db_pool: sqlx::Pool<sqlx::Sqlite>,
    pub event_tx: mpsc::Sender<AepMessage>,
    pub outbox: Arc<Mutex<VecDeque<Vec<u8>>>>,
}