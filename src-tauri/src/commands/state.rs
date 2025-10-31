use aegis_shared_types::AppState;
use std::future::Future;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

const STATE_NOT_INITIALIZED: &str =
    "Application state not initialized. Please unlock your identity.";

#[derive(Default)]
pub struct AppStateContainer(pub Arc<Mutex<Option<AppState>>>);

async fn take_state(state_container: &State<'_, AppStateContainer>) -> Result<AppState, String> {
    let guard = state_container.0.lock().await;
    guard
        .as_ref()
        .cloned()
        .ok_or_else(|| STATE_NOT_INITIALIZED.to_string())
}

pub async fn with_state<F, R>(
    state_container: State<'_, AppStateContainer>,
    f: F,
) -> Result<R, String>
where
    F: FnOnce(AppState) -> Result<R, String>,
{
    let state = take_state(&state_container).await?;
    f(state)
}

pub async fn with_state_async<F, Fut, R>(
    state_container: State<'_, AppStateContainer>,
    f: F,
) -> Result<R, String>
where
    F: FnOnce(AppState) -> Fut,
    Fut: Future<Output = Result<R, String>>,
{
    let state = take_state(&state_container).await?;
    f(state).await
}
