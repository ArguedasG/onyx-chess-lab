//! Moves the contents of a data folder (databases, engines, puzzles or files) when the user picks a
//! new one in Settings, and rewrites the absolute paths that pointed into the old folder.

use std::{
    collections::BTreeSet,
    fs, io,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;
use tauri::{AppHandle, Manager};

use crate::{
    error::Error,
    identifier_migration::{rewrite_json_value, write_json_atomic, JSON_FILES_TO_REWRITE},
    AppState,
};

/// Prefix of the temporary copy of an entry while it crosses to another drive.
const TEMP_PREFIX: &str = ".onyx-moving-";

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DataFolderKind {
    Files,
    Databases,
    Engines,
    Puzzles,
}

#[derive(Debug, Default, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DataFolderMovePreview {
    /// Files and folders directly inside the old folder that would move.
    pub entries: u32,
    /// Every file that would move, counting the ones inside folders.
    pub files: u32,
    pub bytes: f64,
    /// Names that exist in both folders; they stay in the old folder.
    pub conflicts: Vec<String>,
    /// The new folder already has something in it.
    pub target_has_entries: bool,
}

#[derive(Debug, Default, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DataFolderMoveResult {
    /// Names of the entries now in the new folder.
    pub moved: Vec<String>,
    /// Names left in the old folder because the new one already had them.
    pub skipped: Vec<String>,
    /// Entries copied to another drive whose old copy could not be deleted.
    pub leftovers: Vec<String>,
}

enum Moved {
    Renamed(String),
    Copied(String),
}

/// `path` with its existing part resolved, so links, `..` and letter case compare reliably even
/// when the last folders do not exist yet.
fn comparable(path: &Path) -> PathBuf {
    let mut existing = path;
    let mut missing = Vec::new();
    loop {
        if let Ok(mut resolved) = existing.canonicalize() {
            for part in missing.iter().rev() {
                resolved.push(part);
            }
            return resolved;
        }
        match (existing.parent(), existing.file_name()) {
            (Some(parent), Some(name)) => {
                missing.push(name.to_os_string());
                existing = parent;
            }
            _ => return path.to_path_buf(),
        }
    }
}

fn check_folders(from: &Path, to: &Path) -> Result<(), Error> {
    let from = comparable(from);
    let to = comparable(to);
    if from == to {
        return Err(Error::InvalidRequest(
            "The new folder is the same as the current one.".into(),
        ));
    }
    if to.starts_with(&from) || from.starts_with(&to) {
        return Err(Error::InvalidRequest(
            "One folder is inside the other; choose a folder outside the current one.".into(),
        ));
    }
    Ok(())
}

fn entry_names(dir: &Path) -> io::Result<Vec<String>> {
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut names = Vec::new();
    for entry in fs::read_dir(dir)? {
        let name = entry?.file_name().to_string_lossy().into_owned();
        if !name.starts_with(TEMP_PREFIX) {
            names.push(name);
        }
    }
    names.sort();
    Ok(names)
}

fn exists_no_follow(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok()
}

fn measure(path: &Path, files: &mut u32, bytes: &mut f64) -> io::Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.is_dir() {
        for entry in fs::read_dir(path)? {
            measure(&entry?.path(), files, bytes)?;
        }
    } else {
        *files += 1;
        *bytes += metadata.len() as f64;
    }
    Ok(())
}

pub(crate) fn preview(from: &Path, to: &Path) -> Result<DataFolderMovePreview, Error> {
    check_folders(from, to)?;
    let mut preview = DataFolderMovePreview {
        target_has_entries: !entry_names(to)?.is_empty(),
        ..Default::default()
    };
    for name in entry_names(from)? {
        if exists_no_follow(&to.join(&name)) {
            preview.conflicts.push(name);
            continue;
        }
        preview.entries += 1;
        measure(&from.join(&name), &mut preview.files, &mut preview.bytes)?;
    }
    Ok(preview)
}

fn remove_path(path: &Path) -> io::Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
}

/// Copies a file or a folder, keeping links as links on Unix. `skip` is left out of the copy.
fn copy_path(source: &Path, target: &Path, skip: Option<&Path>) -> io::Result<()> {
    if skip.is_some_and(|skip| source == skip) {
        return Ok(());
    }
    let metadata = fs::symlink_metadata(source)?;
    #[cfg(unix)]
    if metadata.file_type().is_symlink() {
        return std::os::unix::fs::symlink(fs::read_link(source)?, target);
    }
    if metadata.is_dir() || (metadata.file_type().is_symlink() && source.is_dir()) {
        fs::create_dir_all(target)?;
        for entry in fs::read_dir(source)? {
            let entry = entry?;
            copy_path(&entry.path(), &target.join(entry.file_name()), skip)?;
        }
        Ok(())
    } else {
        fs::copy(source, target).map(|_| ())
    }
}

fn move_entry(
    from: &Path,
    to: &Path,
    name: &str,
    skip: Option<&Path>,
    force_copy: bool,
) -> io::Result<Moved> {
    let source = from.join(name);
    let target = to.join(name);
    if !force_copy {
        match fs::rename(&source, &target) {
            Ok(()) => return Ok(Moved::Renamed(name.to_string())),
            Err(error) if error.kind() != io::ErrorKind::CrossesDevices => return Err(error),
            Err(_) => {}
        }
    }
    // Another drive: copy beside the target first, so a failure never leaves half an entry.
    let temp = to.join(format!("{TEMP_PREFIX}{name}"));
    if exists_no_follow(&temp) {
        remove_path(&temp)?;
    }
    let copied = copy_path(&source, &temp, skip).and_then(|()| fs::rename(&temp, &target));
    if let Err(error) = copied {
        let _ = remove_path(&temp);
        return Err(error);
    }
    Ok(Moved::Copied(name.to_string()))
}

fn roll_back(from: &Path, to: &Path, done: &[Moved]) {
    for moved in done.iter().rev() {
        match moved {
            Moved::Renamed(name) => {
                if let Err(error) = fs::rename(to.join(name), from.join(name)) {
                    log::error!("Could not move {name} back to {}: {error}", from.display());
                }
            }
            Moved::Copied(name) => {
                let _ = remove_path(&to.join(name));
            }
        }
    }
}

/// Moves every entry of `from` into `to`, leaving in place the ones `to` already has. Nothing is
/// deleted from `from` until every entry is safely in `to`; if one fails, the others go back.
pub(crate) fn move_contents(
    from: &Path,
    to: &Path,
    skip: Option<&Path>,
    force_copy: bool,
) -> Result<DataFolderMoveResult, Error> {
    check_folders(from, to)?;
    fs::create_dir_all(to)?;

    let mut result = DataFolderMoveResult::default();
    let mut done = Vec::new();
    for name in entry_names(from)? {
        if exists_no_follow(&to.join(&name)) {
            result.skipped.push(name);
            continue;
        }
        match move_entry(from, to, &name, skip, force_copy) {
            Ok(moved) => done.push(moved),
            Err(error) => {
                roll_back(from, to, &done);
                return Err(Error::InvalidRequest(format!(
                    "Could not move \"{name}\" ({error}). Nothing was moved. If a game, analysis \
                     or import is using it, wait until it finishes and try again."
                )));
            }
        }
    }

    for moved in done {
        match moved {
            Moved::Renamed(name) => result.moved.push(name),
            Moved::Copied(name) => {
                if let Err(error) = remove_path(&from.join(&name)) {
                    log::warn!("Could not delete the old copy of {name}: {error}");
                    result.leftovers.push(name.clone());
                }
                result.moved.push(name);
            }
        }
    }
    Ok(result)
}

/// Rewrites, in one JSON file, the paths of the moved entries.
fn rewrite_json_file(path: &Path, prefixes: &[(String, String)]) -> io::Result<()> {
    let Ok(contents) = fs::read_to_string(path) else {
        return Ok(());
    };
    let Ok(mut value) = serde_json::from_str::<Value>(&contents) else {
        return Ok(());
    };
    let mut changed = false;
    for (old, new) in prefixes {
        changed |= rewrite_json_value(&mut value, old, new, cfg!(windows));
    }
    if changed {
        write_json_atomic(path, &value)?;
    }
    Ok(())
}

fn moved_prefixes(from: &Path, to: &Path, moved: &[String]) -> Vec<(String, String)> {
    moved
        .iter()
        .map(|name| {
            (
                from.join(name).to_string_lossy().into_owned(),
                to.join(name).to_string_lossy().into_owned(),
            )
        })
        .collect()
}

fn maia_root(engines_dir: &Path) -> PathBuf {
    engines_dir.join("managed").join("maia3")
}

/// What a move would carry and what would stay, without touching anything.
#[tauri::command]
#[specta::specta]
pub async fn preview_data_folder_move(
    from: PathBuf,
    to: PathBuf,
) -> Result<DataFolderMovePreview, Error> {
    tokio::task::spawn_blocking(move || preview(&from, &to))
        .await
        .map_err(|error| Error::InvalidRequest(error.to_string()))?
}

/// Moves the contents of a data folder to a new one and points every saved path at it. The
/// frontend rewrites its own storage with the returned names and then saves the new folder.
#[tauri::command]
#[specta::specta]
pub async fn move_data_folder(
    app: AppHandle,
    kind: DataFolderKind,
    from: PathBuf,
    to: PathBuf,
    state: tauri::State<'_, AppState>,
) -> Result<DataFolderMoveResult, Error> {
    // Any folder may hold databases (one data folder can be inside another).
    crate::db::release_databases_in(&state, &from);
    match kind {
        DataFolderKind::Engines => {
            // Analysis engines restart on their own; their binaries may be locked while running.
            let keys: Vec<_> = state
                .engine_processes
                .iter()
                .map(|entry| entry.key().clone())
                .collect();
            for key in keys {
                if let Some((_, process)) = state.engine_processes.remove(&key) {
                    process.lock().await.kill_sync();
                }
            }
        }
        DataFolderKind::Files | DataFolderKind::Databases | DataFolderKind::Puzzles => {}
    }

    // Managed Maia's Python environment stores absolute paths, so it cannot work after a move.
    // It is not copied between drives; Onyx offers the one-click Repair that rebuilds it.
    let maia_venv = maia_root(&from).join(".venv");
    let skip = (kind == DataFolderKind::Engines).then_some(maia_venv);

    let (from_task, to_task) = (from.clone(), to.clone());
    let result = tokio::task::spawn_blocking(move || {
        move_contents(&from_task, &to_task, skip.as_deref(), false)
    })
    .await
    .map_err(|error| Error::InvalidRequest(error.to_string()))??;

    let prefixes = moved_prefixes(&from, &to, &result.moved);
    let app_data = app.path().app_data_dir()?;
    let mut json_files: BTreeSet<PathBuf> = JSON_FILES_TO_REWRITE
        .iter()
        .map(|relative| app_data.join(relative))
        .collect();
    if kind == DataFolderKind::Engines {
        json_files.insert(to.join("engines.json"));
        json_files.insert(maia_root(&to).join("onyx-managed-maia3.json"));
        let moved_venv = maia_root(&to).join(".venv");
        if exists_no_follow(&moved_venv) {
            if let Err(error) = remove_path(&moved_venv) {
                log::warn!("Could not clear the moved Maia environment: {error}");
            }
        }
    }
    for path in json_files {
        if let Err(error) = rewrite_json_file(&path, &prefixes) {
            log::warn!("Could not update the paths in {}: {error}", path.display());
        }
    }

    log::info!(
        "Moved {} entries from {} to {} ({} left in place)",
        result.moved.len(),
        from.display(),
        to.display(),
        result.skipped.len()
    );
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn write(path: &Path, contents: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
    }

    #[test]
    fn moves_everything_and_leaves_conflicts_in_place() {
        for force_copy in [false, true] {
            let root = tempdir().unwrap();
            let from = root.path().join("old");
            let to = root.path().join("new");
            write(&from.join("games.db3"), "games");
            write(&from.join("broadcasts").join("event.pgn"), "pgn");
            write(&from.join("shared.db3"), "old shared");
            write(&to.join("shared.db3"), "new shared");

            let result = move_contents(&from, &to, None, force_copy).unwrap();

            assert_eq!(result.moved, vec!["broadcasts", "games.db3"]);
            assert_eq!(result.skipped, vec!["shared.db3"]);
            assert!(result.leftovers.is_empty());
            assert_eq!(fs::read_to_string(to.join("games.db3")).unwrap(), "games");
            assert_eq!(
                fs::read_to_string(to.join("broadcasts").join("event.pgn")).unwrap(),
                "pgn"
            );
            assert_eq!(
                fs::read_to_string(to.join("shared.db3")).unwrap(),
                "new shared"
            );
            assert_eq!(
                fs::read_to_string(from.join("shared.db3")).unwrap(),
                "old shared"
            );
            assert!(!from.join("games.db3").exists());
            assert!(!to.join(format!("{TEMP_PREFIX}broadcasts")).exists());
        }
    }

    #[test]
    fn previews_without_touching_anything() {
        let root = tempdir().unwrap();
        let from = root.path().join("old");
        let to = root.path().join("new");
        write(&from.join("a.db3"), "1234");
        write(&from.join("dir").join("b.txt"), "56");
        write(&from.join("c.db3"), "x");
        write(&to.join("c.db3"), "y");

        let preview = preview(&from, &to).unwrap();

        assert_eq!(preview.entries, 2);
        assert_eq!(preview.files, 2);
        assert_eq!(preview.bytes, 6.0);
        assert_eq!(preview.conflicts, vec!["c.db3"]);
        assert!(preview.target_has_entries);
        assert!(from.join("a.db3").exists());
    }

    #[test]
    fn a_missing_old_folder_moves_nothing() {
        let root = tempdir().unwrap();
        let result = move_contents(
            &root.path().join("missing"),
            &root.path().join("new"),
            None,
            false,
        )
        .unwrap();
        assert_eq!(result, DataFolderMoveResult::default());
    }

    #[test]
    fn rejects_the_same_or_nested_folders() {
        let root = tempdir().unwrap();
        let from = root.path().join("old");
        fs::create_dir_all(&from).unwrap();
        assert!(move_contents(&from, &from, None, false).is_err());
        assert!(move_contents(&from, &from.join("inner"), None, false).is_err());
        assert!(move_contents(&from, root.path(), None, false).is_err());
    }

    #[test]
    fn copying_between_drives_leaves_out_the_skipped_folder() {
        let root = tempdir().unwrap();
        let from = root.path().join("old");
        let to = root.path().join("new");
        let venv = maia_root(&from).join(".venv");
        write(&venv.join("bin").join("python"), "py");
        write(
            &maia_root(&from).join("onyx-managed-maia3.json"),
            "{\"version\":1}",
        );

        let result = move_contents(&from, &to, Some(&venv), true).unwrap();

        assert_eq!(result.moved, vec!["managed"]);
        assert!(maia_root(&to).join("onyx-managed-maia3.json").is_file());
        assert!(!maia_root(&to).join(".venv").exists());
        assert!(!from.join("managed").exists());
    }

    #[test]
    fn rewrites_only_the_moved_entries() {
        let root = tempdir().unwrap();
        let from = root.path().join("old");
        let to = root.path().join("new");
        let json = root.path().join("engines.json");
        let moved = from.join("stockfish").join("sf.exe");
        let stayed = from.join("kept").join("engine.exe");
        fs::write(
            &json,
            serde_json::to_string(&serde_json::json!([
                { "path": moved.to_string_lossy() },
                { "path": stayed.to_string_lossy() },
            ]))
            .unwrap(),
        )
        .unwrap();

        rewrite_json_file(
            &json,
            &moved_prefixes(&from, &to, &["stockfish".to_string()]),
        )
        .unwrap();

        let value: Value = serde_json::from_str(&fs::read_to_string(&json).unwrap()).unwrap();
        assert_eq!(
            value[0]["path"],
            to.join("stockfish")
                .join("sf.exe")
                .to_string_lossy()
                .as_ref()
        );
        assert_eq!(value[1]["path"], stayed.to_string_lossy().as_ref());
    }
}
