use aegis_shared_types::{DeviceProvisioningState, TrustedDeviceRecord};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInventorySnapshot {
    pub trusted_devices: Vec<TrustedDeviceRecord>,
    pub provisioning: Vec<DeviceProvisioningState>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSyncResult {
    pub encrypted_profile: String,
    pub approved_device: TrustedDeviceRecord,
    pub issued_at: String,
    pub message_count: u64,
}
