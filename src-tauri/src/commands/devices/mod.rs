mod approvals;
mod helpers;
mod inventory;
mod management;
mod provisioning;
mod sync;
mod types;

pub use approvals::{approve_device_request, decline_device_request, request_device_link};
pub use inventory::list_trusted_devices;
pub use management::{cancel_device_provisioning, forget_trusted_device, revoke_trusted_device};
pub use provisioning::initiate_device_provisioning;
pub use sync::complete_device_sync;
pub use types::{DeviceInventorySnapshot, DeviceSyncResult};

pub(super) use helpers::{
    create_bundle, ensure_pending, generate_code_phrase, get_app_state, is_expired,
    normalize_phrase, persist_trusted_devices_snapshot, to_state,
};
pub(super) type CommandResult<T> = Result<T, String>;
