//! Complete quality report: the checks that need every game's moves or every player's ratings.
//! Like the minimal report it only counts and never changes the base.
//!
//! One read of `Games` (moves included) feeds all the checks. Duplicates are found by hashing the
//! players and moves of each game and sorting the hashes, which needs 16 bytes per game (about
//! 160 MB for 10 M games) for a few seconds instead of a SQL `GROUP BY` over the movetexts.

use std::{
    collections::{hash_map::DefaultHasher, HashMap},
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};

use dashmap::DashMap;
use once_cell::sync::Lazy;
use serde::Serialize;
use specta::Type;

use super::{
    position_query::{is_weak_player, record_best_elo},
    WeakGamesFilter,
};
use crate::{error::Error, progress::update_progress, AppState};

/// A player whose ratings in the base differ by more than this probably mixes several people or
/// has wrong ratings.
pub const ELO_SPREAD_LIMIT: u32 = 1000;
/// Example names returned for each player check.
const EXAMPLES: usize = 12;
const PROGRESS_EVERY: u64 = 50_000;

static CANCELLED: Lazy<DashMap<String, Arc<AtomicBool>>> = Lazy::new(DashMap::new);

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseQualityDetails {
    pub games: u32,
    /// Extra copies of games with the same players, moves, event, site, round, date and time.
    pub exact_duplicates: u32,
    /// Extra copies of games with the same players and moves but other event, site, round or
    /// date: probably the same game imported from another source.
    pub probable_duplicates: u32,
    /// Players with an empty, placeholder or very short name, or digits in it.
    pub suspicious_names: u32,
    pub suspicious_name_examples: Vec<String>,
    /// Players whose ratings differ by more than `ELO_SPREAD_LIMIT`.
    pub inconsistent_elo_players: u32,
    pub inconsistent_elo_examples: Vec<String>,
    /// Games the "leave out games between weak players" filter of the position queries would
    /// leave out, for each of its settings, with exactly the same rule.
    pub weak_games: Vec<WeakGamesCount>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WeakGamesCount {
    /// `None`: both players without any rating.
    pub below: Option<i32>,
    pub games: u32,
}

/// The filter settings the report counts: both unrated, then both below each threshold.
pub const WEAK_THRESHOLDS: [i32; 9] = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800];

fn weak_filters() -> Vec<WeakGamesFilter> {
    std::iter::once(WeakGamesFilter {
        below: None,
        unrated: true,
    })
    .chain(WEAK_THRESHOLDS.iter().map(|&below| WeakGamesFilter {
        below: Some(below),
        unrated: false,
    }))
    .collect()
}

/// Hashes a column whatever type SQLite stored in it (old bases mix text and integers).
fn hash_column(hasher: &mut DefaultHasher, value: rusqlite::types::ValueRef<'_>) {
    use rusqlite::types::ValueRef;
    match value {
        ValueRef::Null => 0u8.hash(hasher),
        ValueRef::Integer(number) => (1u8, number).hash(hasher),
        ValueRef::Real(number) => (2u8, number.to_bits()).hash(hasher),
        ValueRef::Text(bytes) => (3u8, bytes).hash(hasher),
        ValueRef::Blob(bytes) => (4u8, bytes).hash(hasher),
    }
}

/// Reads an integer column that may hold text in old bases; anything else counts as missing.
fn integer_column(value: rusqlite::types::ValueRef<'_>) -> Option<i64> {
    use rusqlite::types::ValueRef;
    match value {
        ValueRef::Integer(number) => Some(number),
        ValueRef::Text(bytes) => std::str::from_utf8(bytes).ok()?.trim().parse().ok(),
        _ => None,
    }
}

/// Extra copies among `(game key, metadata key)` pairs: `(exact, probable)`.
pub fn count_duplicates(mut keys: Vec<(u64, u64)>) -> (u32, u32) {
    keys.sort_unstable();
    let (mut exact, mut probable) = (0u32, 0u32);
    let mut start = 0;
    while start < keys.len() {
        let mut end = start + 1;
        while end < keys.len() && keys[end].0 == keys[start].0 {
            end += 1;
        }
        // Inside a group the metadata keys are sorted, so distinct values are runs.
        let distinct = 1
            + (start + 1..end)
                .filter(|&i| keys[i].1 != keys[i - 1].1)
                .count();
        exact += (end - start - distinct) as u32;
        probable += (distinct - 1) as u32;
        start = end;
    }
    (exact, probable)
}

/// Placeholder, empty or very short names, or names with digits.
pub fn is_suspicious_name(name: &str) -> bool {
    let name = name.trim();
    let letters = name.chars().filter(|ch| ch.is_alphabetic()).count();
    letters < 3
        || name.chars().any(|ch| ch.is_ascii_digit())
        || ["nn", "n.n.", "unknown", "anonymous", "player"].contains(&name.to_lowercase().as_str())
}

fn scan(
    file: &Path,
    cancelled: &AtomicBool,
    progress: &dyn Fn(f32),
) -> Result<DatabaseQualityDetails, Error> {
    let connection =
        rusqlite::Connection::open_with_flags(file, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    connection.busy_timeout(Duration::from_secs(5))?;
    let total: u64 = connection.query_row("SELECT COUNT(*) FROM Games", [], |row| row.get(0))?;

    let mut keys: Vec<(u64, u64)> = Vec::with_capacity(total as usize);
    let mut ratings: HashMap<i64, (u32, u32)> = HashMap::new();
    // Best rating per player, read as the search index stores ratings.
    let mut best: Vec<i16> = Vec::new();
    let mut rate = |player: i64, elo: Option<i64>| {
        // Implausible ratings are counted by the minimal report; here they would hide real spreads.
        let (min, max) = super::quality::PLAUSIBLE_ELO;
        if let Some(elo) = elo.filter(|elo| (min..=max).contains(elo)) {
            let elo = elo as u32;
            let range = ratings.entry(player).or_insert((elo, elo));
            range.0 = range.0.min(elo);
            range.1 = range.1.max(elo);
        }
    };
    let mut statement = connection.prepare(
        "SELECT WhiteID, BlackID, WhiteElo, BlackElo, Moves, EventID, SiteID, Round, Date, UTCTime
         FROM Games",
    )?;
    let mut rows = statement.query([])?;
    let mut seen = 0u64;
    while let Some(row) = rows.next()? {
        let white = integer_column(row.get_ref(0)?).unwrap_or_default();
        let black = integer_column(row.get_ref(1)?).unwrap_or_default();
        let mut game = DefaultHasher::new();
        (white, black).hash(&mut game);
        hash_column(&mut game, row.get_ref(4)?);
        let mut metadata = DefaultHasher::new();
        for column in 5..=9 {
            hash_column(&mut metadata, row.get_ref(column)?);
        }
        keys.push((game.finish(), metadata.finish()));
        let white_elo = integer_column(row.get_ref(2)?);
        let black_elo = integer_column(row.get_ref(3)?);
        rate(white, white_elo);
        rate(black, black_elo);
        record_best_elo(&mut best, white as i32, white_elo.unwrap_or(0) as i16);
        record_best_elo(&mut best, black as i32, black_elo.unwrap_or(0) as i16);
        seen += 1;
        if seen.is_multiple_of(PROGRESS_EVERY) {
            if cancelled.load(Ordering::Acquire) {
                return Err(Error::SearchCancelled);
            }
            progress(seen as f32 / total.max(1) as f32 * 80.0);
        }
    }
    drop(rows);
    drop(statement);

    let (exact_duplicates, probable_duplicates) = count_duplicates(keys);
    progress(85.0);

    // Second, light read (no moves): every game once the best ratings are known.
    let filters = weak_filters();
    let mut weak_counts = vec![0u32; filters.len()];
    let mut statement =
        connection.prepare("SELECT WhiteID, WhiteElo, BlackID, BlackElo FROM Games")?;
    let mut rows = statement.query([])?;
    let mut seen = 0u64;
    while let Some(row) = rows.next()? {
        let white = integer_column(row.get_ref(0)?).unwrap_or_default() as i32;
        let white_elo = integer_column(row.get_ref(1)?).unwrap_or(0) as i16;
        let black = integer_column(row.get_ref(2)?).unwrap_or_default() as i32;
        let black_elo = integer_column(row.get_ref(3)?).unwrap_or(0) as i16;
        for (count, filter) in weak_counts.iter_mut().zip(&filters) {
            if is_weak_player(&best, white, white_elo, filter)
                && is_weak_player(&best, black, black_elo, filter)
            {
                *count += 1;
            }
        }
        seen += 1;
        if seen.is_multiple_of(PROGRESS_EVERY) {
            if cancelled.load(Ordering::Acquire) {
                return Err(Error::SearchCancelled);
            }
            progress(85.0 + seen as f32 / total.max(1) as f32 * 10.0);
        }
    }
    drop(rows);
    drop(statement);
    let weak_games = filters
        .iter()
        .zip(weak_counts)
        .map(|(filter, games)| WeakGamesCount {
            below: filter.below,
            games,
        })
        .collect();
    progress(95.0);

    let mut names: HashMap<i64, String> = HashMap::new();
    let mut suspicious_names = 0u32;
    let mut suspicious_name_examples = Vec::new();
    let mut statement = connection.prepare("SELECT ID, Name FROM Players")?;
    let mut rows = statement.query([])?;
    while let Some(row) = rows.next()? {
        let id = integer_column(row.get_ref(0)?).unwrap_or_default();
        let name = match row.get_ref(1)? {
            rusqlite::types::ValueRef::Text(bytes) => String::from_utf8_lossy(bytes).into_owned(),
            rusqlite::types::ValueRef::Integer(number) => number.to_string(),
            _ => String::new(),
        };
        // "Unknown" is the importer's own placeholder for a missing name.
        if name != "Unknown" && is_suspicious_name(&name) {
            suspicious_names += 1;
            if suspicious_name_examples.len() < EXAMPLES {
                suspicious_name_examples.push(name.clone());
            }
        }
        names.insert(id, name);
    }

    let mut spread: Vec<(u32, i64)> = ratings
        .iter()
        .filter(|(_, (low, high))| high - low > ELO_SPREAD_LIMIT)
        .map(|(player, (low, high))| (high - low, *player))
        .collect();
    spread.sort_unstable_by(|a, b| b.cmp(a));
    let inconsistent_elo_examples = spread
        .iter()
        .take(EXAMPLES)
        .map(|(_, player)| {
            let (low, high) = ratings[player];
            let name = names.get(player).map(String::as_str).unwrap_or("?");
            format!("{name} ({low}–{high})")
        })
        .collect();

    Ok(DatabaseQualityDetails {
        games: total as u32,
        exact_duplicates,
        probable_duplicates,
        suspicious_names,
        suspicious_name_examples,
        inconsistent_elo_players: spread.len() as u32,
        inconsistent_elo_examples,
        weak_games,
    })
}

/// Runs the complete report in the background; `id` names its progress events and cancellation.
#[tauri::command]
#[specta::specta]
pub async fn get_database_quality_details(
    file: PathBuf,
    id: String,
    app: tauri::AppHandle,
) -> Result<DatabaseQualityDetails, Error> {
    let flag = Arc::new(AtomicBool::new(false));
    CANCELLED.insert(id.clone(), flag.clone());
    let progress_app = app.clone();
    let progress_id = id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        let state = progress_app.state::<AppState>();
        scan(&file, &flag, &|value| {
            let _ = update_progress(
                &state.progress_state,
                &progress_app,
                progress_id.clone(),
                value,
                false,
            );
        })
    })
    .await
    .map_err(|error| Error::Download(error.to_string()))?;
    CANCELLED.remove(&id);
    {
        use tauri::Manager;
        let state = app.state::<AppState>();
        let _ = update_progress(&state.progress_state, &app, id, 100.0, true);
    }
    result
}

#[tauri::command]
#[specta::specta]
pub fn cancel_database_quality(id: String) {
    if let Some(flag) = CANCELLED.get(&id) {
        flag.store(true, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `ONYX_BENCH_DB=<file.db3> cargo test --release quality_scan -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn benchmark_on_real_database() {
        let Ok(path) = std::env::var("ONYX_BENCH_DB") else {
            return;
        };
        let started = std::time::Instant::now();
        let report = scan(Path::new(&path), &AtomicBool::new(false), &|_| {}).unwrap();
        println!("{report:?} in {:?}", started.elapsed());
    }

    #[test]
    fn duplicates_are_split_into_exact_and_probable() {
        // Game 1: three copies, two with the same metadata. Game 2: unique. Game 3: two copies
        // with the same metadata.
        let keys = vec![(1, 10), (2, 20), (1, 10), (3, 30), (1, 11), (3, 30)];
        assert_eq!(count_duplicates(keys), (2, 1));
        assert_eq!(count_duplicates(Vec::new()), (0, 0));
    }

    #[test]
    fn placeholder_names_are_suspicious() {
        for name in ["", "?", "NN", "N.N.", "Player 12", "Ab", "  x  "] {
            assert!(is_suspicious_name(name), "{name}");
        }
        for name in ["Carlsen, Magnus", "Li, Yu", "Núñez, José", "So, Wesley"] {
            assert!(!is_suspicious_name(name), "{name}");
        }
    }

    #[test]
    fn scans_a_database_for_duplicates_names_and_rating_spread() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("q.db3");
        let connection = rusqlite::Connection::open(&path).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE Players (ID INTEGER PRIMARY KEY, Name TEXT, Elo INTEGER);
                 CREATE TABLE Games (ID INTEGER PRIMARY KEY, EventID INTEGER, SiteID INTEGER,
                    Round TEXT, Date TEXT, UTCTime TEXT, WhiteID INTEGER, WhiteElo INTEGER,
                    BlackID INTEGER, BlackElo INTEGER, Moves BLOB);
                 INSERT INTO Players VALUES (1, 'Carlsen, Magnus', NULL), (2, 'NN', NULL),
                    (3, 'So, Wesley', NULL);
                 INSERT INTO Games (EventID, SiteID, Round, Date, UTCTime, WhiteID, WhiteElo,
                    BlackID, BlackElo, Moves) VALUES
                    (1, 1, '1', '2020.01.01', NULL, 1, 2800, 3, 2700, X'0102'),
                    (1, 1, '1', '2020.01.01', NULL, 1, 2800, 3, 2700, X'0102'),
                    (2, 1, '1', '2020.01.01', NULL, 1, 2800, 3, 2700, X'0102'),
                    (1, 1, '2', '2020.01.02', NULL, 3, 1500, 2, 0, X'0103');",
            )
            .unwrap();
        drop(connection);
        let report = scan(&path, &AtomicBool::new(false), &|_| {}).unwrap();
        assert_eq!(
            report,
            DatabaseQualityDetails {
                games: 4,
                exact_duplicates: 1,
                probable_duplicates: 1,
                suspicious_names: 1,
                suspicious_name_examples: vec!["NN".to_string()],
                inconsistent_elo_players: 1,
                inconsistent_elo_examples: vec!["So, Wesley (1500–2700)".to_string()],
                weak_games: weak_filters()
                    .iter()
                    .map(|filter| WeakGamesCount {
                        below: filter.below,
                        games: 0,
                    })
                    .collect(),
            }
        );
        // Fewer games than the cancellation check interval: it finishes first.
        assert!(scan(&path, &AtomicBool::new(true), &|_| {}).is_ok());
    }

    #[test]
    fn counts_weak_games_as_the_position_filter_leaves_them_out() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("weak.db3");
        let connection = rusqlite::Connection::open(&path).unwrap();
        // The same games as `weak_games_filter_judges_players_by_their_best_known_rating`.
        connection
            .execute_batch(
                "CREATE TABLE Players (ID INTEGER PRIMARY KEY, Name TEXT, Elo INTEGER);
                 CREATE TABLE Games (ID INTEGER PRIMARY KEY, EventID INTEGER, SiteID INTEGER,
                    Round TEXT, Date TEXT, UTCTime TEXT, WhiteID INTEGER, WhiteElo INTEGER,
                    BlackID INTEGER, BlackElo INTEGER, Moves BLOB);
                 INSERT INTO Players VALUES (0, 'Unknown', NULL), (1, 'Pérez, Ana', NULL),
                    (2, 'Rojas, Luis', NULL), (3, 'Mora, Iván', NULL), (4, 'Vega, Sara', NULL);
                 INSERT INTO Games (EventID, SiteID, Round, WhiteID, WhiteElo, BlackID, BlackElo,
                    Moves) VALUES
                    (0, 0, '1', 1, 900, 2, 950, X'01'),
                    (0, 0, '2', 3, 100, 2, 950, X'02'),
                    (0, 0, '3', 3, 2300, 1, 900, X'03'),
                    (0, 0, '4', 4, 0, 1, 900, X'04'),
                    (0, 0, '5', 4, 0, 0, 0, X'05'),
                    (0, 0, '6', 0, 1000, 0, 1050, X'06');",
            )
            .unwrap();
        drop(connection);
        let report = scan(&path, &AtomicBool::new(false), &|_| {}).unwrap();
        let count = |below: Option<i32>| {
            report
                .weak_games
                .iter()
                .find(|item| item.below == below)
                .unwrap()
                .games
        };
        // The query keeps 2, 3, 4 and 5 below 1200, and leaves out 1 and 6.
        assert_eq!(count(Some(1200)), 2);
        assert_eq!(count(Some(1000)), 1);
        assert_eq!(count(Some(1800)), 2);
        // Only game 5 has no rating on either side.
        assert_eq!(count(None), 1);
        assert_eq!(report.weak_games.len(), 1 + WEAK_THRESHOLDS.len());
    }
}
