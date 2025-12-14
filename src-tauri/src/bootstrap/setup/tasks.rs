use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::mpsc::{Receiver, Sender as TokioSender};

use aegis_protocol::AepMessage;
use crypto::identity::Identity;

use super::super::{broadcast_group_key_update, rotate_and_broadcast_group_key};

pub(super) fn spawn_event_dispatcher<R: Runtime>(
    app: AppHandle<R>,
    mut event_rx: Receiver<AepMessage>,
) {
    tokio::spawn(async move {
        while let Some(message) = event_rx.recv().await {
            if let Err(error) = app.emit("new-message", message) {
                eprintln!("Failed to emit new-message event: {}", error);
            }
        }
    });
}

pub(super) fn spawn_group_key_rotation(
    db_pool: sqlx::Pool<sqlx::Sqlite>,
    identity: Identity,
    network_tx: TokioSender<Vec<u8>>,
) {
    tokio::spawn(async move {
        let mut last_rotated: std::collections::HashMap<String, i64> =
            std::collections::HashMap::new();
        let rotation_interval_secs: i64 = 12 * 60 * 60;
        let retry_interval_secs: i64 = 60;

        struct Pending {
            server_id: String,
            channel_id: Option<String>,
            _epoch: u64,
            next_ts: i64,
            retries_left: u8,
        }

        let mut pending: Vec<Pending> = Vec::new();
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));

        loop {
            let _ = interval.tick().await;
            let now = chrono::Utc::now().timestamp();

            let mut remaining: Vec<Pending> = Vec::new();
            for mut item in pending.drain(..) {
                if item.retries_left == 0 || item.next_ts > now {
                    remaining.push(item);
                    continue;
                }

                if let Err(error) = broadcast_group_key_update(
                    &db_pool,
                    identity.clone(),
                    &network_tx,
                    &item.server_id,
                    &item.channel_id,
                )
                .await
                {
                    eprintln!("Retry group key update failed: {}", error);
                }

                item.retries_left -= 1;
                item.next_ts = now + retry_interval_secs;
                remaining.push(item);
            }
            pending = remaining;

            match aep::database::get_all_servers(&db_pool, &identity.peer_id().to_base58()).await {
                Ok(servers) => {
                    for server in servers {
                        if server.owner_id != identity.peer_id().to_base58() {
                            continue;
                        }
                        for channel in server.channels {
                            let gid = format!("{}:{}", server.id, channel.id);
                            let last = last_rotated.get(&gid).cloned().unwrap_or(0);
                            if now - last < rotation_interval_secs {
                                continue;
                            }

                            let epoch = now as u64;
                            match rotate_and_broadcast_group_key(
                                &db_pool,
                                identity.clone(),
                                &network_tx,
                                &server.id,
                                &Some(channel.id.clone()),
                                epoch,
                            )
                            .await
                            {
                                Ok(_) => {
                                    last_rotated.insert(gid, now);
                                    pending.push(Pending {
                                        server_id: server.id.clone(),
                                        channel_id: Some(channel.id),
                                        _epoch: epoch,
                                        next_ts: now + retry_interval_secs,
                                        retries_left: 3,
                                    });
                                }
                                Err(error) => {
                                    eprintln!("Group key rotation failed: {}", error);
                                }
                            }
                        }
                    }
                }
                Err(error) => eprintln!("Failed to load servers for rotation: {}", error),
            }
        }
    });
}
