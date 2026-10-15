//! Persistent cache of engine evaluations by position, so a position analyzed once (the same
//! opening in dozens of games of a Player Analysis, a report run again) costs nothing the next time.
//!
//! The key is the position (board, side to move, castling and en passant; not the move counters),
//! the engine (file, size, modification time, arguments and options other than `Threads` and
//! `Hash`), the search limit and the number of lines. Changing any of them misses the cache.
//! Repetitions and the fifty-move counter are not part of the key, so a cached evaluation can
//! differ from a fresh one in those rare positions.
//!
//! It lives in its own SQLite file in Onyx's data folder, never inside a game database, and every
//! failure is ignored: without the cache the analysis simply runs the engine.

use std::{
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::Manager;

use crate::{engine::EngineOption, error::Error};

const FILE_NAME: &str = "analysis-cache-v1.sqlite";
const SCHEMA_VERSION: i32 = 1;
/// About 400 bytes per position with two lines: roughly 80 MB at the limit.
pub const MAX_ENTRIES: i64 = 200_000;
/// Options that change speed, not the evaluation, are left out of the key.
const IGNORED_OPTIONS: [&str; 3] = ["threads", "hash", "multipv"];

/// One engine line as stored in the cache, independent of the engine crate's types.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CachedLine {
    pub multipv: u16,
    pub depth: u32,
    pub nodes: u32,
    pub nps: u32,
    /// `true` for mate in `value` moves, `false` for centipawns. White's perspective.
    pub mate: bool,
    pub value: i32,
    pub wdl: Option<(i32, i32, i32)>,
    pub uci: Vec<String>,
    pub san: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisCacheInfo {
    pub entries: u32,
    pub bytes: u64,
    pub max_entries: u32,
}

pub fn cache_path(app: &tauri::AppHandle) -> Result<PathBuf, Error> {
    Ok(app.path().app_data_dir()?.join(FILE_NAME))
}

/// What identifies an engine for the cache: its file (as it is now), arguments and options.
pub fn engine_identity(path: &Path, args: &[String], options: &[EngineOption]) -> String {
    let metadata = std::fs::metadata(path).ok();
    let size = metadata.as_ref().map(|meta| meta.len()).unwrap_or_default();
    let modified = metadata
        .and_then(|meta| meta.modified().ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|time| time.as_secs())
        .unwrap_or_default();
    let mut options: Vec<String> = options
        .iter()
        .filter(|option| !IGNORED_OPTIONS.contains(&option.name.to_ascii_lowercase().as_str()))
        .map(|option| format!("{}={}", option.name, option.value))
        .collect();
    options.sort();
    format!(
        "{}|{size}|{modified}|{}|{}",
        path.display(),
        args.join(" "),
        options.join(";")
    )
}

/// The position part of a FEN: everything but the halfmove and fullmove counters.
pub fn position_key(fen: &str) -> String {
    fen.split_whitespace().take(4).collect::<Vec<_>>().join(" ")
}

/// Key of a novelty search: the reference base as it is now (path, size and modification
/// time, so an updated base searches again), the reference date or players and the positions.
pub fn novelty_key(
    database: &Path,
    date: Option<&str>,
    players: Option<(&str, &str)>,
    fens: &[String],
) -> String {
    let metadata = std::fs::metadata(database).ok();
    let size = metadata.as_ref().map(|meta| meta.len()).unwrap_or_default();
    let modified = metadata
        .and_then(|meta| meta.modified().ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|time| time.as_secs())
        .unwrap_or_default();
    let positions: Vec<String> = fens.iter().map(|fen| position_key(fen)).collect();
    format!(
        "{}|{size}|{modified}|{}|{}|{}",
        database.display(),
        date.unwrap_or_default(),
        players
            .map(|(white, black)| format!("{white}/{black}"))
            .unwrap_or_default(),
        positions.join(";")
    )
}

pub fn entry_key(engine: &str, limit: &str, lines: u16, fen: &str) -> String {
    format!("{engine}#{limit}#{lines}#{}", position_key(fen))
}

/// The connection sits behind a mutex so analyses can hold the cache across engine awaits.
pub struct AnalysisCache {
    connection: std::sync::Mutex<Connection>,
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|time| time.as_secs() as i64)
        .unwrap_or_default()
}

impl AnalysisCache {
    pub fn open(path: &Path) -> Result<Self, Error> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let connection = Connection::open(path)?;
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.pragma_update(None, "synchronous", "NORMAL")?;
        let version: i32 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
        if version != SCHEMA_VERSION {
            // A cache is disposable: an unknown version is replaced, never migrated.
            connection.execute_batch(&format!(
                "DROP TABLE IF EXISTS evaluations;
                 CREATE TABLE evaluations (
                     key TEXT PRIMARY KEY,
                     lines TEXT NOT NULL,
                     used INTEGER NOT NULL
                 );
                 CREATE INDEX evaluations_used ON evaluations(used);
                 PRAGMA user_version = {SCHEMA_VERSION};"
            ))?;
        }
        // Novelty searches scan a whole reference base (20–30 s on 10 M games), so their result is
        // kept too. Added without a version change so existing evaluations stay.
        connection.execute_batch(
            "CREATE TABLE IF NOT EXISTS novelties (
                 key TEXT PRIMARY KEY,
                 found TEXT NOT NULL,
                 used INTEGER NOT NULL
             );",
        )?;
        Ok(Self {
            connection: std::sync::Mutex::new(connection),
        })
    }

    fn connection(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.connection
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn get(&self, key: &str) -> Option<Vec<CachedLine>> {
        let connection = self.connection();
        let lines: Option<String> = connection
            .query_row(
                "SELECT lines FROM evaluations WHERE key = ?1",
                [key],
                |row| row.get(0),
            )
            .optional()
            .ok()
            .flatten();
        let lines = serde_json::from_str(&lines?).ok()?;
        let _ = connection.execute(
            "UPDATE evaluations SET used = ?1 WHERE key = ?2",
            params![now(), key],
        );
        Some(lines)
    }

    pub fn put(&self, key: &str, lines: &[CachedLine]) {
        let Ok(json) = serde_json::to_string(lines) else {
            return;
        };
        let _ = self.connection().execute(
            "INSERT OR REPLACE INTO evaluations (key, lines, used) VALUES (?1, ?2, ?3)",
            params![key, json, now()],
        );
    }

    /// Which positions of a game were found in a reference base, if that search was done before.
    pub fn get_novelty(&self, key: &str) -> Option<Vec<bool>> {
        let connection = self.connection();
        let found: Option<String> = connection
            .query_row("SELECT found FROM novelties WHERE key = ?1", [key], |row| {
                row.get(0)
            })
            .optional()
            .ok()
            .flatten();
        let _ = connection.execute(
            "UPDATE novelties SET used = ?1 WHERE key = ?2",
            params![now(), key],
        );
        serde_json::from_str(&found?).ok()
    }

    pub fn put_novelty(&self, key: &str, found: &[bool]) {
        let Ok(json) = serde_json::to_string(found) else {
            return;
        };
        let connection = self.connection();
        let _ = connection.execute(
            "INSERT OR REPLACE INTO novelties (key, found, used) VALUES (?1, ?2, ?3)",
            params![key, json, now()],
        );
        // A few thousand reports at most; the oldest go first.
        let _ = connection.execute(
            "DELETE FROM novelties WHERE key IN
                (SELECT key FROM novelties ORDER BY used DESC LIMIT -1 OFFSET 5000)",
            [],
        );
    }

    /// Keeps the cache under `max_entries` by dropping the least recently used tenth above it.
    pub fn prune(&self, max_entries: i64) {
        let connection = self.connection();
        let Ok(count) = connection.query_row("SELECT COUNT(*) FROM evaluations", [], |row| {
            row.get::<_, i64>(0)
        }) else {
            return;
        };
        if count <= max_entries {
            return;
        }
        let remove = count - max_entries + max_entries / 10;
        let _ = connection.execute(
            "DELETE FROM evaluations WHERE key IN
                (SELECT key FROM evaluations ORDER BY used ASC LIMIT ?1)",
            [remove],
        );
    }

    pub fn entries(&self) -> i64 {
        self.connection()
            .query_row("SELECT COUNT(*) FROM evaluations", [], |row| row.get(0))
            .unwrap_or_default()
    }
}

fn file_size(path: &Path) -> u64 {
    ["", "-wal", "-shm"]
        .iter()
        .filter_map(|suffix| {
            let mut name = path.as_os_str().to_owned();
            name.push(suffix);
            std::fs::metadata(PathBuf::from(name)).ok()
        })
        .map(|meta| meta.len())
        .sum()
}

#[tauri::command]
#[specta::specta]
pub async fn get_analysis_cache_info(app: tauri::AppHandle) -> Result<AnalysisCacheInfo, Error> {
    let path = cache_path(&app)?;
    let entries = if path.exists() {
        AnalysisCache::open(&path)?.entries()
    } else {
        0
    };
    Ok(AnalysisCacheInfo {
        entries: entries as u32,
        bytes: file_size(&path),
        max_entries: MAX_ENTRIES as u32,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn clear_analysis_cache(app: tauri::AppHandle) -> Result<(), Error> {
    let path = cache_path(&app)?;
    if path.exists() {
        let cache = AnalysisCache::open(&path)?;
        let connection = cache.connection();
        connection.execute("DELETE FROM evaluations", [])?;
        connection.execute("DELETE FROM novelties", [])?;
        connection.execute_batch("VACUUM;")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(value: i32) -> CachedLine {
        CachedLine {
            multipv: 1,
            depth: 20,
            nodes: 1000,
            nps: 10,
            mate: false,
            value,
            wdl: None,
            uci: vec!["e2e4".to_string()],
            san: vec!["e4".to_string()],
        }
    }

    #[test]
    fn keys_ignore_move_counters_and_speed_options() {
        let start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let later = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 4 3";
        assert_eq!(
            entry_key("sf", "time:500", 2, start),
            entry_key("sf", "time:500", 2, later)
        );
        assert_ne!(
            entry_key("sf", "time:500", 2, start),
            entry_key("sf", "time:900", 2, start)
        );
        let option = |name: &str, value: &str| EngineOption {
            name: name.to_string(),
            value: value.to_string(),
        };
        let path = Path::new("missing-engine.exe");
        assert_eq!(
            engine_identity(
                path,
                &[],
                &[option("Threads", "8"), option("Contempt", "0")]
            ),
            engine_identity(path, &[], &[option("Contempt", "0"), option("Hash", "512")]),
        );
        assert_ne!(
            engine_identity(path, &[], &[option("Contempt", "0")]),
            engine_identity(path, &[], &[option("Contempt", "10")]),
        );
    }

    #[test]
    fn stores_reads_and_prunes_the_least_recent() {
        let dir = tempfile::tempdir().unwrap();
        let cache = AnalysisCache::open(&dir.path().join(FILE_NAME)).unwrap();
        assert!(cache.get("a").is_none());
        cache.put("a", &[line(30)]);
        assert_eq!(cache.get("a"), Some(vec![line(30)]));
        for i in 0..30 {
            cache.put(&format!("k{i}"), &[line(i)]);
        }
        cache.prune(20);
        assert!(cache.entries() <= 20);
        assert!(cache.get_novelty("game").is_none());
        cache.put_novelty("game", &[true, true, false]);
        assert_eq!(cache.get_novelty("game"), Some(vec![true, true, false]));
        // Reopening keeps the data; an unknown schema version would drop it.
        drop(cache);
        let reopened = AnalysisCache::open(&dir.path().join(FILE_NAME)).unwrap();
        assert!(reopened.entries() > 0);
    }
}
