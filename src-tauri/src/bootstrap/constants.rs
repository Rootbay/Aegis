pub(super) const MAX_OUTBOX_MESSAGES: usize = 256;
pub(super) const MAX_FILE_SIZE_BYTES: u64 = 1_073_741_824; // 1 GiB
pub(super) const MAX_INFLIGHT_FILE_BYTES: u64 = 536_870_912; // 512 MiB
pub(super) const MAX_UNAPPROVED_BUFFER_BYTES: u64 = 8_388_608; // 8 MiB
pub(super) const DEFAULT_CHUNK_SIZE: usize = 128 * 1024;
pub(super) const OUTGOING_STATE_DIR: &str = "outgoing_transfers";
pub(super) const INCOMING_STATE_DIR: &str = "incoming_transfers";
