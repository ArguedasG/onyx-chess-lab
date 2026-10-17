use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs::remove_file,
    path::PathBuf,
    sync::Mutex,
};

use diesel::{dsl::max, Connection, ExpressionMethods, QueryDsl, RunQueryDsl};
use once_cell::sync::Lazy;
use rand::Rng;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{
    db::{puzzle_themes, puzzles, themes, Puzzle},
    error::Error,
};

/// Opens a puzzle database; a failure is reported to the UI instead of panicking.
fn open_puzzle_db(file: &str) -> Result<diesel::SqliteConnection, Error> {
    diesel::SqliteConnection::establish(file)
        .map_err(|error| Error::from(std::io::Error::other(error.to_string())))
}

/// What a puzzle must satisfy. Themes combine with "any" (a mix) or "all" (every theme at once);
/// popularity and plays are the quality signals of the Lichess database (popularity goes from
/// -100 to 100 and comes from the players' votes).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PuzzleFilter {
    pub min_rating: u16,
    pub max_rating: u16,
    #[serde(default)]
    #[specta(optional)]
    pub themes: Vec<String>,
    #[serde(default)]
    #[specta(optional)]
    pub match_all_themes: bool,
    /// Puzzles with any of these themes are left out.
    #[serde(default)]
    #[specta(optional)]
    pub exclude_themes: Vec<String>,
    #[serde(default)]
    #[specta(optional)]
    pub min_popularity: Option<i32>,
    #[serde(default)]
    #[specta(optional)]
    pub min_plays: Option<i32>,
    /// Moves of the solver in the solution (the opponent's first move does not count).
    #[serde(default)]
    #[specta(optional)]
    pub min_solution_moves: Option<u32>,
    #[serde(default)]
    #[specta(optional)]
    pub max_solution_moves: Option<u32>,
    /// Pieces on the board, kings included.
    #[serde(default)]
    #[specta(optional)]
    pub max_pieces: Option<u32>,
}

impl PuzzleFilter {
    fn accepts(&self, puzzle: &Puzzle) -> bool {
        if puzzle.rating < self.min_rating as i32 || puzzle.rating > self.max_rating as i32 {
            return false;
        }
        if self
            .min_popularity
            .is_some_and(|min| puzzle.popularity < min)
        {
            return false;
        }
        if self.min_plays.is_some_and(|min| puzzle.nb_plays < min) {
            return false;
        }
        let solution_moves = solution_moves(&puzzle.moves);
        if self
            .min_solution_moves
            .is_some_and(|min| solution_moves < min)
            || self
                .max_solution_moves
                .is_some_and(|max| solution_moves > max)
        {
            return false;
        }
        if self
            .max_pieces
            .is_some_and(|max| piece_count(&puzzle.fen) > max)
        {
            return false;
        }
        true
    }
}

/// Lichess puzzles start with the opponent's move: `n` solver moves are `2n` moves in total.
fn solution_moves(moves: &str) -> u32 {
    (moves.split_whitespace().count() as u32) / 2
}

fn piece_count(fen: &str) -> u32 {
    fen.split_whitespace()
        .next()
        .unwrap_or("")
        .chars()
        .filter(|c| c.is_ascii_alphabetic())
        .count() as u32
}

/// Rows read after each random starting point; Lichess ids are in random order, so neighbours
/// are unrelated puzzles.
const SEEK_BATCH: i64 = 64;
const MAX_SEEKS: usize = 1500;

/// Facts about a database that do not change while it is open: largest id and theme sizes.
#[derive(Default)]
struct DatabaseFacts {
    max_id: HashMap<String, i32>,
    theme_sizes: HashMap<(String, i32), i64>,
}

static FACTS: Lazy<Mutex<DatabaseFacts>> = Lazy::new(|| Mutex::new(DatabaseFacts::default()));

fn max_puzzle_id(file: &str, db: &mut diesel::SqliteConnection) -> Result<i32, Error> {
    if let Some(id) = FACTS
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .max_id
        .get(file)
    {
        return Ok(*id);
    }
    let id = puzzles::table
        .select(max(puzzles::id))
        .first::<Option<i32>>(db)?
        .unwrap_or(0);
    FACTS
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .max_id
        .insert(file.to_string(), id);
    Ok(id)
}

fn theme_size(file: &str, theme_id: i32, db: &mut diesel::SqliteConnection) -> Result<i64, Error> {
    let key = (file.to_string(), theme_id);
    if let Some(size) = FACTS
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .theme_sizes
        .get(&key)
    {
        return Ok(*size);
    }
    let size = puzzle_themes::table
        .filter(puzzle_themes::theme_id.eq(theme_id))
        .count()
        .get_result::<i64>(db)?;
    FACTS
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .theme_sizes
        .insert(key, size);
    Ok(size)
}

/// Random puzzles that satisfy the filter, without repeating `exclude`.
///
/// `ORDER BY RANDOM()` reads every row in the rating range (about 6 s on the 5.7 M puzzles of the
/// Lichess database once quality filters need the row itself). Instead each pick jumps to a
/// random id (of the puzzles, or of a theme's index) and takes the first puzzle from there that
/// passes the filter: a few point reads per puzzle, whatever the filter.
fn sample_puzzles_from(
    file: &str,
    db: &mut diesel::SqliteConnection,
    filter: &PuzzleFilter,
    count: usize,
    exclude: &HashSet<i32>,
) -> Result<Vec<Puzzle>, Error> {
    let max_id = max_puzzle_id(file, db)?;
    if max_id == 0 || count == 0 {
        return Ok(Vec::new());
    }
    let excluded: Vec<i32> = if filter.exclude_themes.is_empty() {
        Vec::new()
    } else {
        themes::table
            .filter(themes::name.eq_any(&filter.exclude_themes))
            .select(themes::id)
            .load(db)?
    };
    let theme_ids: Vec<(i32, String)> = if filter.themes.is_empty() {
        Vec::new()
    } else {
        themes::table
            .filter(themes::name.eq_any(&filter.themes))
            .select((themes::id, themes::name))
            .load(db)?
    };
    if !filter.themes.is_empty() && theme_ids.is_empty() {
        return Ok(Vec::new());
    }
    let mut sized: Vec<(i32, i64)> = Vec::with_capacity(theme_ids.len());
    for (id, _) in &theme_ids {
        sized.push((*id, theme_size(file, *id, db)?));
    }
    // "All": walk the smallest theme and check the others. "Any": pick a theme by its size, so
    // each puzzle is about as likely as in the union.
    sized.sort_by_key(|(_, size)| *size);
    let total_size: i64 = sized.iter().map(|(_, size)| *size).sum();

    let mut rng = rand::thread_rng();
    let mut found: Vec<Puzzle> = Vec::new();
    let mut seen: HashSet<i32> = exclude.clone();

    for _ in 0..MAX_SEEKS {
        if found.len() >= count {
            break;
        }
        let start = rng.gen_range(1..=max_id);
        let candidates: Vec<Puzzle> = if sized.is_empty() {
            let mut rows: Vec<Puzzle> = puzzles::table
                .filter(puzzles::id.ge(start))
                .order(puzzles::id.asc())
                .limit(SEEK_BATCH)
                .load(db)?;
            if rows.is_empty() {
                rows = puzzles::table
                    .order(puzzles::id.asc())
                    .limit(SEEK_BATCH)
                    .load(db)?;
            }
            rows
        } else {
            let driver = if filter.match_all_themes {
                sized[0].0
            } else {
                let mut pick = rng.gen_range(0..total_size.max(1));
                let mut chosen = sized[0].0;
                for (id, size) in &sized {
                    if pick < *size {
                        chosen = *id;
                        break;
                    }
                    pick -= size;
                }
                chosen
            };
            let mut ids: Vec<i32> = puzzle_themes::table
                .filter(puzzle_themes::theme_id.eq(driver))
                .filter(puzzle_themes::puzzle_id.ge(start))
                .order(puzzle_themes::puzzle_id.asc())
                .select(puzzle_themes::puzzle_id)
                .limit(SEEK_BATCH)
                .load(db)?;
            if ids.is_empty() {
                ids = puzzle_themes::table
                    .filter(puzzle_themes::theme_id.eq(driver))
                    .order(puzzle_themes::puzzle_id.asc())
                    .select(puzzle_themes::puzzle_id)
                    .limit(SEEK_BATCH)
                    .load(db)?;
            }
            if filter.match_all_themes && sized.len() > 1 {
                let others: Vec<i32> = sized[1..].iter().map(|(id, _)| *id).collect();
                let pairs: Vec<(i32, i32)> = puzzle_themes::table
                    .filter(puzzle_themes::theme_id.eq_any(&others))
                    .filter(puzzle_themes::puzzle_id.eq_any(&ids))
                    .select((puzzle_themes::puzzle_id, puzzle_themes::theme_id))
                    .load(db)?;
                let mut matches: HashMap<i32, usize> = HashMap::new();
                for (puzzle_id, _) in pairs {
                    *matches.entry(puzzle_id).or_default() += 1;
                }
                ids.retain(|id| matches.get(id) == Some(&others.len()));
            }
            ids.retain(|id| !seen.contains(id));
            if ids.is_empty() {
                continue;
            }
            let mut rows: Vec<Puzzle> = puzzles::table.filter(puzzles::id.eq_any(&ids)).load(db)?;
            rows.sort_by_key(|puzzle| puzzle.id);
            rows
        };
        let mut candidates: Vec<Puzzle> = candidates
            .into_iter()
            .filter(|puzzle| !seen.contains(&puzzle.id) && filter.accepts(puzzle))
            .collect();
        if !excluded.is_empty() && !candidates.is_empty() {
            let ids: Vec<i32> = candidates.iter().map(|puzzle| puzzle.id).collect();
            let rejected: HashSet<i32> = puzzle_themes::table
                .filter(puzzle_themes::theme_id.eq_any(&excluded))
                .filter(puzzle_themes::puzzle_id.eq_any(&ids))
                .select(puzzle_themes::puzzle_id)
                .load::<i32>(db)?
                .into_iter()
                .collect();
            candidates.retain(|puzzle| !rejected.contains(&puzzle.id));
        }
        if let Some(puzzle) = candidates.into_iter().next() {
            seen.insert(puzzle.id);
            found.push(puzzle);
        }
    }
    Ok(found)
}

#[derive(Debug)]
struct PuzzleCache {
    file: String,
    filter: Option<PuzzleFilter>,
    cache: VecDeque<Puzzle>,
}

const CACHE_SIZE: usize = 20;

#[tauri::command]
#[specta::specta]
pub async fn get_puzzle(file: String, filter: PuzzleFilter) -> Result<Puzzle, Error> {
    static PUZZLE_CACHE: Lazy<Mutex<PuzzleCache>> = Lazy::new(|| {
        Mutex::new(PuzzleCache {
            file: String::new(),
            filter: None,
            cache: VecDeque::new(),
        })
    });

    // A failed query must not poison the cache for the rest of the session.
    let mut cache = PUZZLE_CACHE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if cache.file != file || cache.filter.as_ref() != Some(&filter) || cache.cache.is_empty() {
        let mut db = open_puzzle_db(&file)?;
        let fresh = sample_puzzles_from(&file, &mut db, &filter, CACHE_SIZE, &HashSet::new())?;
        cache.file = file;
        cache.filter = Some(filter);
        cache.cache = fresh.into();
    }
    cache.cache.pop_front().ok_or(Error::NoPuzzles)
}

/// A puzzle and its themes; field names match `Puzzle`.
#[derive(Debug, Clone, Serialize, Type)]
pub struct PuzzleWithThemes {
    pub id: i32,
    pub fen: String,
    pub moves: String,
    pub rating: i32,
    pub rating_deviation: i32,
    pub popularity: i32,
    pub nb_plays: i32,
    pub themes: Vec<String>,
}

/// Several random puzzles with their themes: sets built from the database (I-20) and sessions that
/// need puzzles ahead (storm, streak).
#[tauri::command]
#[specta::specta]
pub async fn sample_puzzles(
    file: String,
    filter: PuzzleFilter,
    count: u32,
    exclude: Vec<i32>,
) -> Result<Vec<PuzzleWithThemes>, Error> {
    let mut db = open_puzzle_db(&file)?;
    let exclude: HashSet<i32> = exclude.into_iter().collect();
    let found = sample_puzzles_from(&file, &mut db, &filter, count.min(2000) as usize, &exclude)?;
    let ids: Vec<i32> = found.iter().map(|puzzle| puzzle.id).collect();
    let pairs: Vec<(i32, String)> = puzzle_themes::table
        .inner_join(themes::table)
        .filter(puzzle_themes::puzzle_id.eq_any(&ids))
        .select((puzzle_themes::puzzle_id, themes::name))
        .load(&mut db)?;
    let mut by_puzzle: HashMap<i32, Vec<String>> = HashMap::new();
    for (puzzle_id, name) in pairs {
        by_puzzle.entry(puzzle_id).or_default().push(name);
    }
    Ok(found
        .into_iter()
        .map(|puzzle| {
            let mut themes = by_puzzle.remove(&puzzle.id).unwrap_or_default();
            themes.sort();
            PuzzleWithThemes {
                id: puzzle.id,
                fen: puzzle.fen,
                moves: puzzle.moves,
                rating: puzzle.rating,
                rating_deviation: puzzle.rating_deviation,
                popularity: puzzle.popularity,
                nb_plays: puzzle.nb_plays,
                themes,
            }
        })
        .collect())
}

#[derive(Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PuzzleDatabaseInfo {
    title: String,
    description: String,
    puzzle_count: i32,
    storage_size: u64,
    path: String,
}

#[tauri::command]
#[specta::specta]
pub async fn get_puzzle_db_info(file: PathBuf) -> Result<PuzzleDatabaseInfo, Error> {
    let path = file;

    let mut db = open_puzzle_db(&path.to_string_lossy())?;

    let puzzle_count = puzzles::table.count().get_result::<i64>(&mut db)? as i32;

    let storage_size = path.metadata()?.len();
    let filename = path.file_name().expect("get filename").to_string_lossy();

    Ok(PuzzleDatabaseInfo {
        title: filename.to_string(),
        description: "".to_string(),
        puzzle_count,
        storage_size,
        path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
#[specta::specta]
pub fn delete_puzzle_database(file: String) -> Result<(), Error> {
    remove_file(&file)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_puzzle_themes(file: String) -> Result<Vec<String>, Error> {
    let mut db = open_puzzle_db(&file)?;
    let result: Vec<String> = themes::table
        .select(themes::name)
        .order(themes::name.asc())
        .load(&mut db)?;
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub async fn get_themes_for_puzzle(file: String, puzzle_id: i32) -> Result<Vec<String>, Error> {
    let mut db = open_puzzle_db(&file)?;
    let result: Vec<String> = themes::table
        .inner_join(puzzle_themes::table)
        .filter(puzzle_themes::puzzle_id.eq(puzzle_id))
        .select(themes::name)
        .order(themes::name.asc())
        .load(&mut db)?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn puzzle(rating: i32, popularity: i32, plays: i32, moves: &str, fen: &str) -> Puzzle {
        Puzzle {
            id: 1,
            fen: fen.to_string(),
            moves: moves.to_string(),
            rating,
            rating_deviation: 75,
            popularity,
            nb_plays: plays,
        }
    }

    fn filter() -> PuzzleFilter {
        PuzzleFilter {
            min_rating: 1000,
            max_rating: 2000,
            themes: Vec::new(),
            match_all_themes: false,
            exclude_themes: Vec::new(),
            min_popularity: None,
            min_plays: None,
            min_solution_moves: None,
            max_solution_moves: None,
            max_pieces: None,
        }
    }

    const FEN: &str = "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24";

    #[test]
    fn counts_solver_moves_and_pieces() {
        assert_eq!(solution_moves("f2g3 e6e7 b2b1 b3c1 b1c1 h6c1"), 3);
        assert_eq!(solution_moves("e2e4 d7d5"), 1);
        assert_eq!(piece_count(FEN), 20);
    }

    #[test]
    fn filter_checks_quality_length_and_pieces() {
        let good = puzzle(1500, 95, 9000, "f2g3 e6e7 b2b1 b3c1", FEN);
        assert!(filter().accepts(&good));
        let quality = PuzzleFilter {
            min_popularity: Some(70),
            min_plays: Some(50),
            ..filter()
        };
        assert!(quality.accepts(&good));
        assert!(!quality.accepts(&puzzle(1500, 40, 9000, "a b", FEN)));
        assert!(!quality.accepts(&puzzle(1500, 95, 10, "a b", FEN)));
        let long = PuzzleFilter {
            min_solution_moves: Some(3),
            ..filter()
        };
        assert!(!long.accepts(&good));
        let few_pieces = PuzzleFilter {
            max_pieces: Some(10),
            ..filter()
        };
        assert!(!few_pieces.accepts(&good));
        assert!(!filter().accepts(&puzzle(2500, 95, 9000, "a b", FEN)));
    }
}
