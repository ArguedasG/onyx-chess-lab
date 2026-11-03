//! Books (phase 9.4, I-55): the library stores paths, never copies. A book is identified by the
//! SHA-256 of its file, so its reading point and diagram corrections follow it if it is moved.

use std::io::Read;

use serde::Serialize;
use sha2::{Digest, Sha256};
use specta::Type;

use crate::error::Error;

#[derive(Serialize, Type, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BookFingerprint {
    pub sha256: String,
    /// File size in bytes (f64 so the frontend gets a plain number).
    pub size: f64,
}

fn fingerprint(path: &str) -> Result<BookFingerprint, Error> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 20];
    let mut size = 0u64;
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        size += read as u64;
        hasher.update(&buffer[..read]);
    }
    Ok(BookFingerprint {
        sha256: hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect(),
        size: size as f64,
    })
}

/// SHA-256 and size of a book file, read in 1 MB blocks off the UI thread.
#[tauri::command]
#[specta::specta]
pub async fn book_fingerprint(path: String) -> Result<BookFingerprint, Error> {
    tokio::task::spawn_blocking(move || fingerprint(&path))
        .await
        .map_err(|e| Error::InvalidRequest(format!("book fingerprint: {e}")))?
}

#[cfg(test)]
mod tests {
    #[test]
    fn fingerprint_of_a_known_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("book.pdf");
        std::fs::write(&path, b"abc").unwrap();
        let fp = super::fingerprint(path.to_str().unwrap()).unwrap();
        assert_eq!(
            fp.sha256,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(fp.size, 3.0);
    }
}
