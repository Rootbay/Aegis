use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

use aegis_shared_types::FileTransferMode;

use super::constants::DEFAULT_CHUNK_SIZE;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, rkyv::Archive, rkyv::Deserialize, rkyv::Serialize, Default)]
#[archive(check_bytes)]
pub(crate) struct OutgoingResilientMetadata {
    pub next_index: u64,
    pub bytes_sent: u64,
    pub chunk_size: usize,
    pub file_size: u64,
    pub safe_filename: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, rkyv::Archive, rkyv::Deserialize, rkyv::Serialize, Default)]
#[archive(check_bytes)]
pub(crate) struct IncomingResilientMetadata {
    pub file_size: u64,
    pub chunk_size: usize,
    pub chunks: HashMap<u64, usize>,
    pub safe_filename: String,
}

pub(crate) fn mode_to_str(mode: FileTransferMode) -> &'static str {
    match mode {
        FileTransferMode::Basic => "basic",
        FileTransferMode::Resilient => "resilient",
    }
}

pub(crate) fn load_outgoing_metadata(path: &Path) -> Result<OutgoingResilientMetadata, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    rkyv::from_bytes(&bytes).map_err(|e| format!("Deserialization error: {:?}", e))
}

pub(crate) fn persist_outgoing_metadata(
    path: &Path,
    metadata: &OutgoingResilientMetadata,
) -> Result<(), String> {
    let bytes = rkyv::to_bytes::<_, 1024>(metadata).map_err(|e| format!("Serialization error: {:?}", e))?;
    std::fs::write(path, &bytes).map_err(|e| e.to_string())
}

#[allow(dead_code)]
pub(crate) fn load_incoming_resilient_chunks(
    meta_path: &Path,
    data_path: &Path,
) -> Result<(IncomingResilientMetadata, HashMap<u64, Vec<u8>>), String> {
    if !meta_path.exists() || !data_path.exists() {
        return Ok((IncomingResilientMetadata::default(), HashMap::new()));
    }

    let bytes = std::fs::read(meta_path).map_err(|e| e.to_string())?;
    let metadata: IncomingResilientMetadata =
        rkyv::from_bytes(&bytes).map_err(|e| format!("Deserialization error: {:?}", e))?;
    let chunk_size = if metadata.chunk_size == 0 {
        DEFAULT_CHUNK_SIZE
    } else {
        metadata.chunk_size
    };

    let mut file = std::fs::File::open(data_path).map_err(|e| e.to_string())?;
    let mut chunks: HashMap<u64, Vec<u8>> = HashMap::new();
    for (index, length) in metadata.chunks.iter() {
        let offset = (*index as u64).saturating_mul(chunk_size as u64);
        file.seek(SeekFrom::Start(offset))
            .map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; *length];
        file.read_exact(&mut buf).map_err(|e| e.to_string())?;
        chunks.insert(*index, buf);
    }

    Ok((metadata, chunks))
}

pub(crate) fn persist_incoming_metadata(
    path: &Path,
    metadata: &IncomingResilientMetadata,
) -> Result<(), String> {
    let bytes = rkyv::to_bytes::<_, 1024>(metadata).map_err(|e| format!("Serialization error: {:?}", e))?;
    std::fs::write(path, &bytes).map_err(|e| e.to_string())
}

pub(crate) fn write_incoming_chunk(path: &Path, index: u64, data: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    let offset = index.saturating_mul(DEFAULT_CHUNK_SIZE as u64);
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| e.to_string())?;
    file.write_all(data).map_err(|e| e.to_string())
}

pub(crate) fn cleanup_incoming_state(
    staging_path: &Option<PathBuf>,
    metadata_path: &Option<PathBuf>,
) {
    if let Some(path) = staging_path {
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
    }
    if let Some(path) = metadata_path {
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
    }
}

pub(crate) fn sanitize_filename(input: &str) -> String {
    let candidate = Path::new(input)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file");

    let mut sanitized = String::with_capacity(candidate.len());
    for ch in candidate.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_' | ' ' | '(' | ')') {
            sanitized.push(ch);
        } else {
            sanitized.push('_');
        }
    }

    while sanitized.starts_with('.') || sanitized.starts_with('_') {
        sanitized.remove(0);
        if sanitized.is_empty() {
            break;
        }
    }

    sanitized.truncate(128);

    if sanitized.is_empty() || sanitized.chars().all(|c| c == '_' || c == '.') {
        format!("file-{}", chrono::Utc::now().timestamp())
    } else {
        sanitized
    }
}
