use std::{
    collections::BTreeMap,
    fs::{create_dir_all, File},
    io::{Read, Write},
    path::PathBuf,
    sync::Mutex,
};

use once_cell::sync::Lazy;
use tauri::{AppHandle, Manager};

use crate::error::Error;

const TOKEN_STORE_DIRECTORY: &str = "secrets";
const TOKEN_STORE_FILENAME: &str = "lichess-tokens.v1.json";
const MAX_TOKEN_STORE_BYTES: u64 = 1024 * 1024;

static TOKEN_STORE_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

type EncryptedTokens = BTreeMap<String, Vec<u8>>;

fn normalized_username(username: &str) -> Result<String, Error> {
    let username = username.trim();
    if username.is_empty() || username.len() > 100 {
        return Err(Error::SecureStorage("Invalid Lichess username".to_string()));
    }
    Ok(username.to_lowercase())
}

fn token_store_path(app: &AppHandle) -> Result<PathBuf, Error> {
    Ok(app
        .path()
        .app_data_dir()?
        .join(TOKEN_STORE_DIRECTORY)
        .join(TOKEN_STORE_FILENAME))
}

fn read_tokens(path: &PathBuf) -> Result<EncryptedTokens, Error> {
    if !path.exists() {
        return Ok(EncryptedTokens::new());
    }
    let metadata = std::fs::metadata(path)?;
    if metadata.len() > MAX_TOKEN_STORE_BYTES {
        return Err(Error::SecureStorage(
            "The encrypted token store is unexpectedly large".to_string(),
        ));
    }
    let mut contents = Vec::with_capacity(metadata.len() as usize);
    File::open(path)?.read_to_end(&mut contents)?;
    Ok(serde_json::from_slice(&contents)?)
}

fn write_tokens(path: &PathBuf, tokens: &EncryptedTokens) -> Result<(), Error> {
    let parent = path
        .parent()
        .ok_or_else(|| Error::SecureStorage("Token store path has no parent".to_string()))?;
    create_dir_all(parent)?;
    let temporary_path = path.with_extension("json.tmp");
    let backup_path = path.with_extension("json.bak");
    let mut file = File::create(&temporary_path)?;
    serde_json::to_writer(&mut file, tokens)?;
    file.flush()?;
    file.sync_all()?;
    drop(file);

    if backup_path.exists() {
        std::fs::remove_file(&backup_path)?;
    }
    if path.exists() {
        std::fs::rename(path, &backup_path)?;
    }
    if let Err(error) = std::fs::rename(&temporary_path, path) {
        if backup_path.exists() {
            let _ = std::fs::rename(&backup_path, path);
        }
        return Err(error.into());
    }
    if backup_path.exists() {
        std::fs::remove_file(backup_path)?;
    }
    Ok(())
}

#[cfg(windows)]
fn protect_secret(secret: &[u8]) -> Result<Vec<u8>, Error> {
    use std::{ptr, slice};
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB},
    };

    let input = CRYPT_INTEGER_BLOB {
        cbData: secret.len() as u32,
        pbData: secret.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    let success = unsafe {
        CryptProtectData(
            &input,
            ptr::null(),
            ptr::null(),
            ptr::null(),
            ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if success == 0 {
        return Err(std::io::Error::last_os_error().into());
    }
    let encrypted =
        unsafe { slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
    unsafe {
        LocalFree(output.pbData.cast());
    }
    Ok(encrypted)
}

#[cfg(windows)]
fn unprotect_secret(secret: &[u8]) -> Result<Vec<u8>, Error> {
    use std::{ptr, slice};
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        },
    };

    let input = CRYPT_INTEGER_BLOB {
        cbData: secret.len() as u32,
        pbData: secret.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    let success = unsafe {
        CryptUnprotectData(
            &input,
            ptr::null_mut(),
            ptr::null(),
            ptr::null(),
            ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if success == 0 {
        return Err(std::io::Error::last_os_error().into());
    }
    let decrypted =
        unsafe { slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
    unsafe {
        LocalFree(output.pbData.cast());
    }
    Ok(decrypted)
}

#[cfg(not(windows))]
fn protect_secret(_secret: &[u8]) -> Result<Vec<u8>, Error> {
    Err(Error::SecureStorage(
        "Secure token storage is not available on this platform".to_string(),
    ))
}

#[cfg(not(windows))]
fn unprotect_secret(_secret: &[u8]) -> Result<Vec<u8>, Error> {
    Err(Error::SecureStorage(
        "Secure token storage is not available on this platform".to_string(),
    ))
}

#[tauri::command]
#[specta::specta]
pub fn secure_token_storage_available() -> bool {
    let probe = b"onyx-secure-storage-probe";
    protect_secret(probe)
        .and_then(|encrypted| unprotect_secret(&encrypted))
        .is_ok_and(|decrypted| decrypted == probe)
}

#[tauri::command]
#[specta::specta]
pub fn store_lichess_token(app: AppHandle, username: String, token: String) -> Result<(), Error> {
    if !cfg!(windows) {
        return Err(Error::SecureStorage(
            "Secure token storage is not available on this platform".to_string(),
        ));
    }
    if token.is_empty() || token.len() > 16 * 1024 {
        return Err(Error::SecureStorage("Invalid Lichess token".to_string()));
    }
    let username = normalized_username(&username)?;
    let _guard = TOKEN_STORE_LOCK
        .lock()
        .map_err(|_| Error::SecureStorage("Token store lock is poisoned".to_string()))?;
    let path = token_store_path(&app)?;
    let mut tokens = read_tokens(&path)?;
    tokens.insert(username, protect_secret(token.as_bytes())?);
    write_tokens(&path, &tokens)
}

#[tauri::command]
#[specta::specta]
pub fn get_lichess_token(app: AppHandle, username: String) -> Result<Option<String>, Error> {
    if !cfg!(windows) {
        return Ok(None);
    }
    let username = normalized_username(&username)?;
    let _guard = TOKEN_STORE_LOCK
        .lock()
        .map_err(|_| Error::SecureStorage("Token store lock is poisoned".to_string()))?;
    let path = token_store_path(&app)?;
    let Some(encrypted) = read_tokens(&path)?.get(&username).cloned() else {
        return Ok(None);
    };
    let token = String::from_utf8(unprotect_secret(&encrypted)?)
        .map_err(|_| Error::SecureStorage("Stored Lichess token is not valid UTF-8".to_string()))?;
    Ok(Some(token))
}

#[tauri::command]
#[specta::specta]
pub fn delete_lichess_token(app: AppHandle, username: String) -> Result<(), Error> {
    if !cfg!(windows) {
        return Ok(());
    }
    let username = normalized_username(&username)?;
    let _guard = TOKEN_STORE_LOCK
        .lock()
        .map_err(|_| Error::SecureStorage("Token store lock is poisoned".to_string()))?;
    let path = token_store_path(&app)?;
    let mut tokens = read_tokens(&path)?;
    if tokens.remove(&username).is_some() {
        write_tokens(&path, &tokens)?;
    }
    Ok(())
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn windows_dpapi_round_trip_is_bound_to_the_current_user() {
        let secret = b"lichess-token-test";
        let Ok(encrypted) = protect_secret(secret) else {
            eprintln!("DPAPI is unavailable for this test account; skipping round-trip assertion");
            return;
        };
        assert_ne!(encrypted, secret);
        assert_eq!(unprotect_secret(&encrypted).unwrap(), secret);
    }
}
