use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;
use tauri::{AppHandle, Manager};

use crate::error::Error;

pub const LEGACY_IDENTIFIER: &str = "org.encroissant.app";
pub const CURRENT_IDENTIFIER: &str = "io.github.arguedasg.onyxchesslab";
const MIGRATION_STATE_FILENAME: &str = ".onyx-identifier-migration-v1.json";

/// Markers that only Onyx Chess Lab creates inside the legacy data directory.
/// Pure En Croissant installations never have these files or folders, so they are left untouched.
const ONYX_DATA_MARKERS: &[&str] = &[
    "training-areas-v1.json",
    "player-analysis-v1.json",
    "mistake-queue-v1.json",
    "tactics-review-v1.json",
    "twins-v1.json",
    "tournaments-v1.json",
    "human-bot-history.json",
    "bot-ratings.json",
    "analysis-cache-v1.sqlite",
    "analysis-library-v1",
    "model-game-experiments-v1",
    "bot-leagues-v1",
    "studies",
    "books",
    "secrets/lichess-tokens.v1.json",
    "engines/managed/maia3/onyx-managed-maia3.json",
];

const ONYX_LOG_FILENAME: &str = "onyx-chess-lab.log";

/// Active configuration and user-data JSON files inside `app_data_dir` that may store absolute
/// paths pointing to the legacy data directory.
const JSON_FILES_TO_REWRITE: &[&str] = &[
    "engines/engines.json",
    "training-areas-v1.json",
    "training-areas-v1.localstorage-backup.json",
    "player-analysis-v1.json",
    "player-analysis-v1.localstorage-backup.json",
    "tactics-review-v1.json",
    "mistake-queue-v1.json",
    "twins-v1.json",
    "tournaments-v1.json",
    "human-bot-history.json",
    "books/library.json",
    "studies/library.json",
];

/// What the frontend needs to know about a finished data-directory migration. It stays available
/// after the localStorage rewrite: ids hashed from database paths keep using the old prefix.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Type)]
#[serde(rename_all = "camelCase")]
pub struct IdentifierMigrationInfo {
    pub old_data_dir: String,
    pub new_data_dir: String,
    /// The localStorage paths still point to the old directory.
    pub local_storage_pending: bool,
    /// The moved directory was shared with En Croissant and the user has not been told yet.
    pub en_croissant_notice_pending: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationState {
    from_identifier: String,
    to_identifier: String,
    old_data_dir: String,
    new_data_dir: String,
    local_storage_migrated: bool,
    /// Until 0.28 Onyx and En Croissant used the same folder; moving it leaves En Croissant empty.
    #[serde(default)]
    shared_with_en_croissant: bool,
    #[serde(default)]
    en_croissant_notice_shown: bool,
}

#[derive(Debug)]
struct MigrationLayout {
    legacy_data_dir: PathBuf,
    new_data_dir: PathBuf,
    /// Distinct local data directory on platforms where WebView storage lives separately from
    /// `app_data_dir` (Windows `%LOCALAPPDATA%` vs `%APPDATA%`).
    legacy_local_dir: Option<PathBuf>,
    new_local_dir: Option<PathBuf>,
    legacy_log_dir: PathBuf,
    /// Best-effort auxiliary directories (e.g., macOS Logs/WebKit, Linux XDG config).
    extra_dirs: Vec<(PathBuf, PathBuf)>,
    case_insensitive_paths: bool,
    /// Where an En Croissant installation would be; any that exists means the user has both apps.
    en_croissant_installs: Vec<PathBuf>,
}

impl MigrationLayout {
    fn detect() -> Option<Self> {
        #[cfg(target_os = "windows")]
        {
            let roaming = PathBuf::from(std::env::var_os("APPDATA")?);
            let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
            let legacy_data_dir = roaming.join(LEGACY_IDENTIFIER);
            let new_data_dir = roaming.join(CURRENT_IDENTIFIER);
            let (legacy_local_dir, new_local_dir, legacy_log_dir) = match local {
                Some(local_base) if local_base != roaming => {
                    let legacy_local = local_base.join(LEGACY_IDENTIFIER);
                    let new_local = local_base.join(CURRENT_IDENTIFIER);
                    let log_dir = legacy_local.join("logs");
                    (Some(legacy_local), Some(new_local), log_dir)
                }
                _ => {
                    let log_dir = legacy_data_dir.join("logs");
                    (None, None, log_dir)
                }
            };
            Some(Self {
                legacy_data_dir,
                new_data_dir,
                legacy_local_dir,
                new_local_dir,
                legacy_log_dir,
                extra_dirs: Vec::new(),
                case_insensitive_paths: true,
                en_croissant_installs: windows_en_croissant_installs(),
            })
        }

        #[cfg(target_os = "macos")]
        {
            let home = PathBuf::from(std::env::var_os("HOME")?);
            let app_support = home.join("Library").join("Application Support");
            let logs = home.join("Library").join("Logs");
            let webkit = home.join("Library").join("WebKit");
            let legacy_log_dir = logs.join(LEGACY_IDENTIFIER);
            Some(Self {
                legacy_data_dir: app_support.join(LEGACY_IDENTIFIER),
                new_data_dir: app_support.join(CURRENT_IDENTIFIER),
                legacy_local_dir: None,
                new_local_dir: None,
                legacy_log_dir: legacy_log_dir.clone(),
                extra_dirs: vec![
                    (legacy_log_dir, logs.join(CURRENT_IDENTIFIER)),
                    (
                        webkit.join(LEGACY_IDENTIFIER),
                        webkit.join(CURRENT_IDENTIFIER),
                    ),
                ],
                case_insensitive_paths: false,
                en_croissant_installs: vec![
                    PathBuf::from("/Applications/En Croissant.app"),
                    home.join("Applications").join("En Croissant.app"),
                ],
            })
        }

        #[cfg(all(unix, not(target_os = "macos")))]
        {
            let home = PathBuf::from(std::env::var_os("HOME")?);
            let data_home = std::env::var_os("XDG_DATA_HOME")
                .filter(|value| !value.is_empty())
                .map(PathBuf::from)
                .unwrap_or_else(|| home.join(".local").join("share"));
            let config_home = std::env::var_os("XDG_CONFIG_HOME")
                .filter(|value| !value.is_empty())
                .map(PathBuf::from)
                .unwrap_or_else(|| home.join(".config"));
            let legacy_data_dir = data_home.join(LEGACY_IDENTIFIER);
            let new_data_dir = data_home.join(CURRENT_IDENTIFIER);
            let legacy_log_dir = legacy_data_dir.join("logs");
            let extra_dirs = if config_home != data_home {
                vec![(
                    config_home.join(LEGACY_IDENTIFIER),
                    config_home.join(CURRENT_IDENTIFIER),
                )]
            } else {
                Vec::new()
            };
            Some(Self {
                legacy_data_dir,
                new_data_dir,
                legacy_local_dir: None,
                new_local_dir: None,
                legacy_log_dir,
                extra_dirs,
                case_insensitive_paths: false,
                en_croissant_installs: vec![
                    PathBuf::from("/usr/bin/en-croissant"),
                    PathBuf::from("/usr/local/bin/en-croissant"),
                    home.join(".local").join("bin").join("en-croissant"),
                ],
            })
        }
    }
}

#[cfg(target_os = "windows")]
fn windows_en_croissant_installs() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    for variable in ["LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(base) = std::env::var_os(variable).map(PathBuf::from) {
            candidates.push(base.join("En Croissant"));
            candidates.push(base.join("en-croissant"));
        }
    }
    candidates
}

/// Whether En Croissant used the legacy folder too: it is installed, or its log sits next to
/// Onyx's in the shared log folder (Onyx's own logs, rotated ones included, start with its name).
fn shared_with_en_croissant(layout: &MigrationLayout) -> bool {
    if layout
        .en_croissant_installs
        .iter()
        .any(|path| path.exists())
    {
        return true;
    }
    let Ok(entries) = fs::read_dir(&layout.legacy_log_dir) else {
        return false;
    };
    entries.flatten().any(|entry| {
        let name = entry.file_name().to_string_lossy().to_lowercase();
        name.ends_with(".log") && !name.starts_with("onyx-chess-lab")
    })
}

/// Runs once at process start, before Tauri initializes logging, window state, or the WebView.
/// Errors are logged to stderr and never prevent the application from launching.
pub fn migrate_legacy_identifier_if_needed() {
    let Some(layout) = MigrationLayout::detect() else {
        return;
    };
    if let Err(error) = run_migration(&layout) {
        eprintln!("Onyx identifier migration skipped after error: {error}");
    }
}

fn dir_has_entries(path: &Path) -> bool {
    fs::read_dir(path)
        .ok()
        .and_then(|mut entries| entries.next())
        .is_some()
}

fn is_onyx_installation(legacy_data_dir: &Path, legacy_log_dir: &Path) -> bool {
    if ONYX_DATA_MARKERS
        .iter()
        .any(|marker| legacy_data_dir.join(marker).exists())
    {
        return true;
    }
    legacy_log_dir.join(ONYX_LOG_FILENAME).is_file()
}

fn remove_if_empty_dir(path: &Path) -> std::io::Result<()> {
    if path.is_dir() && !dir_has_entries(path) {
        fs::remove_dir(path)?;
    }
    Ok(())
}

fn run_migration(layout: &MigrationLayout) -> std::io::Result<bool> {
    if layout.new_data_dir.join(MIGRATION_STATE_FILENAME).is_file() {
        return Ok(false);
    }
    if layout.new_data_dir.exists() && dir_has_entries(&layout.new_data_dir) {
        return Ok(false);
    }
    if !layout.legacy_data_dir.is_dir() {
        return Ok(false);
    }
    if !is_onyx_installation(&layout.legacy_data_dir, &layout.legacy_log_dir) {
        return Ok(false);
    }
    // Checked before anything moves: on macOS the log folder is one of the moved directories.
    let shared_with_en_croissant = shared_with_en_croissant(layout);

    // Move local WebView/log directory first (Windows) so a locked WebView2 instance aborts
    // cleanly before moving app_data_dir. If moving app_data_dir fails afterwards, roll back.
    let mut moved_local_dir = false;
    if let (Some(legacy_local), Some(new_local)) = (&layout.legacy_local_dir, &layout.new_local_dir)
    {
        if legacy_local.is_dir() && !dir_has_entries(new_local) {
            remove_if_empty_dir(new_local)?;
            if let Some(parent) = new_local.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::rename(legacy_local, new_local)?;
            moved_local_dir = true;
        }
    }

    if let Some(parent) = layout.new_data_dir.parent() {
        fs::create_dir_all(parent)?;
    }
    remove_if_empty_dir(&layout.new_data_dir)?;

    if let Err(error) = fs::rename(&layout.legacy_data_dir, &layout.new_data_dir) {
        if moved_local_dir {
            if let (Some(legacy_local), Some(new_local)) =
                (&layout.legacy_local_dir, &layout.new_local_dir)
            {
                let _ = fs::rename(new_local, legacy_local);
            }
        }
        return Err(error);
    }

    for (legacy_extra, new_extra) in &layout.extra_dirs {
        if legacy_extra.is_dir() && !dir_has_entries(new_extra) {
            let _ = remove_if_empty_dir(new_extra);
            if let Some(parent) = new_extra.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if let Err(error) = fs::rename(legacy_extra, new_extra) {
                eprintln!(
                    "Could not migrate auxiliary directory {} -> {}: {error}",
                    legacy_extra.display(),
                    new_extra.display()
                );
            }
        }
    }

    let old_prefix = layout.legacy_data_dir.to_string_lossy().into_owned();
    let new_prefix = layout.new_data_dir.to_string_lossy().into_owned();

    for relative in JSON_FILES_TO_REWRITE {
        let path = layout.new_data_dir.join(relative);
        if path.is_file() {
            if let Err(error) = rewrite_json_file_paths(
                &path,
                &old_prefix,
                &new_prefix,
                layout.case_insensitive_paths,
            ) {
                eprintln!(
                    "Could not rewrite migrated paths in {}: {error}",
                    path.display()
                );
            }
        }
    }

    // Managed Maia's Python `.venv` embeds absolute paths to the old directory inside launcher
    // binaries (Windows) and symlinks/shebangs (macOS/Linux). Removing `.venv` while keeping the
    // manifest lets Onyx mark Maia as needing a clean 1-click Repair instead of failing mysteriously.
    let maia_root = layout
        .new_data_dir
        .join("engines")
        .join("managed")
        .join("maia3");
    let maia_venv = maia_root.join(".venv");
    if maia_root.join("onyx-managed-maia3.json").is_file() && maia_venv.exists() {
        if let Err(error) = fs::remove_dir_all(&maia_venv) {
            eprintln!(
                "Could not clear relocated Maia venv at {}: {error}",
                maia_venv.display()
            );
        }
    }

    let state = MigrationState {
        from_identifier: LEGACY_IDENTIFIER.to_string(),
        to_identifier: CURRENT_IDENTIFIER.to_string(),
        old_data_dir: old_prefix,
        new_data_dir: new_prefix,
        local_storage_migrated: false,
        shared_with_en_croissant,
        en_croissant_notice_shown: false,
    };
    write_json_atomic(&layout.new_data_dir.join(MIGRATION_STATE_FILENAME), &state)?;

    Ok(true)
}

fn rewrite_json_file_paths(
    path: &Path,
    old_prefix: &str,
    new_prefix: &str,
    case_insensitive: bool,
) -> std::io::Result<bool> {
    let contents = fs::read_to_string(path)?;
    let mut value: Value = match serde_json::from_str(&contents) {
        Ok(parsed) => parsed,
        Err(_) => return Ok(false),
    };
    if !rewrite_json_value(&mut value, old_prefix, new_prefix, case_insensitive) {
        return Ok(false);
    }
    write_json_atomic(path, &value)?;
    Ok(true)
}

fn rewrite_json_value(
    value: &mut Value,
    old_prefix: &str,
    new_prefix: &str,
    case_insensitive: bool,
) -> bool {
    match value {
        Value::String(text) => {
            if let Some(rewritten) =
                rewrite_path_prefix(text, old_prefix, new_prefix, case_insensitive)
            {
                *text = rewritten;
                true
            } else {
                false
            }
        }
        Value::Array(items) => {
            let mut changed = false;
            for item in items {
                if rewrite_json_value(item, old_prefix, new_prefix, case_insensitive) {
                    changed = true;
                }
            }
            changed
        }
        Value::Object(map) => {
            let mut changed = false;
            for entry in map.values_mut() {
                if rewrite_json_value(entry, old_prefix, new_prefix, case_insensitive) {
                    changed = true;
                }
            }
            changed
        }
        _ => false,
    }
}

fn normalize_for_match(path: &str, case_insensitive: bool) -> String {
    let normalized = path.trim_end_matches(['/', '\\']).replace('\\', "/");
    if case_insensitive {
        normalized.to_lowercase()
    } else {
        normalized
    }
}

fn rewrite_path_prefix(
    value: &str,
    old_prefix: &str,
    new_prefix: &str,
    case_insensitive: bool,
) -> Option<String> {
    let old_norm = normalize_for_match(old_prefix, case_insensitive);
    if old_norm.is_empty() {
        return None;
    }
    let trimmed_new = new_prefix.trim_end_matches(['/', '\\']);

    // Compare character-by-character against the normalized old prefix so byte offsets stay valid
    // even if case conversion changes byte lengths in non-ASCII user directory names.
    let mut value_chars = value.char_indices();
    let mut matched_end = 0usize;
    for expected in old_norm.chars() {
        let (_, ch) = value_chars.next()?;
        let normalized_ch = if ch == '\\' { '/' } else { ch };
        let matches = if case_insensitive {
            normalized_ch.to_lowercase().eq(expected.to_lowercase())
        } else {
            normalized_ch == expected
        };
        if !matches {
            return None;
        }
        matched_end += ch.len_utf8();
    }

    let suffix = &value[matched_end..];
    if !suffix.is_empty() && !suffix.starts_with('/') && !suffix.starts_with('\\') {
        return None;
    }

    let replacement_prefix =
        if value[..matched_end].contains('/') && !value[..matched_end].contains('\\') {
            trimmed_new.replace('\\', "/")
        } else {
            trimmed_new.to_string()
        };

    Some(format!("{replacement_prefix}{suffix}"))
}

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> std::io::Result<()> {
    let parent = path.parent().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "path has no parent")
    })?;
    fs::create_dir_all(parent)?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("data.json");
    let temp_path = parent.join(format!("{file_name}.migrating.tmp"));
    let serialized = serde_json::to_vec_pretty(value)
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?;
    fs::write(&temp_path, serialized)?;
    if path.exists() {
        let backup_path = parent.join(format!("{file_name}.migrating.bak"));
        let _ = fs::remove_file(&backup_path);
        fs::rename(path, &backup_path)?;
        if let Err(error) = fs::rename(&temp_path, path) {
            let _ = fs::rename(&backup_path, path);
            return Err(error);
        }
        let _ = fs::remove_file(&backup_path);
    } else {
        fs::rename(&temp_path, path)?;
    }
    Ok(())
}

fn migration_state_path(app: &AppHandle) -> Result<PathBuf, Error> {
    Ok(app.path().app_data_dir()?.join(MIGRATION_STATE_FILENAME))
}

fn read_migration_state(app: &AppHandle) -> Result<Option<(PathBuf, MigrationState)>, Error> {
    let path = migration_state_path(app)?;
    if !path.is_file() {
        return Ok(None);
    }
    let state: MigrationState = serde_json::from_str(&fs::read_to_string(&path)?)?;
    Ok(Some((path, state)))
}

/// The finished migration, if this installation was migrated; `None` for a fresh installation.
#[tauri::command]
#[specta::specta]
pub fn get_identifier_migration(app: AppHandle) -> Result<Option<IdentifierMigrationInfo>, Error> {
    Ok(
        read_migration_state(&app)?.map(|(_, state)| IdentifierMigrationInfo {
            old_data_dir: state.old_data_dir,
            new_data_dir: state.new_data_dir,
            local_storage_pending: !state.local_storage_migrated,
            en_croissant_notice_pending: state.shared_with_en_croissant
                && !state.en_croissant_notice_shown,
        }),
    )
}

#[tauri::command]
#[specta::specta]
pub fn complete_identifier_migration(app: AppHandle) -> Result<(), Error> {
    if let Some((path, mut state)) = read_migration_state(&app)? {
        if !state.local_storage_migrated {
            state.local_storage_migrated = true;
            write_json_atomic(&path, &state)?;
        }
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn acknowledge_en_croissant_notice(app: AppHandle) -> Result<(), Error> {
    if let Some((path, mut state)) = read_migration_state(&app)? {
        if !state.en_croissant_notice_shown {
            state.en_croissant_notice_shown = true;
            write_json_atomic(&path, &state)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn test_layout(root: &Path) -> MigrationLayout {
        let roaming = root.join("roaming");
        let local = root.join("local");
        let extra = root.join("extra");
        MigrationLayout {
            legacy_data_dir: roaming.join(LEGACY_IDENTIFIER),
            new_data_dir: roaming.join(CURRENT_IDENTIFIER),
            legacy_local_dir: Some(local.join(LEGACY_IDENTIFIER)),
            new_local_dir: Some(local.join(CURRENT_IDENTIFIER)),
            legacy_log_dir: local.join(LEGACY_IDENTIFIER).join("logs"),
            extra_dirs: vec![(
                extra.join(LEGACY_IDENTIFIER),
                extra.join(CURRENT_IDENTIFIER),
            )],
            case_insensitive_paths: true,
            en_croissant_installs: vec![root.join("programs").join("En Croissant")],
        }
    }

    fn migrated_state(layout: &MigrationLayout) -> MigrationState {
        serde_json::from_str(
            &fs::read_to_string(layout.new_data_dir.join(MIGRATION_STATE_FILENAME)).unwrap(),
        )
        .unwrap()
    }

    fn onyx_only_installation(layout: &MigrationLayout) {
        fs::create_dir_all(&layout.legacy_data_dir).unwrap();
        fs::write(layout.legacy_data_dir.join("training-areas-v1.json"), "{}").unwrap();
        fs::create_dir_all(&layout.legacy_log_dir).unwrap();
        fs::write(layout.legacy_log_dir.join("onyx-chess-lab.log"), "").unwrap();
        fs::write(
            layout.legacy_log_dir.join("onyx-chess-lab_2026-11-01.log"),
            "",
        )
        .unwrap();
    }

    #[test]
    fn an_onyx_only_folder_is_not_marked_as_shared() {
        let temp = tempdir().unwrap();
        let layout = test_layout(temp.path());
        onyx_only_installation(&layout);
        assert!(run_migration(&layout).unwrap());
        assert!(!migrated_state(&layout).shared_with_en_croissant);
    }

    #[test]
    fn an_en_croissant_log_marks_the_folder_as_shared() {
        let temp = tempdir().unwrap();
        let layout = test_layout(temp.path());
        onyx_only_installation(&layout);
        fs::write(layout.legacy_log_dir.join("en-croissant.log"), "").unwrap();
        assert!(run_migration(&layout).unwrap());
        assert!(migrated_state(&layout).shared_with_en_croissant);
    }

    #[test]
    fn an_installed_en_croissant_marks_the_folder_as_shared() {
        let temp = tempdir().unwrap();
        let layout = test_layout(temp.path());
        onyx_only_installation(&layout);
        fs::create_dir_all(&layout.en_croissant_installs[0]).unwrap();
        assert!(run_migration(&layout).unwrap());
        assert!(migrated_state(&layout).shared_with_en_croissant);
    }

    #[test]
    fn states_written_before_the_notice_existed_still_load() {
        let state: MigrationState = serde_json::from_str(
            r#"{"fromIdentifier":"a","toIdentifier":"b","oldDataDir":"x","newDataDir":"y","localStorageMigrated":true}"#,
        )
        .unwrap();
        assert!(!state.shared_with_en_croissant);
        assert!(!state.en_croissant_notice_shown);
    }

    #[test]
    fn skips_when_legacy_directory_does_not_exist() {
        let temp = tempdir().unwrap();
        let layout = test_layout(temp.path());
        assert!(!run_migration(&layout).unwrap());
        assert!(!layout.new_data_dir.exists());
    }

    #[test]
    fn skips_pure_en_croissant_installation_without_onyx_markers() {
        let temp = tempdir().unwrap();
        let layout = test_layout(temp.path());
        fs::create_dir_all(layout.legacy_data_dir.join("db")).unwrap();
        fs::create_dir_all(layout.legacy_data_dir.join("engines")).unwrap();
        fs::write(
            layout.legacy_data_dir.join("engines").join("engines.json"),
            "[]",
        )
        .unwrap();
        fs::create_dir_all(layout.legacy_local_dir.as_ref().unwrap().join("EBWebView")).unwrap();

        assert!(!run_migration(&layout).unwrap());
        assert!(layout.legacy_data_dir.exists());
        assert!(!layout.new_data_dir.exists());
    }

    #[test]
    fn skips_when_new_directory_already_has_user_data() {
        let temp = tempdir().unwrap();
        let layout = test_layout(temp.path());
        fs::create_dir_all(&layout.legacy_data_dir).unwrap();
        fs::write(layout.legacy_data_dir.join("training-areas-v1.json"), "{}").unwrap();
        fs::create_dir_all(&layout.new_data_dir).unwrap();
        fs::write(
            layout.new_data_dir.join("training-areas-v1.json"),
            "{\"new\":true}",
        )
        .unwrap();

        assert!(!run_migration(&layout).unwrap());
        assert!(layout.legacy_data_dir.exists());
        assert_eq!(
            fs::read_to_string(layout.new_data_dir.join("training-areas-v1.json")).unwrap(),
            "{\"new\":true}"
        );
    }

    #[test]
    fn migrates_onyx_installation_rewrites_paths_and_clears_stale_maia_venv() {
        let temp = tempdir().unwrap();
        let layout = test_layout(temp.path());
        fs::create_dir_all(
            layout
                .legacy_data_dir
                .join("engines/managed/maia3/.venv/Scripts"),
        )
        .unwrap();
        fs::create_dir_all(layout.legacy_data_dir.join("secrets")).unwrap();
        fs::create_dir_all(layout.legacy_local_dir.as_ref().unwrap().join("EBWebView")).unwrap();
        fs::create_dir_all(&layout.legacy_log_dir).unwrap();
        fs::create_dir_all(&layout.extra_dirs[0].0).unwrap();

        let old_dir_str = layout.legacy_data_dir.to_string_lossy().into_owned();
        let new_dir_str = layout.new_data_dir.to_string_lossy().into_owned();

        let engines_json = serde_json::json!([
            {
                "name": "Stockfish",
                "path": format!("{old_dir_str}\\engines\\stockfish.exe")
            },
            {
                "name": "Custom",
                "path": "D:\\Chess\\lc0.exe"
            }
        ]);
        fs::write(
            layout.legacy_data_dir.join("engines/engines.json"),
            serde_json::to_string_pretty(&engines_json).unwrap(),
        )
        .unwrap();
        fs::write(
            layout.legacy_data_dir.join("player-analysis-v1.json"),
            serde_json::to_string(&serde_json::json!({
                "databasePath": format!("{old_dir_str}\\db\\games.db3")
            }))
            .unwrap(),
        )
        .unwrap();
        fs::write(
            layout
                .legacy_data_dir
                .join("engines/managed/maia3/onyx-managed-maia3.json"),
            "{\"version\":\"0.1.0\"}",
        )
        .unwrap();
        fs::write(
            layout
                .legacy_data_dir
                .join("engines/managed/maia3/.venv/Scripts/maia3-5m.exe"),
            b"stub",
        )
        .unwrap();
        fs::write(
            layout
                .legacy_data_dir
                .join("secrets/lichess-tokens.v1.json"),
            "{}",
        )
        .unwrap();
        fs::write(
            layout
                .legacy_local_dir
                .as_ref()
                .unwrap()
                .join("EBWebView/sentinel.txt"),
            "ok",
        )
        .unwrap();
        fs::write(layout.extra_dirs[0].0.join("window.json"), "{}").unwrap();

        assert!(run_migration(&layout).unwrap());
        assert!(!layout.legacy_data_dir.exists());
        assert!(layout.new_data_dir.is_dir());
        assert!(layout
            .new_local_dir
            .as_ref()
            .unwrap()
            .join("EBWebView/sentinel.txt")
            .is_file());
        assert!(layout.extra_dirs[0].1.join("window.json").is_file());
        assert!(layout
            .new_data_dir
            .join("secrets/lichess-tokens.v1.json")
            .is_file());

        // Stale Maia venv is cleared while manifest stays so Repair works cleanly.
        assert!(!layout
            .new_data_dir
            .join("engines/managed/maia3/.venv")
            .exists());
        assert!(layout
            .new_data_dir
            .join("engines/managed/maia3/onyx-managed-maia3.json")
            .is_file());

        // Paths inside JSON files were rewritten cleanly.
        let migrated_engines: Value = serde_json::from_str(
            &fs::read_to_string(layout.new_data_dir.join("engines/engines.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(
            migrated_engines[0]["path"].as_str().unwrap(),
            format!("{new_dir_str}\\engines\\stockfish.exe")
        );
        assert_eq!(
            migrated_engines[1]["path"].as_str().unwrap(),
            "D:\\Chess\\lc0.exe"
        );

        let migrated_pa: Value = serde_json::from_str(
            &fs::read_to_string(layout.new_data_dir.join("player-analysis-v1.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(
            migrated_pa["databasePath"].as_str().unwrap(),
            format!("{new_dir_str}\\db\\games.db3")
        );

        // Migration state file exists and is pending frontend localStorage rewrite.
        let state: MigrationState = serde_json::from_str(
            &fs::read_to_string(layout.new_data_dir.join(MIGRATION_STATE_FILENAME)).unwrap(),
        )
        .unwrap();
        assert!(!state.local_storage_migrated);
        assert_eq!(state.old_data_dir, old_dir_str);
        assert_eq!(state.new_data_dir, new_dir_str);

        // Second run is an idempotent no-op.
        assert!(!run_migration(&layout).unwrap());
    }

    #[test]
    fn rewrites_path_prefixes_safely_across_separators_and_case() {
        let old = r"C:\Users\Gabriel\AppData\Roaming\org.encroissant.app";
        let new = r"C:\Users\Gabriel\AppData\Roaming\io.github.arguedasg.onyxchesslab";

        assert_eq!(
            rewrite_path_prefix(old, old, new, true).as_deref(),
            Some(new)
        );
        assert_eq!(
            rewrite_path_prefix(
                r"c:\users\gabriel\appdata\roaming\org.encroissant.app\db\gigabase.db3",
                old,
                new,
                true
            )
            .as_deref(),
            Some(
                r"C:\Users\Gabriel\AppData\Roaming\io.github.arguedasg.onyxchesslab\db\gigabase.db3"
            )
        );
        assert_eq!(
            rewrite_path_prefix(
                "C:/Users/Gabriel/AppData/Roaming/org.encroissant.app/puzzles/lichess.db3",
                old,
                new,
                true
            )
            .as_deref(),
            Some("C:/Users/Gabriel/AppData/Roaming/io.github.arguedasg.onyxchesslab/puzzles/lichess.db3")
        );
        // Must NOT rewrite sibling folder with matching prefix.
        assert_eq!(
            rewrite_path_prefix(
                r"C:\Users\Gabriel\AppData\Roaming\org.encroissant.app2\db",
                old,
                new,
                true
            ),
            None
        );
        // Respects case sensitivity on Unix.
        assert_eq!(
            rewrite_path_prefix(
                "/home/user/.local/share/ORG.ENCROISSANT.APP/db",
                "/home/user/.local/share/org.encroissant.app",
                "/home/user/.local/share/io.github.arguedasg.onyxchesslab",
                false
            ),
            None
        );
    }
}
