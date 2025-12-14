use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::Duration;

use futures::StreamExt;
use once_cell::sync::Lazy;
use reqwest::{
    header::{self, HeaderValue, CONTENT_TYPE},
    redirect::Policy,
    Client, Url,
};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use tauri::{path::BaseDirectory, AppHandle, Manager};
use tokio::{fs, sync::OnceCell};
use tracing::warn;

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

#[derive(Debug, Clone, Serialize, Deserialize, rkyv::Archive, rkyv::Deserialize, rkyv::Serialize)]
#[serde(rename_all = "camelCase")]
#[archive(check_bytes)]
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
    match fs::read(path).await {
        Ok(bytes) => {
            match rkyv::from_bytes::<HashMap<String, Option<LinkPreviewMetadata>>>(&bytes) {
                Ok(cache) => cache,
                Err(error) => {
                    warn!(
                        "[link_previews] Failed to parse cache at {}: {:?}",
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

    let bytes = rkyv::to_bytes::<_, 1024>(cache)
        .map_err(|error| format!("failed to serialize link preview cache: {:?}", error))?;

    fs::write(path, &bytes)
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

    if let (Some(path), Some(snapshot)) = (cache_path, snapshot_for_disk) {
        if let Err(error) = persist_link_preview_cache(&path, &snapshot).await {
            warn!(
                "[link_previews] Failed to persist cache at {}: {}",
                path.display(),
                error
            );
        }
    }

    Ok(preview)
}
