use std::{
    fs::{create_dir_all, File},
    path::{Component, Path, PathBuf},
    time::Duration,
};

use log::info;
use reqwest::{
    header::{HeaderMap, HeaderValue, AUTHORIZATION},
    redirect::Policy,
    Client, Url,
};
use specta::Type;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;

use crate::error::Error;
use crate::progress::update_progress;
use crate::AppState;

const MAX_DOWNLOAD_BYTES: u64 = 512 * 1024 * 1024 * 1024;
const MAX_ARCHIVE_BYTES: u64 = 2 * 1024 * 1024 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES: usize = 1_000_000;
const MAX_REDIRECTS: usize = 10;

fn validate_download(url: &str, path: &Path, authenticated: bool) -> Result<Url, Error> {
    let parsed = Url::parse(url).map_err(|error| Error::Download(error.to_string()))?;
    let loopback_http = parsed.scheme() == "http"
        && parsed.host_str().is_some_and(|host| {
            host.eq_ignore_ascii_case("localhost")
                || host
                    .parse::<std::net::IpAddr>()
                    .is_ok_and(|address| address.is_loopback())
        });
    if parsed.scheme() != "https" && !loopback_http {
        return Err(Error::Download(
            "Downloads must use HTTPS or an HTTP loopback address".to_string(),
        ));
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(Error::Download(
            "Download URLs cannot contain credentials".to_string(),
        ));
    }
    if authenticated && parsed.host_str() != Some("lichess.org") {
        return Err(Error::Download(
            "A Lichess token can only be sent to lichess.org".to_string(),
        ));
    }
    if !path.is_absolute() || path.components().any(|part| part == Component::ParentDir) {
        return Err(Error::Download(
            "Download destination must be an absolute normalized path".to_string(),
        ));
    }
    Ok(parsed)
}

#[tauri::command]
#[specta::specta]
pub async fn download_file(
    id: String,
    url: String,
    path: PathBuf,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    token: Option<String>,
    finalize: Option<bool>,
    total_size: Option<u32>,
) -> Result<(), Error> {
    let finalize = finalize.unwrap_or(true);
    let authenticated = token.is_some();
    let parsed_url = validate_download(&url, &path, authenticated)?;
    let initial_host = parsed_url.host_str().unwrap_or_default().to_string();
    info!(
        "Downloading HTTPS file from {}{}",
        initial_host,
        parsed_url.path()
    );
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .read_timeout(Duration::from_secs(60))
        .redirect(Policy::custom(move |attempt| {
            if attempt.previous().len() >= MAX_REDIRECTS {
                return attempt.error("too many redirects");
            }
            let loopback_http = attempt.url().scheme() == "http"
                && attempt.url().host_str().is_some_and(|host| {
                    host.eq_ignore_ascii_case("localhost")
                        || host
                            .parse::<std::net::IpAddr>()
                            .is_ok_and(|address| address.is_loopback())
                });
            if attempt.url().scheme() != "https" && !loopback_http {
                return attempt.error("redirected to a non-HTTPS URL");
            }
            if authenticated && attempt.url().host_str() != Some(initial_host.as_str()) {
                return attempt.error("authenticated download redirected to another host");
            }
            attempt.follow()
        }))
        .build()?;

    let mut req = client.get(&url);
    if let Some(token) = token {
        let mut header_map = HeaderMap::new();
        let authorization = HeaderValue::from_str(&format!("Bearer {token}"))
            .map_err(|_| Error::Download("Invalid authorization token".to_string()))?;
        header_map.insert(AUTHORIZATION, authorization);
        req = req.headers(header_map);
    }
    let res = req.send().await?.error_for_status()?;
    if res
        .content_length()
        .is_some_and(|length| length > MAX_DOWNLOAD_BYTES)
    {
        return Err(Error::Download(
            "Download exceeds the 512 GiB safety limit".to_string(),
        ));
    }
    let total_size = if let Some(total_size) = total_size {
        Some(total_size as u64)
    } else {
        res.content_length()
    };

    let url_path = reqwest::Url::parse(&url)
        .ok()
        .map(|parsed| parsed.path().to_ascii_lowercase())
        .unwrap_or_else(|| url.to_ascii_lowercase());
    let is_zip = url_path.ends_with(".zip");
    let is_tar = url_path.ends_with(".tar");
    let is_archive = is_zip || is_tar;

    let destination = Path::new(&path);
    let download_dir = if is_archive {
        destination
    } else {
        destination.parent().ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Download destination has no parent directory",
            )
        })?
    };
    create_dir_all(download_dir)?;

    let temporary = tempfile::NamedTempFile::new_in(download_dir)?;
    let (temporary_file, temporary_path) = temporary.into_parts();
    let mut output = tokio::fs::File::from_std(temporary_file);
    let mut downloaded: u64 = 0;
    let mut stream = res.bytes_stream();

    while let Some(item) = stream.next().await {
        let chunk = item?;
        if downloaded.saturating_add(chunk.len() as u64) > MAX_DOWNLOAD_BYTES {
            return Err(Error::Download(
                "Download exceeds the 512 GiB safety limit".to_string(),
            ));
        }
        output.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;
        if let Some(total_size) = total_size {
            let progress = ((downloaded as f32 / total_size as f32) * 100.0).min(100.0);
            update_progress(&state.progress_state, &app, id.clone(), progress, false)?;
        }
    }
    output.flush().await?;
    output.sync_all().await?;
    drop(output);

    info!("Downloaded file to {}", destination.display());

    if is_zip {
        unzip_file(destination, temporary_path.as_ref()).await?;
    } else if is_tar {
        untar_file(destination, temporary_path.as_ref())?;
    } else {
        match std::fs::remove_file(destination) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
        temporary_path
            .persist(destination)
            .map_err(|error| Error::from(error.error))?;
    }

    if finalize {
        update_progress(&state.progress_state, &app, id, 100.0, true)?;
    }
    // remove_file(&path).await;
    Ok(())
}

pub async fn unzip_file(path: &Path, archive_path: &Path) -> Result<(), Error> {
    let mut archive = zip::ZipArchive::new(File::open(archive_path)?)?;
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(Error::Download(
            "Archive contains too many entries".to_string(),
        ));
    }
    let mut uncompressed_bytes = 0_u64;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        if file
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(Error::Download(
                "Archive contains a symbolic link".to_string(),
            ));
        }
        uncompressed_bytes = uncompressed_bytes.saturating_add(file.size());
        if uncompressed_bytes > MAX_ARCHIVE_BYTES {
            return Err(Error::Download(
                "Expanded archive exceeds the 2 TiB safety limit".to_string(),
            ));
        }
        let outpath = path.join(file.mangled_name());
        if (*file.name()).ends_with('/') {
            info!(
                "File {} extracted to \"{}\"",
                i,
                outpath.as_path().display()
            );
            create_dir_all(&outpath)?;
        } else {
            info!(
                "File {} extracted to \"{}\" ({} bytes)",
                i,
                outpath.as_path().display(),
                file.size()
            );
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    create_dir_all(p)?;
                }
            }
            let mut outfile = std::fs::File::create(&outpath)?;
            std::io::copy(&mut file, &mut outfile)?;
        }
    }
    Ok(())
}

fn untar_file(path: &Path, archive_path: &Path) -> Result<(), Error> {
    let file = File::open(archive_path)?;
    let mut archive = tar::Archive::new(file);
    let mut entries = 0_usize;
    let mut uncompressed_bytes = 0_u64;

    for entry in archive.entries()? {
        let mut entry = entry?;
        entries += 1;
        if entries > MAX_ARCHIVE_ENTRIES {
            return Err(Error::Download(
                "Archive contains too many entries".to_string(),
            ));
        }
        let entry_type = entry.header().entry_type();
        if !entry_type.is_file() && !entry_type.is_dir() {
            return Err(Error::Download(
                "Archive contains links or unsupported entry types".to_string(),
            ));
        }
        uncompressed_bytes = uncompressed_bytes.saturating_add(entry.size());
        if uncompressed_bytes > MAX_ARCHIVE_BYTES {
            return Err(Error::Download(
                "Expanded archive exceeds the 2 TiB safety limit".to_string(),
            ));
        }
        if !entry.unpack_in(path)? {
            return Err(Error::Download(
                "Archive entry would escape the destination directory".to_string(),
            ));
        }
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn set_file_as_executable(_path: String) -> Result<(), Error> {
    #[cfg(unix)]
    {
        let path = Path::new(&_path);
        let metadata = std::fs::metadata(path)?;
        let mut permissions = metadata.permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(path, permissions)?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn file_exists(path: String) -> Result<bool, Error> {
    Ok(Path::new(&path).exists())
}

#[derive(Debug, Type, serde::Serialize)]
pub struct FileMetadata {
    pub last_modified: u32,
}

#[tauri::command]
#[specta::specta]
pub async fn get_file_metadata(path: String) -> Result<FileMetadata, Error> {
    let metadata = std::fs::metadata(path)?;
    let last_modified = metadata
        .modified()?
        .duration_since(std::time::SystemTime::UNIX_EPOCH)?;
    Ok(FileMetadata {
        last_modified: last_modified.as_secs() as u32,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downloads_require_https_and_normalized_absolute_destinations() {
        let destination = std::env::temp_dir().join("onyx-download-test.bin");
        assert!(validate_download("https://example.com/file", &destination, false).is_ok());
        assert!(validate_download("http://127.0.0.1:8080/file", &destination, false).is_ok());
        assert!(validate_download("http://example.com/file", &destination, false).is_err());
        assert!(
            validate_download("https://example.com/file", Path::new("relative.bin"), false)
                .is_err()
        );
    }

    #[test]
    fn authenticated_downloads_are_limited_to_lichess() {
        let destination = std::env::temp_dir().join("onyx-download-test.bin");
        assert!(validate_download("https://lichess.org/api/games", &destination, true).is_ok());
        assert!(validate_download("https://example.com/file", &destination, true).is_err());
        assert!(
            validate_download("https://lichess.org.example.com/file", &destination, true).is_err()
        );
    }
}
