use std::collections::VecDeque;
use std::sync::Arc;

use tauri::{AppHandle, Runtime, State};
use tokio::sync::{mpsc, Mutex};

use aegis_protocol::AepMessage;

use crate::commands::state::AppStateContainer;
use crate::connectivity::{set_relay_store, spawn_connectivity_task};

use super::directories::{AppDirectories, PersistedSettingsExt};
use super::identity::initialize_identity_state;
use super::network::initialize_network;
use super::state::build_app_state;
use super::swarm::spawn_swarm_processing;
use super::tasks::{spawn_event_dispatcher, spawn_group_key_rotation};

pub(super) async fn initialize_app_state<R: Runtime>(
    app: AppHandle<R>,
    password: &str,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let identity = crate::commands::identity::get_or_create_identity(&app, password)?;

    aep::initialize_aep();

    let network = initialize_network(&identity).await?;
    let directories = AppDirectories::prepare(&app)?;
    let persisted_settings = directories.load_persisted_settings();
    let initial_acl = persisted_settings.initial_file_acl();

    let db_pool = directories.initialize_database().await?;

    let (net_tx, net_rx) = mpsc::channel::<Vec<u8>>(100);
    let (file_tx, file_rx) = mpsc::channel::<aegis_shared_types::FileTransferCommand>(16);
    let (event_tx, event_rx) = mpsc::channel::<AepMessage>(100);
    let outbox: Arc<Mutex<VecDeque<Vec<u8>>>> = Arc::new(Mutex::new(VecDeque::new()));
    let connectivity_snapshot = Arc::new(Mutex::new(None));

    let app_state = build_app_state(
        identity.clone(),
        db_pool.clone(),
        net_tx,
        file_tx,
        directories.data_dir().to_path_buf(),
        initial_acl,
        connectivity_snapshot.clone(),
        &persisted_settings,
    );

    *state_container.0.lock().await = Some(app_state.clone());

    set_relay_store(app_state.relays.clone());

    spawn_connectivity_task(
        app.clone(),
        network.shared_swarm.clone(),
        network.router.clone(),
        identity.peer_id(),
        connectivity_snapshot,
    );

    initialize_identity_state(&identity, &db_pool, &directories, &app_state).await?;

    spawn_event_dispatcher(app.clone(), event_rx);

    spawn_group_key_rotation(
        db_pool.clone(),
        identity.clone(),
        app_state.network_tx.clone(),
    );

    spawn_swarm_processing(
        app, network, app_state, db_pool, net_rx, file_rx, event_tx, outbox,
    );

    Ok(())
}
