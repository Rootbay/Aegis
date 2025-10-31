use aegis_shared_types::{DevicePairingStage, DeviceProvisioningState, PendingDeviceProvisioning};
use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use tauri::State;

use crate::commands::state::AppStateContainer;
use uuid::Uuid;

use super::{create_bundle, generate_code_phrase, get_app_state, normalize_phrase, CommandResult};

#[tauri::command]
pub async fn initiate_device_provisioning(
    display_name: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> CommandResult<DeviceProvisioningState> {
    let state = get_app_state(state_container).await?;

    let bundle_id = Uuid::new_v4().to_string();
    let code_phrase = generate_code_phrase();
    let bundle = create_bundle(&bundle_id, &code_phrase);
    let normalized_code = normalize_phrase(&code_phrase);

    let escrow_cipher = state
        .identity
        .to_encrypted_secret(normalized_code.as_bytes())
        .map_err(|error| error.to_string())?;
    let encrypted = general_purpose::STANDARD_NO_PAD.encode(escrow_cipher);

    let mut pending = state.pending_device_bundles.lock().await;
    let status_message = display_name
        .as_ref()
        .filter(|label| !label.trim().is_empty())
        .map(|label| format!("Provisioning bundle ready for {label}"));
    let record = PendingDeviceProvisioning {
        bundle: bundle.clone(),
        escrow_ciphertext: encrypted,
        stage: DevicePairingStage::BundleIssued,
        requesting_device: None,
        status_message: status_message.clone(),
        code_hash: normalized_code,
    };
    pending.insert(bundle_id.clone(), record);

    Ok(DeviceProvisioningState {
        bundle,
        stage: DevicePairingStage::BundleIssued,
        requesting_device: None,
        status_message: display_name
            .filter(|label| !label.trim().is_empty())
            .map(|label| format!("Share this bundle with {label}")),
    })
}
