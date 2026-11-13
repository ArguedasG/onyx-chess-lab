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

/// The 16 bytes every SQLite database file starts with.
const SQLITE_HEADER: &[u8; 16] = b"SQLite format 3\0";

/// Why `path` is not a SQLite database, or `None` when it starts with the SQLite header, is empty
/// (SQLite treats that as a new database) or does not exist yet.
pub(crate) fn sqlite_file_problem(path: &Path) -> std::io::Result<Option<String>> {
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let size = file.metadata()?.len();
    if size == 0 {
        return Ok(None);
    }
    let mut head = Vec::with_capacity(512);
    std::io::Read::read_to_end(&mut std::io::Read::take(&mut file, 512), &mut head)?;
    if head.starts_with(SQLITE_HEADER) {
        return Ok(None);
    }
    let text = String::from_utf8_lossy(&head)
        .trim_start()
        .to_ascii_lowercase();
    let content = if text.starts_with('<') {
        "a web page (HTML) instead of a database; a proxy, firewall or content filter may have \
         replaced the download"
            .to_string()
    } else {
        let hex = head
            .iter()
            .take(16)
            .map(|byte| format!("{byte:02x}"))
            .collect::<Vec<_>>()
            .join(" ");
        format!("data that does not start with the SQLite header (first bytes: {hex})")
    };
    Ok(Some(format!("the file holds {content} ({size} bytes)")))
}

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
    // Stockfish publishes its macOS and Linux builds as .tar.gz.
    let is_tar_gz = url_path.ends_with(".tar.gz") || url_path.ends_with(".tgz");
    let is_archive = is_zip || is_tar || is_tar_gz;

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
    } else if is_tar_gz {
        untar_gz_file(destination, temporary_path.as_ref())?;
    } else {
        // A database that is not one would only fail later, when it is opened, with SQLite's
        // terse "file is not a database"; the temporary file is discarded on return.
        let is_database = destination
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("db3"));
        if is_database {
            if let Some(problem) = sqlite_file_problem(temporary_path.as_ref())? {
                return Err(Error::Download(format!(
                    "The downloaded database is not valid: {problem}. Nothing was saved."
                )));
            }
        }
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
    unpack_tar(path, File::open(archive_path)?)
}

pub(crate) fn untar_gz_file(path: &Path, archive_path: &Path) -> Result<(), Error> {
    unpack_tar(
        path,
        flate2::read::GzDecoder::new(File::open(archive_path)?),
    )
}

/// Unpacks a tar stream into `path` with the download safety limits: no links, no entries
/// outside the destination, and bounded entry count and size.
fn unpack_tar(path: &Path, reader: impl std::io::Read) -> Result<(), Error> {
    let mut archive = tar::Archive::new(reader);
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

    fn tar_gz(build: impl FnOnce(&mut tar::Builder<flate2::write::GzEncoder<Vec<u8>>>)) -> Vec<u8> {
        let encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        let mut builder = tar::Builder::new(encoder);
        build(&mut builder);
        builder.into_inner().unwrap().finish().unwrap()
    }

    #[test]
    fn tar_gz_downloads_unpack_like_stockfish_archives() {
        let archive = tar_gz(|builder| {
            let body = b"engine";
            let mut header = tar::Header::new_gnu();
            header.set_size(body.len() as u64);
            header.set_mode(0o755);
            header.set_cksum();
            builder
                .append_data(
                    &mut header,
                    "stockfish/stockfish-macos-universal",
                    &body[..],
                )
                .unwrap();
        });
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("download.tar.gz");
        std::fs::write(&source, archive).unwrap();
        let destination = dir.path().join("engines");
        create_dir_all(&destination).unwrap();
        untar_gz_file(&destination, &source).unwrap();
        let engine = destination
            .join("stockfish")
            .join("stockfish-macos-universal");
        assert_eq!(std::fs::read(engine).unwrap(), b"engine");
    }

    #[test]
    fn tar_gz_downloads_still_reject_links() {
        let archive = tar_gz(|builder| {
            let mut header = tar::Header::new_gnu();
            header.set_entry_type(tar::EntryType::Symlink);
            header.set_size(0);
            header.set_cksum();
            builder
                .append_link(&mut header, "stockfish/link", "/etc/passwd")
                .unwrap();
        });
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("download.tar.gz");
        std::fs::write(&source, archive).unwrap();
        assert!(untar_gz_file(dir.path(), &source).is_err());
    }

    #[test]
    fn databases_are_recognized_by_their_sqlite_header() {
        let dir = tempfile::tempdir().unwrap();

        let missing = dir.path().join("missing.db3");
        assert_eq!(sqlite_file_problem(&missing).unwrap(), None);

        let empty = dir.path().join("empty.db3");
        std::fs::write(&empty, b"").unwrap();
        assert_eq!(sqlite_file_problem(&empty).unwrap(), None);

        let real = dir.path().join("real.db3");
        rusqlite::Connection::open(&real)
            .unwrap()
            .execute_batch("CREATE TABLE t (x);")
            .unwrap();
        assert_eq!(sqlite_file_problem(&real).unwrap(), None);

        let html = dir.path().join("html.db3");
        std::fs::write(
            &html,
            b"\n  <!DOCTYPE html><html><body>Blocked</body></html>",
        )
        .unwrap();
        let problem = sqlite_file_problem(&html).unwrap().unwrap();
        assert!(problem.contains("web page (HTML)"), "{problem}");

        let other = dir.path().join("other.db3");
        std::fs::write(&other, [0x28, 0xb5, 0x2f, 0xfd, 0, 1, 2, 3]).unwrap();
        let problem = sqlite_file_problem(&other).unwrap().unwrap();
        assert!(problem.contains("28 b5 2f fd"), "{problem}");
        assert!(problem.contains("8 bytes"), "{problem}");
    }
}
