use crate::commands::state::AppStateContainer;
use aegis_protocol::EncryptedDmSlot;
use aegis_protocol::{
    AepMessage, DeleteMessageData, MessageDeletionScope, MessageEditData, MessageReactionData,
    ReactionAction, ReadReceiptData, TypingIndicatorData,
};
use aegis_shared_types::AppState;
use aep::database;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::ChaCha20Poly1305;
use chrono::Utc;
use e2ee;
use futures::StreamExt;
use once_cell::sync::Lazy;
use rand::RngCore;
use reqwest::{
    header::{self, HeaderValue, CONTENT_TYPE},
    redirect::Policy,
    Client, Url,
};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{path::BaseDirectory, AppHandle, State};
use tokio::{fs, sync::OnceCell};
use tracing::warn;

const ENVELOPE_VERSION: u8 = 1;
const ENVELOPE_ALGORITHM: &str = "chacha20poly1305";

const MAX_HTML_BYTES: usize = 512 * 1024;
const MAX_TEXT_LENGTH: usize = 280;
const MAX_CACHE_ENTRIES: usize = 128;
const LINK_PREVIEW_CACHE_FILE: &str = "link-previews.json";

static LINK_PREVIEW_HTTP_CLIENT: Lazy<Client> = Lazy::new(|| {
    let mut headers = header::HeaderMap::new();
    headers.insert(
        header::ACCEPT,
        HeaderValue::from_static("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
    );
    headers.insert(
        header::ACCEPT_LANGUAGE,
        HeaderValue::from_static("en-US,en;q=0.9"),
    );

    Client::builder()
        .default_headers(headers)
        .user_agent("AegisLinkPreview/1.0")
        .redirect(Policy::limited(5))
        .timeout(Duration::from_secs(10))
        .build()
        .expect("failed to build link preview HTTP client")
});

static LINK_PREVIEW_MEMORY_CACHE: Lazy<
    tokio::sync::Mutex<HashMap<String, Option<LinkPreviewMetadata>>>,
> = Lazy::new(|| tokio::sync::Mutex::new(HashMap::new()));

static LINK_PREVIEW_CACHE_LOADED: OnceCell<()> = OnceCell::const_new();

static OG_TITLE_SELECTOR: Lazy<Selector> =
    Lazy::new(|| Selector::parse(r#"meta[property="og:title"]"#).unwrap());
static TWITTER_TITLE_SELECTOR: Lazy<Selector> =
    Lazy::new(|| Selector::parse(r#"meta[name="twitter:title"]"#).unwrap());
static TITLE_SELECTOR: Lazy<Selector> = Lazy::new(|| Selector::parse("title").unwrap());
static OG_DESCRIPTION_SELECTOR: Lazy<Selector> =
    Lazy::new(|| Selector::parse(r#"meta[property="og:description"]"#).unwrap());
static DESCRIPTION_SELECTOR: Lazy<Selector> =
    Lazy::new(|| Selector::parse(r#"meta[name="description"]"#).unwrap());
static TWITTER_DESCRIPTION_SELECTOR: Lazy<Selector> =
    Lazy::new(|| Selector::parse(r#"meta[name="twitter:description"]"#).unwrap());
static OG_IMAGE_SELECTOR: Lazy<Selector> =
    Lazy::new(|| Selector::parse(r#"meta[property="og:image"]"#).unwrap());
static OG_IMAGE_SECURE_SELECTOR: Lazy<Selector> =
    Lazy::new(|| Selector::parse(r#"meta[property="og:image:secure_url"]"#).unwrap());
static TWITTER_IMAGE_SELECTOR: Lazy<Selector> =
    Lazy::new(|| Selector::parse(r#"meta[name="twitter:image"]"#).unwrap());
static OG_SITE_NAME_SELECTOR: Lazy<Selector> =
    Lazy::new(|| Selector::parse(r#"meta[property="og:site_name"]"#).unwrap());
static OG_URL_SELECTOR: Lazy<Selector> =
    Lazy::new(|| Selector::parse(r#"meta[property="og:url"]"#).unwrap());
static ICON_SELECTOR: Lazy<Selector> =
    Lazy::new(|| Selector::parse(r#"link[rel~="icon"]"#).unwrap());
static APPLE_ICON_SELECTOR: Lazy<Selector> =
    Lazy::new(|| Selector::parse(r#"link[rel="apple-touch-icon"]"#).unwrap());

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentDescriptor {
    pub name: String,
    #[serde(rename = "type")]
    pub content_type: Option<String>,
    pub size: u64,
    #[serde(with = "serde_bytes")]
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedDmPayload {
    pub content: String,
    pub attachments: Vec<AttachmentDescriptor>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to_message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_snapshot_author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_snapshot_snippet: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct MessageEnvelope {
    version: u8,
    algorithm: String,
    nonce: String,
    key: String,
    ciphertext: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct AttachmentEnvelope {
    version: u8,
    algorithm: String,
    nonce: String,
    key: String,
    ciphertext: String,
    original_size: u64,
}

fn is_voice_memo_attachment(descriptor: &AttachmentDescriptor) -> bool {
    descriptor
        .content_type
        .as_deref()
        .map(|value| value.starts_with("audio/"))
        .unwrap_or(false)
        && descriptor.name.starts_with("voice-message-")
}

#[derive(Debug, Serialize)]
pub struct EncryptChatPayloadResponse {
    pub content: String,
    pub attachments: Vec<AttachmentDescriptor>,
    pub metadata: EncryptMetadata,
    #[serde(rename = "wasEncrypted")]
    pub was_encrypted: bool,
}

#[derive(Debug, Serialize)]
pub struct EncryptMetadata {
    pub algorithm: String,
    pub version: u8,
}

#[derive(Debug, Serialize)]
pub struct DecryptChatPayloadResponse {
    pub content: String,
    pub attachments: Vec<AttachmentDescriptor>,
    #[serde(rename = "wasEncrypted")]
    pub was_encrypted: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct ReadReceiptEventPayload {
    #[serde(rename = "chatId")]
    pub chat_id: String,
    #[serde(rename = "messageId")]
    pub message_id: String,
    #[serde(rename = "readerId")]
    pub reader_id: String,
    pub timestamp: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct TypingIndicatorEventPayload {
    #[serde(rename = "chatId")]
    pub chat_id: String,
    #[serde(rename = "userId")]
    pub user_id: String,
    #[serde(rename = "isTyping")]
    pub is_typing: bool,
    pub timestamp: String,
}

/// Metadata describing a resolved link preview in the format expected by the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkPreviewMetadata {
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub site_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
}

async fn ensure_link_preview_cache_loaded(cache_path: Option<PathBuf>) {
    LINK_PREVIEW_CACHE_LOADED
        .get_or_init(|| async move {
            if let Some(path) = cache_path {
                let cache = load_link_preview_cache(&path).await;
                if !cache.is_empty() {
                    let mut guard = LINK_PREVIEW_MEMORY_CACHE.lock().await;
                    guard.extend(cache);
                }
            }
        })
        .await;
}

async fn load_link_preview_cache(path: &Path) -> HashMap<String, Option<LinkPreviewMetadata>> {
    match fs::read_to_string(path).await {
        Ok(content) => {
            match serde_json::from_str::<HashMap<String, Option<LinkPreviewMetadata>>>(&content) {
                Ok(cache) => cache,
                Err(error) => {
                    warn!(
                        "[link_previews] Failed to parse cache at {}: {}",
                        path.display(),
                        error
                    );
                    HashMap::new()
                }
            }
        }
        Err(error) => {
            if error.kind() != ErrorKind::NotFound {
                warn!(
                    "[link_previews] Failed to read cache at {}: {}",
                    path.display(),
                    error
                );
            }
            HashMap::new()
        }
    }
}

async fn persist_link_preview_cache(
    path: &Path,
    cache: &HashMap<String, Option<LinkPreviewMetadata>>,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|error| format!("failed to prepare cache directory: {error}"))?;
    }

    let payload = serde_json::to_string_pretty(cache)
        .map_err(|error| format!("failed to serialize link preview cache: {error}"))?;

    fs::write(path, payload)
        .await
        .map_err(|error| format!("failed to write link preview cache: {error}"))
}

fn sanitize_text(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut sanitized = String::new();
    let mut count = 0usize;
    for ch in trimmed.chars() {
        let normalized = match ch {
            '\r' | '\n' | '\t' => ' ',
            c if c.is_control() && !c.is_whitespace() => continue,
            c => c,
        };
        sanitized.push(normalized);
        count += 1;
        if count >= MAX_TEXT_LENGTH {
            break;
        }
    }

    let mut collapsed = sanitized.split_whitespace().collect::<Vec<_>>().join(" ");

    if collapsed.chars().count() > MAX_TEXT_LENGTH {
        collapsed = collapsed.chars().take(MAX_TEXT_LENGTH).collect();
    }

    if collapsed.is_empty() {
        None
    } else {
        Some(collapsed)
    }
}

fn sanitize_url_value(base_url: &Url, value: Option<&str>) -> Option<String> {
    let raw = value?.trim();
    if raw.is_empty() {
        return None;
    }

    let candidate = if raw.starts_with("//") {
        format!("{}:{}", base_url.scheme(), raw)
    } else {
        raw.to_string()
    };

    let resolved = Url::parse(&candidate)
        .or_else(|_| base_url.join(&candidate))
        .ok()?;

    match resolved.scheme() {
        "http" | "https" => Some(resolved.to_string()),
        _ => None,
    }
}

fn sanitize_meta_text(document: &Html, selector: &Selector) -> Option<String> {
    document
        .select(selector)
        .find_map(|element| element.value().attr("content"))
        .and_then(sanitize_text)
}

fn sanitize_meta_url(document: &Html, base_url: &Url, selector: &Selector) -> Option<String> {
    document
        .select(selector)
        .find_map(|element| element.value().attr("content"))
        .and_then(|value| sanitize_url_value(base_url, Some(value)))
}

fn collect_icon_url(document: &Html, base_url: &Url) -> Option<String> {
    for element in document
        .select(&ICON_SELECTOR)
        .chain(document.select(&APPLE_ICON_SELECTOR))
    {
        if let Some(href) = element.value().attr("href") {
            if let Some(url) = sanitize_url_value(base_url, Some(href)) {
                return Some(url);
            }
        }
    }

    None
}

fn extract_link_preview_metadata(document: &Html, base_url: &Url) -> LinkPreviewMetadata {
    let mut metadata = LinkPreviewMetadata {
        url: base_url.to_string(),
        title: None,
        description: None,
        image_url: None,
        site_name: None,
        icon_url: None,
    };

    if let Some(canonical) = sanitize_meta_url(document, base_url, &OG_URL_SELECTOR) {
        metadata.url = canonical;
    }

    metadata.title = sanitize_meta_text(document, &OG_TITLE_SELECTOR)
        .or_else(|| sanitize_meta_text(document, &TWITTER_TITLE_SELECTOR))
        .or_else(|| {
            document
                .select(&TITLE_SELECTOR)
                .next()
                .map(|element| element.text().collect::<Vec<_>>().join(" "))
                .and_then(|text| sanitize_text(&text))
        });

    metadata.description = sanitize_meta_text(document, &OG_DESCRIPTION_SELECTOR)
        .or_else(|| sanitize_meta_text(document, &DESCRIPTION_SELECTOR))
        .or_else(|| sanitize_meta_text(document, &TWITTER_DESCRIPTION_SELECTOR));

    metadata.image_url = sanitize_meta_url(document, base_url, &OG_IMAGE_SELECTOR)
        .or_else(|| sanitize_meta_url(document, base_url, &OG_IMAGE_SECURE_SELECTOR))
        .or_else(|| sanitize_meta_url(document, base_url, &TWITTER_IMAGE_SELECTOR));

    metadata.site_name = sanitize_meta_text(document, &OG_SITE_NAME_SELECTOR)
        .or_else(|| base_url.domain().and_then(sanitize_text));

    metadata.icon_url = collect_icon_url(document, base_url);

    metadata
}

async fn fetch_link_preview(url: &Url) -> Result<Option<LinkPreviewMetadata>, String> {
    let response = LINK_PREVIEW_HTTP_CLIENT
        .get(url.clone())
        .send()
        .await
        .map_err(|error| format!("failed to request preview: {error}"))?;

    if !response.status().is_success() {
        return Ok(None);
    }

    if let Some(content_type) = response.headers().get(CONTENT_TYPE) {
        if let Ok(content_type) = content_type.to_str() {
            if !content_type.contains("text/html") && !content_type.contains("application/xhtml") {
                return Ok(None);
            }
        }
    }

    let mut body = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("failed to read preview body: {error}"))?;
        if body.len() + chunk.len() > MAX_HTML_BYTES {
            let remaining = MAX_HTML_BYTES.saturating_sub(body.len());
            body.extend_from_slice(&chunk[..remaining]);
            break;
        } else {
            body.extend_from_slice(&chunk);
        }
    }

    if body.is_empty() {
        return Ok(None);
    }

    let html = String::from_utf8_lossy(&body);
    let document = Html::parse_document(&html);
    let metadata = extract_link_preview_metadata(&document, url);

    if metadata.title.is_none()
        && metadata.description.is_none()
        && metadata.image_url.is_none()
        && metadata.icon_url.is_none()
    {
        return Ok(None);
    }

    Ok(Some(metadata))
}

/// Resolve rich preview metadata for a HTTP(S) link.
///
/// * `app` - Handle used to resolve the cache directory for persisted previews.
/// * `url` - The HTTP or HTTPS URL to inspect for Open Graph/Twitter metadata.
///
/// Returns `Some(LinkPreviewMetadata)` when the preview is successfully resolved or `None`
/// when the URL is invalid, unsupported, or the metadata could not be extracted.
#[tauri::command]
pub async fn resolve_link_preview(
    app: AppHandle,
    url: String,
) -> Result<Option<LinkPreviewMetadata>, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let parsed = match Url::parse(trimmed) {
        Ok(parsed) => parsed,
        Err(error) => {
            warn!(
                "[link_previews] Ignoring invalid URL {}: {}",
                trimmed, error
            );
            return Ok(None);
        }
    };

    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Ok(None);
    }

    let normalized = parsed.to_string();

    let cache_path = match app
        .path()
        .resolve(LINK_PREVIEW_CACHE_FILE, BaseDirectory::AppCache)
    {
        Ok(path) => Some(path),
        Err(error) => {
            warn!(
                "[link_previews] Failed to resolve cache directory: {}",
                error
            );
            None
        }
    };

    ensure_link_preview_cache_loaded(cache_path.clone()).await;

    if let Some(cached) = {
        let cache = LINK_PREVIEW_MEMORY_CACHE.lock().await;
        cache.get(&normalized).cloned()
    } {
        return Ok(cached);
    }

    let preview = match fetch_link_preview(&parsed).await {
        Ok(result) => result,
        Err(error) => {
            warn!(
                "[link_previews] Failed to fetch metadata for {}: {}",
                normalized, error
            );
            None
        }
    };

    let snapshot_for_disk = {
        let mut cache = LINK_PREVIEW_MEMORY_CACHE.lock().await;
        if cache.len() >= MAX_CACHE_ENTRIES {
            if let Some(key_to_remove) = cache.keys().next().cloned() {
                cache.remove(&key_to_remove);
            }
        }
        cache.insert(normalized.clone(), preview.clone());
        if cache_path.is_some() {
            Some(cache.clone())
        } else {
            None
        }
    };

    if let (Some(path), Some(snapshot)) = (cache_path.as_ref(), snapshot_for_disk) {
        if let Err(error) = persist_link_preview_cache(path.as_path(), &snapshot).await {
            warn!(
                "[link_previews] Failed to persist cache at {}: {}",
                path.display(),
                error
            );
        }
    }

    Ok(preview)
}

async fn broadcast_read_receipt(
    state: AppState,
    chat_id: String,
    message_id: String,
) -> Result<(), String> {
    let reader_id = state.identity.peer_id().to_base58();
    let timestamp = Utc::now();
    let receipt = ReadReceiptData {
        chat_id: chat_id.clone(),
        message_id: message_id.clone(),
        reader_id: reader_id.clone(),
        timestamp,
    };

    let receipt_bytes = bincode::serialize(&receipt).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&receipt_bytes)
        .map_err(|e| e.to_string())?;

    let message = AepMessage::ReadReceipt {
        chat_id,
        message_id,
        reader_id,
        timestamp,
        signature: Some(signature),
    };

    let serialized = bincode::serialize(&message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized)
        .await
        .map_err(|e| e.to_string())
}

async fn broadcast_typing_indicator(
    state: AppState,
    chat_id: String,
    is_typing: bool,
) -> Result<(), String> {
    let user_id = state.identity.peer_id().to_base58();
    let timestamp = Utc::now();
    let indicator = TypingIndicatorData {
        chat_id: chat_id.clone(),
        user_id: user_id.clone(),
        is_typing,
        timestamp,
    };

    let indicator_bytes = bincode::serialize(&indicator).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&indicator_bytes)
        .map_err(|e| e.to_string())?;

    let message = AepMessage::TypingIndicator {
        chat_id,
        user_id,
        is_typing,
        timestamp,
        signature: Some(signature),
    };

    let serialized = bincode::serialize(&message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized)
        .await
        .map_err(|e| e.to_string())
}

fn encrypt_bytes(data: &[u8]) -> Result<(Vec<u8>, Vec<u8>, Vec<u8>), String> {
    let mut key = [0u8; 32];
    rand::rngs::OsRng
        .try_fill_bytes(&mut key)
        .map_err(|e| format!("Failed to generate key: {e}"))?;
    let cipher = ChaCha20Poly1305::new_from_slice(&key)
        .map_err(|e| format!("Failed to initialise cipher: {e}"))?;
    let mut nonce = [0u8; 12];
    rand::rngs::OsRng
        .try_fill_bytes(&mut nonce)
        .map_err(|e| format!("Failed to generate nonce: {e}"))?;
    let ciphertext = cipher
        .encrypt(chacha20poly1305::Nonce::from_slice(&nonce), data)
        .map_err(|e| format!("Encryption error: {e}"))?;
    Ok((ciphertext, key.to_vec(), nonce.to_vec()))
}

fn decrypt_bytes(ciphertext: &[u8], key: &[u8], nonce: &[u8]) -> Result<Vec<u8>, String> {
    if key.len() != 32 {
        return Err("Invalid key length".to_string());
    }
    if nonce.len() != 12 {
        return Err("Invalid nonce length".to_string());
    }
    let cipher = ChaCha20Poly1305::new_from_slice(key)
        .map_err(|e| format!("Failed to initialise cipher: {e}"))?;
    cipher
        .decrypt(chacha20poly1305::Nonce::from_slice(nonce), ciphertext)
        .map_err(|_| "Failed to decrypt payload".to_string())
}

fn serialize_message_envelope(
    ciphertext: Vec<u8>,
    key: Vec<u8>,
    nonce: Vec<u8>,
) -> Result<String, String> {
    let envelope = MessageEnvelope {
        version: ENVELOPE_VERSION,
        algorithm: ENVELOPE_ALGORITHM.to_string(),
        nonce: BASE64.encode(&nonce),
        key: BASE64.encode(&key),
        ciphertext: BASE64.encode(&ciphertext),
    };
    serde_json::to_string(&envelope).map_err(|e| format!("Failed to serialize envelope: {e}"))
}

fn serialize_attachment_envelope(
    ciphertext: Vec<u8>,
    key: Vec<u8>,
    nonce: Vec<u8>,
    original_size: u64,
) -> Result<Vec<u8>, String> {
    let envelope = AttachmentEnvelope {
        version: ENVELOPE_VERSION,
        algorithm: ENVELOPE_ALGORITHM.to_string(),
        nonce: BASE64.encode(&nonce),
        key: BASE64.encode(&key),
        ciphertext: BASE64.encode(&ciphertext),
        original_size,
    };
    serde_json::to_vec(&envelope)
        .map_err(|e| format!("Failed to serialize attachment envelope: {e}"))
}

fn deserialize_message_envelope(content: &str) -> Result<Option<MessageEnvelope>, String> {
    if content.trim().is_empty() {
        return Ok(None);
    }
    match serde_json::from_str::<MessageEnvelope>(content) {
        Ok(env) if env.version == ENVELOPE_VERSION => Ok(Some(env)),
        Ok(_) => Ok(None),
        Err(_) => Ok(None),
    }
}

fn deserialize_attachment_envelope(data: &[u8]) -> Option<AttachmentEnvelope> {
    serde_json::from_slice::<AttachmentEnvelope>(data)
        .ok()
        .filter(|env| env.version == ENVELOPE_VERSION)
}

fn parse_optional_datetime(input: Option<String>) -> Result<Option<chrono::DateTime<Utc>>, String> {
    match input {
        Some(value) => {
            let parsed = chrono::DateTime::parse_from_rfc3339(&value)
                .map_err(|e| format!("Invalid expires_at timestamp: {e}"))?;
            Ok(Some(parsed.with_timezone(&chrono::Utc)))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn encrypt_chat_payload(
    content: String,
    attachments: Vec<AttachmentDescriptor>,
) -> Result<EncryptChatPayloadResponse, String> {
    let (ciphertext, key, nonce) = encrypt_bytes(content.as_bytes())?;
    let serialized_content = serialize_message_envelope(ciphertext, key, nonce)?;

    let mut encrypted_attachments = Vec::new();
    for descriptor in attachments.into_iter() {
        let AttachmentDescriptor {
            name,
            content_type,
            size,
            data,
        } = descriptor;

        if data.is_empty() {
            return Err(format!("Attachment '{name}' is missing binary data"));
        }

        let effective_size = if size == 0 { data.len() as u64 } else { size };
        let sanitized_size = if effective_size == data.len() as u64 {
            effective_size
        } else {
            data.len() as u64
        };

        let (attachment_ciphertext, key, nonce) = encrypt_bytes(&data)?;
        let envelope_bytes =
            serialize_attachment_envelope(attachment_ciphertext, key, nonce, sanitized_size)?;

        encrypted_attachments.push(AttachmentDescriptor {
            name,
            content_type,
            size: sanitized_size,
            data: envelope_bytes,
        });
    }

    Ok(EncryptChatPayloadResponse {
        content: serialized_content,
        attachments: encrypted_attachments,
        metadata: EncryptMetadata {
            algorithm: ENVELOPE_ALGORITHM.to_string(),
            version: ENVELOPE_VERSION,
        },
        was_encrypted: true,
    })
}

#[tauri::command]
pub async fn decrypt_chat_payload(
    content: String,
    attachments: Option<Vec<AttachmentDescriptor>>,
) -> Result<DecryptChatPayloadResponse, String> {
    let mut decrypted_content = content.clone();
    let mut any_decrypted = false;

    if let Some(envelope) = deserialize_message_envelope(&content)? {
        if let (Ok(ciphertext), Ok(key), Ok(nonce)) = (
            BASE64.decode(envelope.ciphertext),
            BASE64.decode(envelope.key),
            BASE64.decode(envelope.nonce),
        ) {
            if let Ok(bytes) = decrypt_bytes(&ciphertext, &key, &nonce) {
                if let Ok(text) = String::from_utf8(bytes) {
                    decrypted_content = text;
                    any_decrypted = true;
                }
            }
        }
    }

    let mut decrypted_attachments = Vec::new();
    if let Some(items) = attachments {
        for descriptor in items.into_iter() {
            let AttachmentDescriptor {
                name,
                content_type,
                size,
                data,
            } = descriptor;

            if data.is_empty() {
                decrypted_attachments.push(AttachmentDescriptor {
                    name,
                    content_type,
                    size,
                    data,
                });
                continue;
            }

            if let Some(env) = deserialize_attachment_envelope(&data) {
                if let (Ok(ciphertext), Ok(key), Ok(nonce)) = (
                    BASE64.decode(env.ciphertext),
                    BASE64.decode(env.key),
                    BASE64.decode(env.nonce),
                ) {
                    if let Ok(bytes) = decrypt_bytes(&ciphertext, &key, &nonce) {
                        decrypted_attachments.push(AttachmentDescriptor {
                            name,
                            content_type,
                            size: env.original_size,
                            data: bytes,
                        });
                        any_decrypted = true;
                        continue;
                    }
                }
            }

            decrypted_attachments.push(AttachmentDescriptor {
                name,
                content_type,
                size,
                data,
            });
        }
    }

    Ok(DecryptChatPayloadResponse {
        content: decrypted_content,
        attachments: decrypted_attachments,
        was_encrypted: any_decrypted,
    })
}

async fn persist_and_broadcast_message(
    state: AppState,
    message: String,
    attachments: Vec<AttachmentDescriptor>,
    conversation_id: Option<String>,
    channel_id: Option<String>,
    server_id: Option<String>,
    reply_to_message_id: Option<String>,
    reply_snapshot_author: Option<String>,
    reply_snapshot_snippet: Option<String>,
    expires_at: Option<chrono::DateTime<Utc>>,
) -> Result<(), String> {
    let peer_id = state.identity.peer_id().to_base58();

    let chat_id_local = conversation_id
        .clone()
        .or_else(|| channel_id.clone())
        .or_else(|| server_id.clone())
        .unwrap_or_else(|| peer_id.clone());

    let payload_conversation_id = Some(chat_id_local.clone());

    let message_id = uuid::Uuid::new_v4().to_string();
    let timestamp = chrono::Utc::now();

    let mut db_attachments = Vec::new();
    let mut protocol_attachments = Vec::new();

    let voice_memos_enabled = state.voice_memos_enabled.load(Ordering::Relaxed);
    if !voice_memos_enabled && attachments.iter().any(is_voice_memo_attachment) {
        return Err("Voice memo attachments are disabled by your settings.".to_string());
    }

    for descriptor in attachments {
        let AttachmentDescriptor {
            name,
            content_type,
            size,
            data,
        } = descriptor;
        if data.is_empty() {
            return Err(format!("Attachment '{name}' is missing binary data"));
        }

        let attachment_id = uuid::Uuid::new_v4().to_string();
        let data_len = data.len() as u64;
        let effective_size = if size == 0 { data_len } else { size };
        let sanitized_size = if effective_size == data_len {
            effective_size
        } else {
            data_len
        };

        db_attachments.push(database::Attachment {
            id: attachment_id.clone(),
            message_id: message_id.clone(),
            name: name.clone(),
            content_type: content_type.clone(),
            size: sanitized_size,
            data: Some(data.clone()),
        });

        protocol_attachments.push(aegis_protocol::AttachmentPayload {
            id: attachment_id,
            name,
            content_type,
            size: sanitized_size,
            data,
        });
    }

    let new_local_message = database::Message {
        id: message_id.clone(),
        chat_id: chat_id_local,
        sender_id: peer_id.clone(),
        content: message.clone(),
        timestamp: timestamp,
        read: false,
        pinned: false,
        attachments: db_attachments,
        reactions: HashMap::new(),
        reply_to_message_id: reply_to_message_id.clone(),
        reply_snapshot_author: reply_snapshot_author.clone(),
        reply_snapshot_snippet: reply_snapshot_snippet.clone(),
        edited_at: None,
        edited_by: None,
        expires_at: expires_at.clone(),
    };
    database::insert_message(&state.db_pool, &new_local_message)
        .await
        .map_err(|e| e.to_string())?;

    let chat_message_data = aegis_protocol::ChatMessageData {
        id: message_id.clone(),
        timestamp: new_local_message.timestamp.clone(),
        sender: peer_id.clone(),
        content: message.clone(),
        channel_id: channel_id.clone(),
        server_id: server_id.clone(),
        conversation_id: payload_conversation_id.clone(),
        attachments: protocol_attachments.clone(),
        expires_at: expires_at.clone(),
        reply_to_message_id: reply_to_message_id.clone(),
        reply_snapshot_author: reply_snapshot_author.clone(),
        reply_snapshot_snippet: reply_snapshot_snippet.clone(),
    };
    let chat_message_bytes = bincode::serialize(&chat_message_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&chat_message_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::ChatMessage {
        id: message_id,
        timestamp: new_local_message.timestamp,
        sender: peer_id,
        content: message,
        channel_id,
        server_id,
        conversation_id: payload_conversation_id,
        attachments: protocol_attachments,
        expires_at,
        reply_to_message_id,
        reply_snapshot_author,
        reply_snapshot_snippet,
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())
}

async fn delete_message_internal(
    state: AppState,
    chat_id: String,
    message_id: String,
    scope: MessageDeletionScope,
) -> Result<(), String> {
    let my_id = state.identity.peer_id().to_base58();

    let metadata = database::get_message_metadata(&state.db_pool, &message_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Message not found".to_string())?;

    if metadata.chat_id != chat_id {
        return Err("Message does not belong to the provided chat".to_string());
    }

    if metadata.sender_id != my_id {
        return Err("You can only delete messages that you sent".to_string());
    }

    database::delete_message(&state.db_pool, &message_id)
        .await
        .map_err(|e| e.to_string())?;

    let deletion_payload = DeleteMessageData {
        message_id: message_id.clone(),
        chat_id: chat_id.clone(),
        initiator_id: my_id.clone(),
        scope: scope.clone(),
    };
    let deletion_bytes = bincode::serialize(&deletion_payload).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&deletion_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::DeleteMessage {
        message_id,
        chat_id,
        initiator_id: my_id,
        scope,
        signature: Some(signature),
    };
    let serialized = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized)
        .await
        .map_err(|e| e.to_string())
}

async fn edit_message_internal(
    state: AppState,
    chat_id: String,
    message_id: String,
    new_content: String,
) -> Result<(), String> {
    let trimmed = new_content.trim();
    if trimmed.is_empty() {
        return Err("Message content cannot be empty".to_string());
    }

    let my_id = state.identity.peer_id().to_base58();

    let metadata = database::get_message_metadata(&state.db_pool, &message_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Message not found".to_string())?;

    if metadata.chat_id != chat_id {
        return Err("Message does not belong to the provided chat".to_string());
    }

    if metadata.sender_id != my_id {
        return Err("You can only edit messages that you sent".to_string());
    }

    let edited_at = chrono::Utc::now();

    database::update_message_content(&state.db_pool, &message_id, trimmed, edited_at, &my_id)
        .await
        .map_err(|e| e.to_string())?;

    let edit_payload = MessageEditData {
        message_id: message_id.clone(),
        chat_id: chat_id.clone(),
        editor_id: my_id.clone(),
        new_content: trimmed.to_string(),
        edited_at,
    };
    let edit_bytes = bincode::serialize(&edit_payload).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&edit_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::EditMessage {
        message_id,
        chat_id,
        editor_id: my_id,
        new_content: trimmed.to_string(),
        edited_at,
        signature: Some(signature),
    };
    let serialized = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_message(
    message: String,
    channel_id: Option<String>,
    server_id: Option<String>,
    reply_to_message_id: Option<String>,
    reply_snapshot_author: Option<String>,
    reply_snapshot_snippet: Option<String>,
    expires_at: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();

    let expires_at = parse_optional_datetime(expires_at)?;

    persist_and_broadcast_message(
        state,
        message,
        Vec::new(),
        None,
        channel_id,
        server_id,
        reply_to_message_id,
        reply_snapshot_author,
        reply_snapshot_snippet,
        expires_at,
    )
    .await
}

#[tauri::command]
pub async fn send_message_with_attachments(
    message: String,
    attachments: Vec<AttachmentDescriptor>,
    channel_id: Option<String>,
    server_id: Option<String>,
    reply_to_message_id: Option<String>,
    reply_snapshot_author: Option<String>,
    reply_snapshot_snippet: Option<String>,
    expires_at: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();

    let expires_at = parse_optional_datetime(expires_at)?;

    persist_and_broadcast_message(
        state,
        message,
        attachments,
        None,
        channel_id,
        server_id,
        reply_to_message_id,
        reply_snapshot_author,
        reply_snapshot_snippet,
        expires_at,
    )
    .await
}

#[tauri::command]
pub async fn send_direct_message(
    recipient_id: String,
    message: String,
    reply_to_message_id: Option<String>,
    reply_snapshot_author: Option<String>,
    reply_snapshot_snippet: Option<String>,
    expires_at: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();

    let expires_at = parse_optional_datetime(expires_at)?;

    persist_and_broadcast_message(
        state,
        message,
        Vec::new(),
        Some(recipient_id),
        None,
        None,
        reply_to_message_id,
        reply_snapshot_author,
        reply_snapshot_snippet,
        expires_at,
    )
    .await
}

#[tauri::command]
pub async fn send_direct_message_with_attachments(
    recipient_id: String,
    message: String,
    attachments: Vec<AttachmentDescriptor>,
    reply_to_message_id: Option<String>,
    reply_snapshot_author: Option<String>,
    reply_snapshot_snippet: Option<String>,
    expires_at: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();

    let expires_at = parse_optional_datetime(expires_at)?;

    persist_and_broadcast_message(
        state,
        message,
        attachments,
        Some(recipient_id),
        None,
        None,
        reply_to_message_id,
        reply_snapshot_author,
        reply_snapshot_snippet,
        expires_at,
    )
    .await
}

#[tauri::command]
pub async fn get_messages(
    chat_id: String,
    limit: i64,
    offset: i64,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<database::Message>, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?;
    database::get_messages_for_chat(&state.db_pool, &chat_id, limit, offset)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_attachment_bytes(
    attachment_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<u8>, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?;
    database::get_attachment_data(&state.db_pool, &attachment_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pin_message(
    chat_id: String,
    message_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    let metadata = database::get_message_metadata(&state.db_pool, &message_id)
        .await
        .map_err(|e| e.to_string())?;

    let metadata = metadata.ok_or_else(|| "Message not found".to_string())?;
    if metadata.chat_id != chat_id {
        return Err("Message does not belong to the specified chat".to_string());
    }

    let updated = database::set_message_pinned(&state.db_pool, &message_id, true)
        .await
        .map_err(|e| e.to_string())?;

    if !updated {
        return Err("Failed to pin message".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn unpin_message(
    chat_id: String,
    message_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    let metadata = database::get_message_metadata(&state.db_pool, &message_id)
        .await
        .map_err(|e| e.to_string())?;

    let metadata = metadata.ok_or_else(|| "Message not found".to_string())?;
    if metadata.chat_id != chat_id {
        return Err("Message does not belong to the specified chat".to_string());
    }

    let updated = database::set_message_pinned(&state.db_pool, &message_id, false)
        .await
        .map_err(|e| e.to_string())?;

    if !updated {
        return Err("Failed to unpin message".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn edit_message(
    chat_id: String,
    message_id: String,
    content: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    edit_message_internal(state, chat_id, message_id, content).await
}
#[tauri::command]
pub async fn delete_message(
    chat_id: String,
    message_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    delete_message_internal(state, chat_id, message_id, MessageDeletionScope::Everyone).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use aegis_protocol::{AepMessage, ReadReceiptData, TypingIndicatorData};
    use aegis_shared_types::{
        AppState,
        FileAclPolicy,
        IncomingFile,
        PendingDeviceProvisioning,
        TrustedDeviceRecord,
        User,
    };
    use aep::user_service;
    use bs58;
    use chrono::Utc;
    use crypto::identity::Identity;
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use tempfile::tempdir;
    use tokio::sync::Mutex;
    use uuid::Uuid;

    fn build_app_state(identity: Identity, db_pool: sqlx::Pool<sqlx::Sqlite>) -> AppState {
        let (network_tx, _network_rx) = tokio::sync::mpsc::channel(8);
        let (file_cmd_tx, _file_cmd_rx) = tokio::sync::mpsc::channel(8);
        let temp_dir = tempdir().expect("tempdir");
        let app_data_dir = temp_dir.into_path();
        AppState {
            identity,
            network_tx,
            db_pool,
            incoming_files: Arc::new(Mutex::new(HashMap::<String, IncomingFile>::new())),
            file_cmd_tx,
            file_acl_policy: Arc::new(Mutex::new(FileAclPolicy::Everyone)),
            app_data_dir,
            connectivity_snapshot: Arc::new(Mutex::new(None)),
            voice_memos_enabled: Arc::new(AtomicBool::new(true)),
            relays: Arc::new(Mutex::new(Vec::new())),
            trusted_devices: Arc::new(Mutex::new(Vec::<TrustedDeviceRecord>::new())),
            pending_device_bundles: Arc::new(Mutex::new(HashMap::<
                String,
                PendingDeviceProvisioning,
            >::new())),
        }
    }

    #[tokio::test]
    async fn send_read_receipt_is_broadcast_and_signed() {
        let dir = tempdir().expect("tempdir");
        let db_pool = aep::database::initialize_db(dir.path().join("db.sqlite"))
            .await
            .expect("init db");

        let identity = Identity::generate();
        let reader_id = identity.peer_id().to_base58();

        let (network_tx, mut network_rx) = tokio::sync::mpsc::channel(8);
        let (file_cmd_tx, _file_cmd_rx) = tokio::sync::mpsc::channel(8);
        let temp_dir = tempdir().expect("tempdir");
        let app_state = AppState {
            identity: identity.clone(),
            network_tx,
            db_pool,
            incoming_files: Arc::new(Mutex::new(HashMap::<String, IncomingFile>::new())),
            file_cmd_tx,
            file_acl_policy: Arc::new(Mutex::new(FileAclPolicy::Everyone)),
            app_data_dir: temp_dir.into_path(),
            connectivity_snapshot: Arc::new(Mutex::new(None)),
            voice_memos_enabled: Arc::new(AtomicBool::new(true)),
            relays: Arc::new(Mutex::new(Vec::new())),
            trusted_devices: Arc::new(Mutex::new(Vec::<TrustedDeviceRecord>::new())),
            pending_device_bundles: Arc::new(Mutex::new(HashMap::<
                String,
                PendingDeviceProvisioning,
            >::new())),
        };

        let chat_id = "chat-abc".to_string();
        let message_id = "message-xyz".to_string();

        broadcast_read_receipt(app_state, chat_id.clone(), message_id.clone())
            .await
            .expect("receipt broadcast succeeds");

        let raw = network_rx
            .recv()
            .await
            .expect("network channel should receive payload");

        let event: AepMessage = bincode::deserialize(&raw).expect("deserializes AEP");

        match event {
            AepMessage::ReadReceipt {
                chat_id: event_chat_id,
                message_id: event_message_id,
                reader_id: event_reader_id,
                timestamp,
                signature,
            } => {
                assert_eq!(event_chat_id, chat_id);
                assert_eq!(event_message_id, message_id);
                assert_eq!(event_reader_id, reader_id);

                let sig = signature.expect("signature included");
                let data = ReadReceiptData {
                    chat_id: event_chat_id,
                    message_id: event_message_id,
                    reader_id: event_reader_id,
                    timestamp,
                };
                let bytes = bincode::serialize(&data).expect("serialize data");
                let public_key = identity.keypair().public();
                assert!(public_key.verify(&bytes, &sig));
            }
            other => panic!("expected read receipt event, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn send_typing_indicator_is_broadcast_and_signed() {
        let dir = tempdir().expect("tempdir");
        let db_pool = aep::database::initialize_db(dir.path().join("db.sqlite"))
            .await
            .expect("init db");

        let identity = Identity::generate();
        let user_id = identity.peer_id().to_base58();

        let (network_tx, mut network_rx) = tokio::sync::mpsc::channel(8);
        let (file_cmd_tx, _file_cmd_rx) = tokio::sync::mpsc::channel(8);
        let temp_dir = tempdir().expect("tempdir");
        let app_state = AppState {
            identity: identity.clone(),
            network_tx,
            db_pool,
            incoming_files: Arc::new(Mutex::new(HashMap::<String, IncomingFile>::new())),
            file_cmd_tx,
            file_acl_policy: Arc::new(Mutex::new(FileAclPolicy::Everyone)),
            app_data_dir: temp_dir.into_path(),
            connectivity_snapshot: Arc::new(Mutex::new(None)),
            voice_memos_enabled: Arc::new(AtomicBool::new(true)),
            relays: Arc::new(Mutex::new(Vec::new())),
            trusted_devices: Arc::new(Mutex::new(Vec::<TrustedDeviceRecord>::new())),
            pending_device_bundles: Arc::new(Mutex::new(HashMap::<
                String,
                PendingDeviceProvisioning,
            >::new())),
        };

        let chat_id = "chat-typing".to_string();

        broadcast_typing_indicator(app_state, chat_id.clone(), true)
            .await
            .expect("typing indicator broadcast succeeds");

        let raw = network_rx
            .recv()
            .await
            .expect("network channel should receive payload");

        let event: AepMessage = bincode::deserialize(&raw).expect("deserializes AEP");

        match event {
            AepMessage::TypingIndicator {
                chat_id: event_chat_id,
                user_id: event_user_id,
                is_typing,
                timestamp,
                signature,
            } => {
                assert_eq!(event_chat_id, chat_id);
                assert_eq!(event_user_id, user_id);
                assert!(is_typing);

                let sig = signature.expect("signature included");
                let data = TypingIndicatorData {
                    chat_id: event_chat_id,
                    user_id: event_user_id,
                    is_typing,
                    timestamp,
                };
                let bytes = bincode::serialize(&data).expect("serialize data");
                let public_key = identity.keypair().public();
                assert!(public_key.verify(&bytes, &sig));
            }
            other => panic!("expected typing indicator event, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn delete_message_is_broadcast_and_applied() {
        let local_dir = tempdir().expect("tempdir");
        let local_db = aep::database::initialize_db(local_dir.path().join("local.db"))
            .await
            .expect("init db");

        let identity = Identity::generate();
        let user_id = identity.peer_id().to_base58();
        let public_key_b58 =
            bs58::encode(identity.keypair().public().to_protobuf_encoding()).into_string();

        let user = User {
            id: user_id.clone(),
            username: "Tester".into(),
            avatar: "avatar.png".into(),
            is_online: true,
            public_key: Some(public_key_b58.clone()),
            bio: None,
            tag: None,
        };

        user_service::insert_user(&local_db, &user)
            .await
            .expect("insert user");

        let message_id = Uuid::new_v4().to_string();
        let chat_id = "chat-123".to_string();

        let message = database::Message {
            id: message_id.clone(),
            chat_id: chat_id.clone(),
            sender_id: user_id.clone(),
            content: "Hello".into(),
            timestamp: Utc::now(),
            read: false,
            pinned: false,
            attachments: Vec::new(),
            reactions: HashMap::new(),
            reply_to_message_id: None,
            reply_snapshot_author: None,
            reply_snapshot_snippet: None,
            edited_at: None,
            edited_by: None,
            expires_at: None,
        };
        database::insert_message(&local_db, &message)
            .await
            .expect("insert message");

        let (network_tx, mut network_rx) = tokio::sync::mpsc::channel(8);
        let (file_cmd_tx, _file_cmd_rx) = tokio::sync::mpsc::channel(8);
        let temp_dir = tempdir().expect("tempdir");
        let app_data_dir = temp_dir.into_path();
        let local_state = AppState {
            identity: identity.clone(),
            network_tx,
            db_pool: local_db.clone(),
            incoming_files: Arc::new(Mutex::new(HashMap::<String, IncomingFile>::new())),
            file_cmd_tx,
            file_acl_policy: Arc::new(Mutex::new(FileAclPolicy::Everyone)),
            app_data_dir,
            connectivity_snapshot: Arc::new(Mutex::new(None)),
            voice_memos_enabled: Arc::new(AtomicBool::new(true)),
            relays: Arc::new(Mutex::new(Vec::new())),
            trusted_devices: Arc::new(Mutex::new(Vec::<TrustedDeviceRecord>::new())),
            pending_device_bundles: Arc::new(Mutex::new(HashMap::<
                String,
                PendingDeviceProvisioning,
            >::new())),
        };

        delete_message_internal(
            local_state,
            chat_id.clone(),
            message_id.clone(),
            MessageDeletionScope::Everyone,
        )
        .await
        .expect("delete message locally");

        let remaining = database::get_messages_for_chat(&local_db, &chat_id, 10, 0)
            .await
            .expect("fetch");
        assert!(remaining.is_empty(), "message should be deleted locally");

        let serialized = network_rx
            .recv()
            .await
            .expect("delete event should be emitted");
        let event: AepMessage =
            bincode::deserialize(&serialized).expect("event deserializes correctly");

        let remote_dir = tempdir().expect("tempdir");
        let remote_db = aep::database::initialize_db(remote_dir.path().join("remote.db"))
            .await
            .expect("init remote db");

        user_service::insert_user(&remote_db, &user)
            .await
            .expect("insert remote user");

        database::insert_message(&remote_db, &message)
            .await
            .expect("insert remote message");

        let remote_state = build_app_state(Identity::generate(), remote_db.clone());

        aep::handle_aep_message(event, &remote_db, remote_state)
            .await
            .expect("remote delete should succeed");

        let remote_remaining = database::get_messages_for_chat(&remote_db, &chat_id, 10, 0)
            .await
            .expect("fetch remote");
        assert!(
            remote_remaining.is_empty(),
            "message should be deleted on remote client"
        );
    }

    #[tokio::test]
    async fn voice_memo_attachments_blocked_when_disabled() {
        let temp_dir = tempdir().expect("tempdir");
        let db_pool = aep::database::initialize_db(temp_dir.path().join("voice-memo.db"))
            .await
            .expect("init db");

        let identity = Identity::generate();
        let mut state = build_app_state(identity.clone(), db_pool.clone());
        state.voice_memos_enabled.store(false, Ordering::Relaxed);

        let attachments = vec![AttachmentDescriptor {
            name: "voice-message-test.webm".into(),
            content_type: Some("audio/webm".into()),
            size: 4,
            data: vec![0, 1, 2, 3],
        }];

        let result = persist_and_broadcast_message(
            state,
            "Test message".into(),
            attachments,
            Some("chat-voice".into()),
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await;

        assert!(
            matches!(result, Err(message) if message.contains("Voice memo attachments are disabled")),
            "Voice memo attachments should be rejected when disabled"
        );
    }

    #[tokio::test]
    async fn edit_message_is_persisted_and_broadcast() {
        let local_dir = tempdir().expect("tempdir");
        let local_db = aep::database::initialize_db(local_dir.path().join("local.db"))
            .await
            .expect("init db");

        let identity = Identity::generate();
        let user_id = identity.peer_id().to_base58();
        let public_key_b58 =
            bs58::encode(identity.keypair().public().to_protobuf_encoding()).into_string();

        let user = User {
            id: user_id.clone(),
            username: "Tester".into(),
            avatar: "avatar.png".into(),
            is_online: true,
            public_key: Some(public_key_b58.clone()),
            bio: None,
            tag: None,
        };

        user_service::insert_user(&local_db, &user)
            .await
            .expect("insert user");

        let message_id = Uuid::new_v4().to_string();
        let chat_id = "chat-456".to_string();

        let message = database::Message {
            id: message_id.clone(),
            chat_id: chat_id.clone(),
            sender_id: user_id.clone(),
            content: "Original".into(),
            timestamp: Utc::now(),
            read: false,
            pinned: false,
            attachments: Vec::new(),
            reactions: HashMap::new(),
            reply_to_message_id: None,
            reply_snapshot_author: None,
            reply_snapshot_snippet: None,
            edited_at: None,
            edited_by: None,
            expires_at: None,
        };
        database::insert_message(&local_db, &message)
            .await
            .expect("insert message");

        let (network_tx, mut network_rx) = tokio::sync::mpsc::channel(8);
        let (file_cmd_tx, _file_cmd_rx) = tokio::sync::mpsc::channel(8);
        let temp_dir = tempdir().expect("tempdir");
        let app_data_dir = temp_dir.into_path();
        let local_state = AppState {
            identity: identity.clone(),
            network_tx,
            db_pool: local_db.clone(),
            incoming_files: Arc::new(Mutex::new(HashMap::<String, IncomingFile>::new())),
            file_cmd_tx,
            file_acl_policy: Arc::new(Mutex::new(FileAclPolicy::Everyone)),
            app_data_dir,
            connectivity_snapshot: Arc::new(Mutex::new(None)),
            voice_memos_enabled: Arc::new(AtomicBool::new(true)),
            relays: Arc::new(Mutex::new(Vec::new())),
            trusted_devices: Arc::new(Mutex::new(Vec::<TrustedDeviceRecord>::new())),
            pending_device_bundles: Arc::new(Mutex::new(HashMap::<
                String,
                PendingDeviceProvisioning,
            >::new())),
        };

        let new_content = "Edited message".to_string();
        edit_message_internal(
            local_state,
            chat_id.clone(),
            message_id.clone(),
            new_content.clone(),
        )
        .await
        .expect("edit message locally");

        let updated_local = database::get_messages_for_chat(&local_db, &chat_id, 10, 0)
            .await
            .expect("fetch local");
        assert_eq!(updated_local.len(), 1);
        let updated = &updated_local[0];
        assert_eq!(updated.content, new_content);
        assert_eq!(updated.edited_by.as_deref(), Some(user_id.as_str()));
        assert!(updated.edited_at.is_some());

        let serialized = network_rx
            .recv()
            .await
            .expect("edit event should be emitted");
        let event: AepMessage =
            bincode::deserialize(&serialized).expect("event deserializes correctly");

        let remote_dir = tempdir().expect("tempdir");
        let remote_db = aep::database::initialize_db(remote_dir.path().join("remote.db"))
            .await
            .expect("init remote db");

        user_service::insert_user(&remote_db, &user)
            .await
            .expect("insert remote user");

        database::insert_message(&remote_db, &message)
            .await
            .expect("insert remote message");

        let remote_state = build_app_state(Identity::generate(), remote_db.clone());

        aep::handle_aep_message(event.clone(), &remote_db, remote_state)
            .await
            .expect("remote edit should succeed");

        if let AepMessage::EditMessage {
            message_id: event_message_id,
            chat_id: event_chat_id,
            editor_id,
            new_content: event_content,
            edited_at: event_time,
            ..
        } = event
        {
            assert_eq!(event_message_id, message_id);
            assert_eq!(event_chat_id, chat_id);
            assert_eq!(editor_id, user_id);
            assert_eq!(event_content, new_content);

            let remote_messages = database::get_messages_for_chat(&remote_db, &chat_id, 10, 0)
                .await
                .expect("fetch remote");
            assert_eq!(remote_messages.len(), 1);
            let remote_message = &remote_messages[0];
            assert_eq!(remote_message.content, new_content);
            assert_eq!(remote_message.edited_by.as_deref(), Some(user_id.as_str()));
            let remote_time = remote_message
                .edited_at
                .expect("remote message should have edited_at");
            assert_eq!(remote_time.to_rfc3339(), event_time.to_rfc3339());
        } else {
            panic!("expected edit message event");
        }
    }
}

#[tauri::command]
pub async fn send_encrypted_dm(
    recipient_id: String,
    message: String,
    reply_to_message_id: Option<String>,
    reply_snapshot_author: Option<String>,
    reply_snapshot_snippet: Option<String>,
    expires_at: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();

    let expires_at = parse_optional_datetime(expires_at)?;

    // Insert locally for UX
    let new_local_message = database::Message {
        id: uuid::Uuid::new_v4().to_string(),
        chat_id: recipient_id.clone(),
        sender_id: my_id.clone(),
        content: message.clone(),
        timestamp: chrono::Utc::now(),
        read: false,
        pinned: false,
        attachments: Vec::new(),
        reactions: HashMap::new(),
        reply_to_message_id: reply_to_message_id.clone(),
        reply_snapshot_author: reply_snapshot_author.clone(),
        reply_snapshot_snippet: reply_snapshot_snippet.clone(),
        edited_at: None,
        edited_by: None,
        expires_at,
    };
    database::insert_message(&state.db_pool, &new_local_message)
        .await
        .map_err(|e| e.to_string())?;

    let payload = EncryptedDmPayload {
        content: message.clone(),
        attachments: Vec::new(),
        reply_to_message_id,
        reply_snapshot_author,
        reply_snapshot_snippet,
    };
    let plaintext = bincode::serialize(&payload).map_err(|e| e.to_string())?;

    // Encrypt via E2EE manager
    let pkt = {
        let e2ee_arc = e2ee::init_global_manager();
        let mut mgr = e2ee_arc.lock();
        let pkt = mgr
            .encrypt_for(&recipient_id, &plaintext)
            .map_err(|e| format!("E2EE encrypt error: {e}"))?;
        pkt
    };

    let payload_sig_bytes = bincode::serialize(&(
        my_id.clone(),
        recipient_id.clone(),
        &pkt.enc_header,
        &pkt.enc_content,
    ))
    .map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&payload_sig_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::EncryptedChatMessage {
        sender: my_id,
        recipient: recipient_id,
        init: pkt.init,
        enc_header: pkt.enc_header,
        enc_content: pkt.enc_content,
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_encrypted_dm_with_attachments(
    recipient_id: String,
    message: String,
    attachments: Vec<AttachmentDescriptor>,
    reply_to_message_id: Option<String>,
    reply_snapshot_author: Option<String>,
    reply_snapshot_snippet: Option<String>,
    expires_at: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();

    let expires_at = parse_optional_datetime(expires_at)?;

    let voice_memos_enabled = state.voice_memos_enabled.load(Ordering::Relaxed);
    if !voice_memos_enabled && attachments.iter().any(is_voice_memo_attachment) {
        return Err("Voice memo attachments are disabled by your settings.".to_string());
    }

    let message_id = uuid::Uuid::new_v4().to_string();
    let timestamp = chrono::Utc::now();
    let mut db_attachments = Vec::new();
    let mut payload_attachments = Vec::new();

    for descriptor in attachments.into_iter() {
        let AttachmentDescriptor {
            name,
            content_type,
            size,
            data,
        } = descriptor;

        if data.is_empty() {
            return Err(format!("Attachment '{name}' is missing binary data"));
        }

        let data_len = data.len() as u64;
        let effective_size = if size == 0 { data_len } else { size };
        let sanitized_size = if effective_size == data_len {
            effective_size
        } else {
            data_len
        };

        let attachment_id = uuid::Uuid::new_v4().to_string();
        db_attachments.push(database::Attachment {
            id: attachment_id,
            message_id: message_id.clone(),
            name: name.clone(),
            content_type: content_type.clone(),
            size: sanitized_size,
            data: Some(data.clone()),
        });

        payload_attachments.push(AttachmentDescriptor {
            name,
            content_type,
            size: sanitized_size,
            data,
        });
    }

    let new_local_message = database::Message {
        id: message_id,
        chat_id: recipient_id.clone(),
        sender_id: my_id.clone(),
        content: message.clone(),
        timestamp,
        read: false,
        pinned: false,
        attachments: db_attachments,
        reactions: HashMap::new(),
        reply_to_message_id: reply_to_message_id.clone(),
        reply_snapshot_author: reply_snapshot_author.clone(),
        reply_snapshot_snippet: reply_snapshot_snippet.clone(),
        edited_at: None,
        edited_by: None,
        expires_at,
    };
    database::insert_message(&state.db_pool, &new_local_message)
        .await
        .map_err(|e| e.to_string())?;

    let payload = EncryptedDmPayload {
        content: message,
        attachments: payload_attachments,
        reply_to_message_id,
        reply_snapshot_author,
        reply_snapshot_snippet,
    };
    let plaintext = bincode::serialize(&payload).map_err(|e| e.to_string())?;

    let pkt = {
        let e2ee_arc = e2ee::init_global_manager();
        let mut mgr = e2ee_arc.lock();
        let pkt = mgr
            .encrypt_for(&recipient_id, &plaintext)
            .map_err(|e| format!("E2EE encrypt error: {e}"))?;
        pkt
    };

    let payload_sig_bytes = bincode::serialize(&(
        my_id.clone(),
        recipient_id.clone(),
        &pkt.enc_header,
        &pkt.enc_content,
    ))
    .map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&payload_sig_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::EncryptedChatMessage {
        sender: my_id,
        recipient: recipient_id,
        init: pkt.init,
        enc_header: pkt.enc_header,
        enc_content: pkt.enc_content,
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_read_receipt(
    _app: tauri::AppHandle,
    chat_id: String,
    message_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    broadcast_read_receipt(state, chat_id, message_id).await
}

#[tauri::command]
pub async fn send_typing_indicator(
    _app: tauri::AppHandle,
    chat_id: String,
    is_typing: bool,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    broadcast_typing_indicator(state, chat_id, is_typing).await
}

#[tauri::command]
pub async fn rotate_group_key(
    server_id: String,
    channel_id: Option<String>,
    epoch: u64,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    // Derive fresh random key
    use rand::RngCore;
    let mut key = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut key);

    // Save locally
    {
        let arc = e2ee::init_global_manager();
        let mut mgr = arc.lock();
        mgr.set_group_key(&server_id, &channel_id, epoch, &key);
    }

    // Build encrypted slots per member
    let members = aep::database::get_server_members(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;
    let mut slots: Vec<EncryptedDmSlot> = Vec::new();
    for m in members {
        if m.id == state.identity.peer_id().to_base58() {
            continue;
        }
        let arc = e2ee::init_global_manager();
        let mut mgr = arc.lock();
        let pkt = mgr
            .encrypt_for(&m.id, &key)
            .map_err(|e| format!("E2EE encrypt error: {e}"))?;
        slots.push(EncryptedDmSlot {
            recipient: m.id,
            init: pkt.init,
            enc_header: pkt.enc_header,
            enc_content: pkt.enc_content,
        });
    }

    let issuer_id = state.identity.peer_id().to_base58();
    let payload = bincode::serialize(&(issuer_id.clone(), &server_id, &channel_id, epoch, &slots))
        .map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&payload)
        .map_err(|e| e.to_string())?;

    let aep_msg = aegis_protocol::AepMessage::GroupKeyUpdate {
        server_id,
        channel_id,
        epoch,
        slots,
        signature: Some(signature),
    };
    let bytes = bincode::serialize(&aep_msg).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(bytes)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_encrypted_group_message(
    server_id: String,
    channel_id: Option<String>,
    message: String,
    reply_to_message_id: Option<String>,
    reply_snapshot_author: Option<String>,
    reply_snapshot_snippet: Option<String>,
    expires_at: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let _ = parse_optional_datetime(expires_at)?;
    let payload = EncryptedDmPayload {
        content: message,
        attachments: Vec::new(),
        reply_to_message_id,
        reply_snapshot_author,
        reply_snapshot_snippet,
    };
    let serialized_payload = bincode::serialize(&payload).map_err(|e| e.to_string())?;
    // Encrypt using group key
    let (epoch, nonce, ciphertext) = {
        let arc = e2ee::init_global_manager();
        let mgr = arc.lock();
        mgr.encrypt_group_message(&server_id, &channel_id, &serialized_payload)
            .map_err(|e| format!("Group E2EE: {e}"))?
    };

    // Sign payload
    let payload = bincode::serialize(&(
        state.identity.peer_id().to_base58(),
        &server_id,
        &channel_id,
        epoch,
        &nonce,
        &ciphertext,
    ))
    .map_err(|e| e.to_string())?;
    let sig = state
        .identity
        .keypair()
        .sign(&payload)
        .map_err(|e| e.to_string())?;

    // Broadcast
    let msg = aegis_protocol::AepMessage::EncryptedGroupMessage {
        sender: state.identity.peer_id().to_base58(),
        server_id,
        channel_id,
        epoch,
        nonce,
        ciphertext,
        signature: Some(sig),
    };
    let bytes = bincode::serialize(&msg).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(bytes)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_reaction(
    chat_id: String,
    message_id: String,
    emoji: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    let user_id = state.identity.peer_id().to_base58();

    database::add_reaction_to_message(&state.db_pool, &message_id, &user_id, &emoji)
        .await
        .map_err(|e| e.to_string())?;

    let reaction_data = MessageReactionData {
        message_id: message_id.clone(),
        chat_id: chat_id.clone(),
        emoji: emoji.clone(),
        user_id: user_id.clone(),
        action: ReactionAction::Add,
    };
    let reaction_bytes = bincode::serialize(&reaction_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&reaction_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::MessageReaction {
        message_id,
        chat_id,
        emoji,
        user_id,
        action: ReactionAction::Add,
        signature: Some(signature),
    };
    let serialized = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_reaction(
    chat_id: String,
    message_id: String,
    emoji: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    let user_id = state.identity.peer_id().to_base58();

    database::remove_reaction_from_message(&state.db_pool, &message_id, &user_id, &emoji)
        .await
        .map_err(|e| e.to_string())?;

    let reaction_data = MessageReactionData {
        message_id: message_id.clone(),
        chat_id: chat_id.clone(),
        emoji: emoji.clone(),
        user_id: user_id.clone(),
        action: ReactionAction::Remove,
    };
    let reaction_bytes = bincode::serialize(&reaction_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&reaction_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::MessageReaction {
        message_id,
        chat_id,
        emoji,
        user_id,
        action: ReactionAction::Remove,
        signature: Some(signature),
    };
    let serialized = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized)
        .await
        .map_err(|e| e.to_string())
}
