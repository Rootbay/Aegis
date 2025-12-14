pub(crate) const MAX_OUTBOX_MESSAGES: usize = 256;
pub(crate) const MAX_FILE_SIZE_BYTES: u64 = 1_073_741_824; // 1 GiB
pub(crate) const MAX_INFLIGHT_FILE_BYTES: u64 = 536_870_912; // 512 MiB
pub(crate) const MAX_UNAPPROVED_BUFFER_BYTES: u64 = 8_388_608; // 8 MiB
pub(crate) const DEFAULT_CHUNK_SIZE: usize = 128 * 1024;
pub(crate) const OUTGOING_STATE_DIR: &str = "outgoing_transfers";
pub(crate) const INCOMING_STATE_DIR: &str = "incoming_transfers";
