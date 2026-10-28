//! Model games of a pawn structure (I-31, 9.3): strong games of a database where the structure
//! appears, with the position where it is established, to study the plans and to play from there.
//!
//! The database has no index of structures, so the games are scanned in blocks of ids, newest first,
//! only those where both players reach the minimum rating, and only up to the end of the structure
//! window. The scan stops when it has five times the games asked for (the strongest are kept),
//! reaches its budget or is cancelled.

use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Instant,
};

use diesel::prelude::*;
use log::info;
use rayon::prelude::*;
use serde::Serialize;
use shakmaty::{fen::Fen, Chess, EnPassantMode, Position};
use specta::Type;

use super::{
    encoding::{decode_move, iter_mainline_move_bytes},
    get_db_or_create,
    pawn_structures::{PawnStructure, StructureTracker, WINDOW_END},
    schema::{events, games, players},
    ConnectionOptions,
};
use crate::{error::Error, AppState};

/// Games read per query.
const BLOCK: i64 = 20_000;
/// Rated games looked at in one search at most (about ten seconds on a laptop).
const MAX_SCANNED: usize = 400_000;

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StructureModelGame {
    pub id: i32,
    pub white: String,
    pub black: String,
    pub white_elo: Option<i32>,
    pub black_elo: Option<i32>,
    pub result: String,
    pub date: Option<String>,
    pub event: String,
    pub owner_white: bool,
    /// Ply where the structure has held long enough to count, and the position there.
    pub ply: u32,
    pub fen: String,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StructureModelGames {
    /// Strongest first (average rating).
    pub games: Vec<StructureModelGame>,
    /// Rated games looked at, to say how wide the search was.
    pub scanned: u32,
    pub cancelled: bool,
    /// The budget ran out before finding `limit` games.
    pub truncated: bool,
}

/// Where the structure is established in a game: the confirming ply and the position there.
fn find_structure(
    moves: &[u8],
    structure: PawnStructure,
    owner_white: Option<bool>,
) -> Option<(bool, u32, String)> {
    let mut chess = Chess::default();
    let mut tracker = StructureTracker::default();
    for (index, byte) in iter_mainline_move_bytes(moves).enumerate() {
        let ply = index as u32 + 1;
        let movement = decode_move(byte, &chess)?;
        chess.play_unchecked(&movement);
        let before = tracker.hits.len();
        tracker.observe(ply, chess.board());
        if let Some(hit) = tracker.hits[before..].iter().find(|hit| {
            hit.structure == structure && owner_white.is_none_or(|owner| owner == hit.owner_white)
        }) {
            let fen = Fen::from_setup(chess.clone().into_setup(EnPassantMode::Legal));
            return Some((hit.owner_white, ply, fen.to_string()));
        }
        if ply >= WINDOW_END {
            return None;
        }
    }
    None
}

type Row = (
    i32,
    Option<i32>,
    Option<i32>,
    Option<String>,
    Option<String>,
    Vec<u8>,
    Option<String>,
    Option<String>,
    Option<String>,
);

#[allow(clippy::too_many_arguments)]
#[tauri::command]
#[specta::specta]
pub async fn get_structure_model_games(
    file: PathBuf,
    structure: PawnStructure,
    owner_white: Option<bool>,
    min_elo: i32,
    limit: u32,
    search_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<StructureModelGames, Error> {
    let cancel = Arc::new(AtomicBool::new(false));
    state
        .structure_search_cancel_flags
        .insert(search_id.clone(), cancel.clone());
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;
    let result = scan(db, structure, owner_white, min_elo, limit as usize, &cancel);
    state.structure_search_cancel_flags.remove(&search_id);
    result
}

#[tauri::command]
#[specta::specta]
pub fn cancel_structure_model_games(search_id: String, state: tauri::State<'_, AppState>) -> bool {
    match state.structure_search_cancel_flags.get(&search_id) {
        Some(flag) => {
            flag.store(true, Ordering::Relaxed);
            true
        }
        None => false,
    }
}

fn scan(
    db: &mut SqliteConnection,
    structure: PawnStructure,
    owner_white: Option<bool>,
    min_elo: i32,
    limit: usize,
    cancel: &AtomicBool,
) -> Result<StructureModelGames, Error> {
    let timer = Instant::now();
    let (white_players, black_players) = diesel::alias!(players as white, players as black);
    let mut found: Vec<StructureModelGame> = Vec::new();
    let mut scanned = 0_usize;
    // Newest ids first: the most recent games of a database are usually imported last.
    let mut last_id = i32::MAX;
    let mut cancelled = false;
    // More than asked, so the strongest ones can be chosen among them.
    let wanted = limit.saturating_mul(5);
    loop {
        if cancel.load(Ordering::Relaxed) {
            cancelled = true;
            break;
        }
        let rows: Vec<Row> = games::table
            .inner_join(white_players.on(games::white_id.eq(white_players.field(players::id))))
            .inner_join(black_players.on(games::black_id.eq(black_players.field(players::id))))
            .inner_join(events::table.on(games::event_id.eq(events::id)))
            .filter(games::id.lt(last_id))
            .filter(games::fen.is_null())
            .filter(games::white_elo.ge(min_elo))
            .filter(games::black_elo.ge(min_elo))
            .order(games::id.desc())
            .select((
                games::id,
                games::white_elo,
                games::black_elo,
                games::result,
                games::date,
                games::moves,
                white_players.field(players::name),
                black_players.field(players::name),
                events::name,
            ))
            .limit(BLOCK)
            .load(db)?;
        let Some(last) = rows.last() else {
            break;
        };
        last_id = last.0;
        scanned += rows.len();
        let block: Vec<StructureModelGame> = rows
            .into_par_iter()
            .filter_map(
                |(id, white_elo, black_elo, result, date, moves, white, black, event)| {
                    let (owner, ply, fen) = find_structure(&moves, structure, owner_white)?;
                    Some(StructureModelGame {
                        id,
                        white: white.unwrap_or_default(),
                        black: black.unwrap_or_default(),
                        white_elo,
                        black_elo,
                        result: result.unwrap_or_else(|| "*".to_string()),
                        date,
                        event: event.unwrap_or_default(),
                        owner_white: owner,
                        ply,
                        fen,
                    })
                },
            )
            .collect();
        found.extend(block);
        if found.len() >= wanted || scanned >= MAX_SCANNED {
            break;
        }
    }
    let truncated = !cancelled && found.len() < limit && scanned >= MAX_SCANNED;
    let average = |game: &StructureModelGame| {
        game.white_elo.unwrap_or_default() + game.black_elo.unwrap_or_default()
    };
    found.sort_by_key(|game| std::cmp::Reverse(average(game)));
    found.truncate(limit);
    info!(
        "structure model games: {structure:?} {} found in {scanned} games, {} ms",
        found.len(),
        timer.elapsed().as_millis()
    );
    Ok(StructureModelGames {
        games: found,
        scanned: scanned as u32,
        cancelled,
        truncated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::encoding::encode_move;

    fn encoded(ucis: &[&str]) -> Vec<u8> {
        let mut chess = Chess::default();
        let mut bytes = Vec::new();
        for uci in ucis {
            let movement = uci
                .parse::<shakmaty::uci::UciMove>()
                .unwrap()
                .to_move(&chess)
                .unwrap();
            bytes.push(encode_move(&movement, &chess).unwrap());
            chess.play_unchecked(&movement);
        }
        bytes
    }

    #[test]
    fn finds_where_a_structure_is_established() {
        // Exchange Queen's Gambit (Carlsbad for White), then quiet moves to fill the window.
        let mut moves = vec![
            "d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c4d5", "e6d5", "c1g5", "c7c6", "e2e3",
            "f8e7", "f1d3", "b8d7", "g1f3", "e8g8", "d1c2", "f8e8", "e1g1", "d7f8",
        ];
        let shuffle = ["a1b1", "a8b8", "b1a1", "b8a8"];
        for index in 0..20 {
            moves.push(shuffle[index % 4]);
        }
        let bytes = encoded(&moves);
        let (owner, ply, fen) = find_structure(&bytes, PawnStructure::Carlsbad, None).unwrap();
        assert!(owner);
        assert_eq!(ply, 28, "window start 23 plus a run of six");
        assert!(fen.starts_with("r"));
        assert!(find_structure(&bytes, PawnStructure::Carlsbad, Some(false)).is_none());
        assert!(find_structure(&bytes, PawnStructure::Iqp, None).is_none());
    }

    /// Time to find model games in a real database (`ONYX_BENCH_DB`, opened read only), for a
    /// frequent and a rare structure. Run with
    /// `cargo test --release structure_model_games_bench -- --ignored --nocapture`.
    #[test]
    #[ignore = "needs a real database"]
    fn structure_model_games_bench() {
        let path = std::env::var("ONYX_BENCH_DB").expect("ONYX_BENCH_DB");
        let db = &mut SqliteConnection::establish(&format!("file:{path}?mode=ro")).unwrap();
        for (structure, min_elo) in [
            (PawnStructure::Carlsbad, 2400),
            (PawnStructure::HangingPawns, 2400),
            (PawnStructure::ClosedRuyLopez, 2200),
        ] {
            let timer = Instant::now();
            let result = scan(db, structure, None, min_elo, 20, &AtomicBool::new(false)).unwrap();
            println!(
                "{structure:?} ≥{min_elo}: {} games among {} in {} ms (truncated {})",
                result.games.len(),
                result.scanned,
                timer.elapsed().as_millis(),
                result.truncated
            );
        }
    }
}
