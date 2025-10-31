use aegis_shared_types::AppState;
use std::future::Future;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

#[derive(Default)]
pub struct AppStateContainer(pub Arc<Mutex<Option<AppState>>>);

pub async fn with_state<F, R>(
    state_container: State<'_, AppStateContainer>,
    f: F,
) -> Result<R, String>
where
    F: FnOnce(AppState) -> Result<R, String>,
{
    let state_guard = state_container.0.lock().await;
    if let Some(state) = state_guard.as_ref() {
        f(state.clone())
    } else {
        Err("Application state not initialized. Please unlock your identity.".to_string())
    }
}

pub async fn with_state_async<F, Fut, R>(
    state_container: State<'_, AppStateContainer>,
    f: F,
) -> Result<R, String>
where
    F: FnOnce(AppState) -> Fut,
    Fut: Future<Output = Result<R, String>>,
{
    let state_guard = state_container.0.lock().await;
    if let Some(state) = state_guard.as_ref() {
        f(state.clone()).await
    } else {
        Err("Application state not initialized. Please unlock your identity.".to_string())
    }
}
