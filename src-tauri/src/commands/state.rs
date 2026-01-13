use crate::commands::error::{AppError, AppResult};
use aegis_shared_types::AppState;
use arc_swap::ArcSwapOption;
use std::future::Future;
use std::sync::Arc;
use tauri::State;

#[derive(Default)]
pub struct AppStateContainer(pub ArcSwapOption<AppState>);

fn take_state(state_container: &State<'_, AppStateContainer>) -> AppResult<Arc<AppState>> {
    state_container
        .0
        .load_full()
        .ok_or(AppError::NotInitialized)
}

pub async fn with_state<F, R>(
    state_container: State<'_, AppStateContainer>,
    f: F,
) -> AppResult<R>
where
    F: FnOnce(AppState) -> AppResult<R>,
{
    let state = take_state(&state_container)?;
    // We deref and clone the AppState which is cheap (it's full of Arcs)
    f((*state).clone())
}

pub async fn with_state_async<F, Fut, R>(
    state_container: State<'_, AppStateContainer>,
    f: F,
) -> AppResult<R>
where
    F: FnOnce(AppState) -> Fut,
    Fut: Future<Output = AppResult<R>>,
{
    let state = take_state(&state_container)?;
    f((*state).clone()).await
}
