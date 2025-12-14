use crate::utils::sanitize_filename;
use aegis_core::services;
use aegis_protocol::AepMessage;
use aegis_shared_types::{AppState, FileTransferMode, IncomingFile};
use aegis_types::AegisError;
use std::convert::TryInto;
use std::fs::{self, File};
use std::io::Write;

const MAX_FILE_SIZE_BYTES: u64 = 1_073_741_824; // 1 GiB
const MAX_INFLIGHT_FILE_BYTES: u64 = 536_870_912; // 512 MiB
const MAX_UNAPPROVED_BUFFER_BYTES: u64 = 8_388_608; // 8 MiB

pub async fn handle_file_message_wrapper(
    message: AepMessage,
    state: AppState,
) -> Result<(), AegisError> {
    match message {
        AepMessage::FileTransferRequest {
            sender_id,
            recipient_id: _,
            file_name,
            file_size,
            encrypted_key,
            nonce,
        } => {
            let map_key = format!("{}:{}", sender_id, file_name);
            let mut incoming_files = state.incoming_files.lock().await;

            if file_size > MAX_FILE_SIZE_BYTES {
                eprintln!(
                    "Rejecting file {} from {}: exceeds maximum size",
                    file_name, sender_id
                );
                return Ok(());
            }

            let safe_name = sanitize_filename(&file_name);
            let incoming_file = IncomingFile {
                name: file_name.clone(),
                size: file_size,
                received_chunks: std::collections::HashMap::new(),
                key: encrypted_key,
                nonce,
                sender_id: sender_id.clone(),
                accepted: false,
                mode: FileTransferMode::Basic,
                staging_path: None,
                metadata_path: None,
                resumed: false,
            };

            incoming_files.insert(map_key, incoming_file);
            println!("Started receiving file {} from {}", safe_name, sender_id);
        }
        AepMessage::FileTransferChunk {
            sender_id,
            recipient_id: _,
            file_name,
            chunk_index,
            data,
        } => {
            let map_key = format!("{}:{}", sender_id, file_name);
            let mut incoming_files = state.incoming_files.lock().await;

            if let Some(incoming_file) = incoming_files.get_mut(&map_key) {
                let chunk_len = data.len() as u64;
                let existing_len = incoming_file
                    .received_chunks
                    .get(&chunk_index)
                    .map(|chunk| chunk.len() as u64)
                    .unwrap_or(0);

                let current_total: u64 = incoming_file
                    .received_chunks
                    .values()
                    .map(|chunk| chunk.len() as u64)
                    .sum();

                let adjusted_total = current_total.saturating_sub(existing_len);
                let new_total = adjusted_total.saturating_add(chunk_len);

                if new_total > incoming_file.size {
                    incoming_files.remove(&map_key);
                    eprintln!(
                        "Dropping transfer {} from {}: exceeded advertised size",
                        file_name, sender_id
                    );
                    return Ok(());
                }

                let inflight_limit = MAX_INFLIGHT_FILE_BYTES.min(incoming_file.size);
                if new_total > inflight_limit {
                    incoming_files.remove(&map_key);
                    eprintln!(
                        "Dropping transfer {} from {}: exceeds inflight buffer limit",
                        file_name, sender_id
                    );
                    return Ok(());
                }

                if !incoming_file.accepted {
                    let unapproved_limit = MAX_UNAPPROVED_BUFFER_BYTES.min(inflight_limit);
                    if new_total > unapproved_limit {
                        incoming_files.remove(&map_key);
                        eprintln!(
                            "Dropping transfer {} from {}: awaiting approval",
                            file_name, sender_id
                        );
                        return Ok(());
                    }
                }

                incoming_file.received_chunks.insert(chunk_index, data);
            } else {
                eprintln!(
                    "Received chunk {} for unknown transfer {} from {}",
                    chunk_index, file_name, sender_id
                );
            }
        }
        AepMessage::FileTransferComplete {
            sender_id,
            recipient_id: _,
            file_name,
        } => {
            let map_key = format!("{}:{}", sender_id, file_name);
            let incoming_file = {
                let mut incoming_files = state.incoming_files.lock().await;
                incoming_files.remove(&map_key)
            };

            if let Some(incoming_file) = incoming_file {
                let safe_name = sanitize_filename(&incoming_file.name);
                if !incoming_file.accepted {
                    eprintln!(
                        "File transfer {} from {} completed but was not approved locally",
                        file_name, sender_id
                    );
                    return Ok(());
                }

                let key: [u8; 32] = incoming_file
                    .key
                    .as_slice()
                    .try_into()
                    .map_err(|_| AegisError::InvalidInput("Invalid symmetric key length".into()))?;
                let nonce: [u8; 12] = incoming_file
                    .nonce
                    .as_slice()
                    .try_into()
                    .map_err(|_| AegisError::InvalidInput("Invalid nonce length".into()))?;

                let mut ordered_chunks: Vec<_> =
                    incoming_file.received_chunks.into_iter().collect();
                ordered_chunks.sort_by_key(|(idx, _)| *idx);

                let mut plaintext = Vec::new();
                for (idx, chunk) in ordered_chunks {
                    let decrypted = services::decrypt_file_chunk(&chunk, &key, &nonce).map_err(
                        |e| {
                            AegisError::Internal(format!(
                                "Failed to decrypt chunk {} for file {}: {}",
                                idx, file_name, e
                            ))
                        },
                    )?;
                    plaintext.extend_from_slice(&decrypted);
                }

                if plaintext.len() as u64 != incoming_file.size {
                    eprintln!(
                        "Reconstructed file {} from {} has size {} but expected {}",
                        file_name,
                        sender_id,
                        plaintext.len(),
                        incoming_file.size
                    );
                }

                let mut target_dir = dirs::data_dir().ok_or_else(|| {
                    AegisError::Internal(
                        "Unable to determine data directory for received files".into(),
                    )
                })?;
                target_dir.push("Aegis");
                target_dir.push("received_files");
                fs::create_dir_all(&target_dir).map_err(|e| {
                    AegisError::Internal(format!(
                        "Failed to prepare receive directory {}: {}",
                        target_dir.display(),
                        e
                    ))
                })?;

                let final_path = target_dir.join(&safe_name);
                let mut outfile = File::create(&final_path).map_err(|e| {
                    AegisError::Internal(format!(
                        "Failed to create file {}: {}",
                        final_path.display(),
                        e
                    ))
                })?;
                outfile.write_all(&plaintext).map_err(|e| {
                    AegisError::Internal(format!(
                        "Failed to write file {}: {}",
                        final_path.display(),
                        e
                    ))
                })?;
                println!(
                    "Saved received file {} from {} to {}",
                    safe_name,
                    sender_id,
                    final_path.display()
                );
            } else {
                eprintln!(
                    "Received completion message for unknown transfer {} from {}",
                    file_name, sender_id
                );
            }
        }
        AepMessage::FileTransferError {
            sender_id,
            recipient_id: _,
            file_name,
            error,
        } => {
            let map_key = format!("{}:{}", sender_id, file_name);
            let mut incoming_files = state.incoming_files.lock().await;
            incoming_files.remove(&map_key);
            eprintln!(
                "File transfer error for file {} from {}: {}",
                file_name, sender_id, error
            );
        }
        _ => {}
    }
    Ok(())
}