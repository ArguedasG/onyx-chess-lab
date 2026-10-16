//! The move tree below a position of a local database, for the repertoire generator (8.5).
//!
//! It reuses the snapshot of a position query (the games that reach the position) and reads each
//! game's continuation once, so the whole tree costs one pass instead of one search per position.
//! Positions are merged by Zobrist hash, so transpositions inside the tree share their node. Only
//! the games that went through the root position count: a transposition from outside the root is
//! not part of this tree.

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use shakmaty::{
    fen::Fen,
    san::SanPlus,
    uci::UciMove,
    zobrist::{Zobrist64, ZobristHash},
    CastlingMode, Chess, EnPassantMode, Position,
};
use specta::Type;
use tauri::Manager;

use super::{
    encoding::{decode_move, iter_mainline_move_bytes},
    position_query::{open_index, snapshot_for},
    search_index::{GameResult, SearchGameEntryRef},
};
use crate::{error::Error, AppState};

const MAX_PLIES: u32 = 24;
const DEFAULT_MAX_GAMES: u32 = 200_000;
const MAX_GAMES: u32 = 1_000_000;
const BATCH: u32 = 4096;

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PositionTreeOptions {
    /// Plies below the root to read (at most 24).
    pub max_plies: u32,
    /// Moves played fewer times than this are dropped, with the positions only they reach.
    pub min_games: u32,
    /// Only games whose two ratings average at least this.
    #[specta(optional)]
    pub min_elo: Option<i32>,
    #[specta(optional)]
    pub since_year: Option<u32>,
    #[specta(optional)]
    pub until_year: Option<u32>,
    /// When more games qualify, the ones with the highest average rating are read.
    #[specta(optional)]
    pub max_games: Option<u32>,
    /// The model game of a move is its most recent game instead of the highest-rated one.
    #[serde(default)]
    #[specta(optional)]
    pub model_by_recent: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PositionTreeMove {
    pub uci: String,
    pub san: String,
    pub games: u32,
    pub white: u32,
    pub draws: u32,
    pub black: u32,
    /// Games with both ratings and a decisive or drawn result.
    pub rated_games: u32,
    /// Points of the side that plays the move in those games.
    pub rated_points: f64,
    /// Points the Elo formula predicted for that side in those games.
    pub expected_points: f64,
    /// Highest-rated game with this move, to link as a model game.
    #[specta(optional)]
    pub model_game_id: Option<i32>,
    #[specta(optional)]
    pub model_game_elo: Option<i32>,
    /// Node after the move, when it is part of the tree.
    #[specta(optional)]
    pub child: Option<u32>,
    /// Dates ("2024.05.01") of the first and last game with the move, when known.
    #[specta(optional)]
    pub first_date: Option<String>,
    #[specta(optional)]
    pub last_date: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PositionTreeNode {
    /// Position with move counters reset ("… 0 1").
    pub fen: String,
    pub games: u32,
    pub moves: Vec<PositionTreeMove>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PositionTree {
    /// Node 0 is the root.
    pub nodes: Vec<PositionTreeNode>,
    /// Games reaching the root that pass the filters.
    pub matching_games: u32,
    /// Games read (the matching ones, or the highest-rated `maxGames` of them).
    pub read_games: u32,
    pub elapsed_ms: f64,
}

fn expected(player: f64, opponent: f64) -> f64 {
    1.0 / (1.0 + 10f64.powf((opponent - player) / 400.0))
}

fn normalized_fen(chess: &Chess) -> String {
    let mut setup = chess.clone().into_setup(EnPassantMode::Legal);
    setup.halfmoves = 0;
    setup.fullmoves = std::num::NonZeroU32::new(1).unwrap();
    Fen::from_setup(setup).to_string()
}

fn year_of(entry: &SearchGameEntryRef<'_>) -> Option<u32> {
    entry
        .date
        .and_then(|date| date.get(..4))
        .and_then(|year| year.parse::<u32>().ok())
}

fn mean_elo(entry: &SearchGameEntryRef<'_>) -> Option<i32> {
    (entry.white_elo > 0 && entry.black_elo > 0)
        .then(|| (entry.white_elo as i32 + entry.black_elo as i32) / 2)
}

#[derive(Default)]
struct MoveAggregate {
    games: u32,
    white: u32,
    draws: u32,
    black: u32,
    rated_games: u32,
    rated_points: f64,
    expected_points: f64,
    model: Option<(i32, i32)>,
    model_date: Option<String>,
    first_date: Option<String>,
    last_date: Option<String>,
    child: Option<u64>,
    san: String,
    uci: String,
}

#[derive(Default)]
struct NodeAggregate {
    fen: String,
    games: u32,
    moves: HashMap<u8, MoveAggregate>,
}

/// Reads the continuations of `entries` below the root and returns the pruned tree.
pub(crate) fn build_tree<'a>(
    entries: impl Iterator<Item = (SearchGameEntryRef<'a>, u32)>,
    options: &PositionTreeOptions,
    cancelled: &dyn Fn() -> bool,
) -> Result<(Vec<PositionTreeNode>, u32), Error> {
    let max_plies = options.max_plies.clamp(1, MAX_PLIES);
    let by_recent = options.model_by_recent.unwrap_or(false);
    let mut nodes: HashMap<u64, NodeAggregate> = HashMap::new();
    let mut root_hash = None;
    let mut read = 0_u32;
    for (entry, root_ply) in entries {
        if read.is_multiple_of(1024) && cancelled() {
            return Err(Error::SearchCancelled);
        }
        read += 1;
        let setup = entry
            .fen
            .map(|fen| fen.parse::<Fen>())
            .transpose()?
            .unwrap_or_default()
            .into_setup();
        let mode = CastlingMode::detect(&setup);
        let Ok(mut chess) = setup.position::<Chess>(mode) else {
            continue;
        };
        let mut bytes = iter_mainline_move_bytes(entry.moves);
        let mut valid = true;
        for _ in 0..root_ply {
            match bytes.next().and_then(|byte| decode_move(byte, &chess)) {
                Some(movement) => chess.play_unchecked(&movement),
                None => {
                    valid = false;
                    break;
                }
            }
        }
        if !valid {
            continue;
        }
        let rated = mean_elo(&entry).is_some();
        let decisive = !matches!(entry.result, GameResult::None | GameResult::Other);
        let model_elo = mean_elo(&entry).unwrap_or(0);
        let mut hash: u64 = chess.zobrist_hash::<Zobrist64>(EnPassantMode::Legal).0;
        root_hash.get_or_insert(hash);
        for _ in 0..max_plies {
            let Some(byte) = bytes.next() else { break };
            let Some(movement) = decode_move(byte, &chess) else {
                break;
            };
            let white_to_move = chess.turn().is_white();
            let node = nodes.entry(hash).or_insert_with(|| NodeAggregate {
                fen: normalized_fen(&chess),
                ..NodeAggregate::default()
            });
            node.games += 1;
            let aggregate = node.moves.entry(byte).or_insert_with(|| MoveAggregate {
                san: SanPlus::from_move(chess.clone(), &movement).to_string(),
                uci: UciMove::from_move(&movement, CastlingMode::Standard).to_string(),
                ..MoveAggregate::default()
            });
            aggregate.games += 1;
            match entry.result {
                GameResult::WhiteWin => aggregate.white += 1,
                GameResult::BlackWin => aggregate.black += 1,
                GameResult::Draw => aggregate.draws += 1,
                _ => {}
            }
            if rated && decisive {
                let (own, other) = if white_to_move {
                    (entry.white_elo as f64, entry.black_elo as f64)
                } else {
                    (entry.black_elo as f64, entry.white_elo as f64)
                };
                let points = match (entry.result, white_to_move) {
                    (GameResult::Draw, _) => 0.5,
                    (GameResult::WhiteWin, true) | (GameResult::BlackWin, false) => 1.0,
                    _ => 0.0,
                };
                aggregate.rated_games += 1;
                aggregate.rated_points += points;
                aggregate.expected_points += expected(own, other);
            }
            let date = entry.date.filter(|date| {
                date.get(..4)
                    .is_some_and(|year| year.bytes().all(|b| b.is_ascii_digit()))
            });
            if let Some(date) = date {
                if aggregate
                    .first_date
                    .as_deref()
                    .is_none_or(|first| date < first)
                {
                    aggregate.first_date = Some(date.to_string());
                }
                if aggregate
                    .last_date
                    .as_deref()
                    .is_none_or(|last| date > last)
                {
                    aggregate.last_date = Some(date.to_string());
                }
            }
            if by_recent {
                let newer = match (&aggregate.model, &aggregate.model_date) {
                    (None, _) => true,
                    (Some((_, id)), current) => (date, entry.id) > (current.as_deref(), *id),
                };
                if newer {
                    aggregate.model = Some((model_elo, entry.id));
                    aggregate.model_date = date.map(str::to_string);
                }
            } else if aggregate
                .model
                .is_none_or(|(elo, id)| (model_elo, entry.id) > (elo, id))
            {
                aggregate.model = Some((model_elo, entry.id));
            }
            chess.play_unchecked(&movement);
            let next = chess.zobrist_hash::<Zobrist64>(EnPassantMode::Legal).0;
            aggregate.child = Some(next);
            hash = next;
        }
    }

    // Keep what is reachable from the root through moves with enough games.
    let min_games = options.min_games.max(1);
    let mut index: HashMap<u64, u32> = HashMap::new();
    let mut order: Vec<u64> = Vec::new();
    if let Some(root) = root_hash.filter(|hash| nodes.contains_key(hash)) {
        index.insert(root, 0);
        order.push(root);
        let mut cursor = 0;
        while cursor < order.len() {
            let hash = order[cursor];
            cursor += 1;
            let mut children: Vec<u64> = nodes[&hash]
                .moves
                .values()
                .filter(|aggregate| aggregate.games >= min_games)
                .filter_map(|aggregate| aggregate.child)
                .filter(|child| nodes.contains_key(child))
                .collect();
            children.sort_unstable();
            for child in children {
                if let std::collections::hash_map::Entry::Vacant(slot) = index.entry(child) {
                    slot.insert(order.len() as u32);
                    order.push(child);
                }
            }
        }
    }
    let tree = order
        .iter()
        .map(|hash| {
            let node = &nodes[hash];
            let mut moves: Vec<PositionTreeMove> = node
                .moves
                .values()
                .filter(|aggregate| aggregate.games >= min_games)
                .map(|aggregate| PositionTreeMove {
                    uci: aggregate.uci.clone(),
                    san: aggregate.san.clone(),
                    games: aggregate.games,
                    white: aggregate.white,
                    draws: aggregate.draws,
                    black: aggregate.black,
                    rated_games: aggregate.rated_games,
                    rated_points: aggregate.rated_points,
                    expected_points: aggregate.expected_points,
                    model_game_id: aggregate.model.map(|(_, id)| id),
                    model_game_elo: aggregate.model.map(|(elo, _)| elo).filter(|elo| *elo > 0),
                    child: aggregate.child.and_then(|child| index.get(&child).copied()),
                    first_date: aggregate.first_date.clone(),
                    last_date: aggregate.last_date.clone(),
                })
                .collect();
            moves.sort_by(|a, b| b.games.cmp(&a.games).then_with(|| a.san.cmp(&b.san)));
            PositionTreeNode {
                fen: node.fen.clone(),
                games: node.games,
                moves,
            }
        })
        .collect();
    Ok((tree, read))
}

#[tauri::command]
#[specta::specta]
pub async fn get_position_tree(
    id: String,
    token: String,
    options: PositionTreeOptions,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<PositionTree, Error> {
    let snapshot = snapshot_for(&token, &state)?;
    let started = Instant::now();
    // Cancelled with `cancel_analysis(id)`, like the other generator requests.
    let cancel_flag = Arc::new(AtomicBool::new(false));
    if let Some(previous) = state
        .analysis_cancel_flags
        .insert(id.clone(), cancel_flag.clone())
    {
        previous.store(true, Ordering::SeqCst);
    }
    let database = snapshot.database.clone();
    let index_app = app.clone();
    let index = {
        let _lock = state.position_index_build.lock().await;
        tauri::async_runtime::spawn_blocking(move || {
            open_index(
                &database,
                &index_app.state::<AppState>(),
                &|| false,
                &|_| {},
            )
        })
        .await
        .map_err(|error| Error::InvalidRequest(error.to_string()))??
    };
    snapshot.check_revision()?;
    let flag = cancel_flag.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let deadline = Instant::now() + Duration::from_secs(300);
        let check = || flag.load(Ordering::SeqCst) || Instant::now() > deadline;
        // Games that pass the filters, with their average rating for the cap.
        let mut selected: Vec<(i32, u32, u32)> = Vec::new();
        for offset in (0..snapshot.summary.total).step_by(BATCH as usize) {
            if check() {
                return Err(Error::SearchCancelled);
            }
            for record in snapshot.records(offset, BATCH)? {
                let Some(entry) = index
                    .get_entry_ref(record.index_offset as usize)
                    .filter(|entry| entry.id == record.id)
                else {
                    continue;
                };
                let elo = mean_elo(&entry);
                if options
                    .min_elo
                    .is_some_and(|min| elo.is_none_or(|elo| elo < min))
                {
                    continue;
                }
                let year = year_of(&entry);
                if options
                    .since_year
                    .is_some_and(|since| year.is_none_or(|year| year < since))
                    || options
                        .until_year
                        .is_some_and(|until| year.is_none_or(|year| year > until))
                {
                    continue;
                }
                selected.push((elo.unwrap_or(0), record.index_offset, record.ply));
            }
        }
        let matching_games = selected.len() as u32;
        let cap = options
            .max_games
            .unwrap_or(DEFAULT_MAX_GAMES)
            .clamp(1, MAX_GAMES) as usize;
        if selected.len() > cap {
            selected.select_nth_unstable_by(cap, |a, b| b.0.cmp(&a.0));
            selected.truncate(cap);
        }
        let entries = selected.iter().filter_map(|(_, offset, ply)| {
            index
                .get_entry_ref(*offset as usize)
                .map(|entry| (entry, *ply))
        });
        let (nodes, read_games) = build_tree(entries, &options, &check)?;
        Ok(PositionTree {
            nodes,
            matching_games,
            read_games,
            elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        })
    })
    .await
    .map_err(|error| Error::InvalidRequest(error.to_string()))?;
    state
        .analysis_cancel_flags
        .remove_if(&id, |_, current| Arc::ptr_eq(current, &cancel_flag));
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{search_index::SearchGameEntry, Importer, TempGame};
    use pgn_reader::BufferedReader;

    fn entries(pgn: &str) -> Vec<SearchGameEntry> {
        let mut importer = Importer::new(None);
        let games: Vec<TempGame> = BufferedReader::new(pgn.as_bytes())
            .into_iter(&mut importer)
            .flatten()
            .flatten()
            .collect();
        games
            .into_iter()
            .enumerate()
            .map(|(id, game)| {
                SearchGameEntry::from_game_data(
                    id as i32 + 1,
                    1,
                    2,
                    Some("2024.01.01".into()),
                    game.result.clone(),
                    game.moves.clone(),
                    None,
                    0,
                    0,
                    0,
                    Some(2000 + id as i32 * 100),
                    Some(2000),
                )
            })
            .collect()
    }

    fn game(moves: &str, result: &str) -> String {
        format!(
            "[Event \"T\"]\n[Site \"S\"]\n[White \"W\"]\n[Black \"B\"]\n[Result \"{result}\"]\n\n{moves} {result}\n\n"
        )
    }

    fn reference(entry: &SearchGameEntry) -> (SearchGameEntryRef<'_>, u32) {
        (
            SearchGameEntryRef {
                id: entry.id,
                white_id: entry.white_id,
                black_id: entry.black_id,
                date: entry.date.as_deref(),
                result: entry.result,
                pawn_home: entry.pawn_home,
                white_material: entry.white_material,
                black_material: entry.black_material,
                white_elo: entry.white_elo,
                black_elo: entry.black_elo,
                fen: entry.fen.as_deref(),
                moves: &entry.moves,
            },
            0,
        )
    }

    /// Times the tree of the start position on a real database: `ONYX_BENCH_DB`. Run with
    /// `cargo test --release position_tree_bench -- --ignored --nocapture`.
    #[test]
    #[ignore = "needs a real database with its search index"]
    fn position_tree_bench() {
        use crate::db::search_index::{get_index_path, MmapSearchIndex};
        let path = std::env::var("ONYX_BENCH_DB").expect("ONYX_BENCH_DB");
        let index = MmapSearchIndex::open(get_index_path(std::path::Path::new(&path))).unwrap();
        let started = Instant::now();
        let mut selected: Vec<(i32, usize)> = (0..index.len())
            .filter_map(|offset| {
                let entry = index.get_entry_ref(offset)?;
                entry
                    .fen
                    .is_none()
                    .then(|| (mean_elo(&entry).unwrap_or(0), offset))
            })
            .collect();
        let cap = DEFAULT_MAX_GAMES as usize;
        if selected.len() > cap {
            selected.select_nth_unstable_by(cap, |a, b| b.0.cmp(&a.0));
            selected.truncate(cap);
        }
        let selection = started.elapsed();
        let options = PositionTreeOptions {
            max_plies: 12,
            min_games: 3,
            min_elo: None,
            since_year: None,
            until_year: None,
            max_games: None,
            model_by_recent: None,
        };
        let (nodes, read) = build_tree(
            selected
                .iter()
                .filter_map(|(_, offset)| index.get_entry_ref(*offset).map(|entry| (entry, 0))),
            &options,
            &|| false,
        )
        .unwrap();
        println!(
            "selection {} ms, tree of {read} games: {} nodes in {} ms",
            selection.as_millis(),
            nodes.len(),
            (started.elapsed() - selection).as_millis()
        );
    }

    #[test]
    fn transpositions_share_a_node_and_rare_moves_are_pruned() {
        let pgn = [
            game("1. e4 e5 2. Nf3 Nc6", "1-0"),
            game("1. Nf3 e5 2. e4 Nc6", "0-1"),
            game("1. e4 e5 2. Nf3 Nf6", "1/2-1/2"),
            game("1. d4 d5", "1-0"),
        ]
        .concat();
        let entries = entries(&pgn);
        let options = PositionTreeOptions {
            max_plies: 4,
            min_games: 1,
            min_elo: None,
            since_year: None,
            until_year: None,
            max_games: None,
            model_by_recent: None,
        };
        let (nodes, read) = build_tree(entries.iter().map(reference), &options, &|| false).unwrap();
        assert_eq!(read, 4);
        let root = &nodes[0];
        assert_eq!(root.games, 4);
        assert_eq!(root.moves[0].san, "e4");
        assert_eq!(root.moves[0].games, 2);
        let after = |node: usize, san: &str| {
            nodes[node]
                .moves
                .iter()
                .find(|item| item.san == san)
                .and_then(|item| item.child)
                .unwrap() as usize
        };
        // 1. e4 e5 2. Nf3 and 1. Nf3 e5 2. e4 reach the same position.
        let via_e4 = after(after(after(0, "e4"), "e5"), "Nf3");
        let via_nf3 = after(after(after(0, "Nf3"), "e5"), "e4");
        assert_eq!(via_e4, via_nf3);
        assert_eq!(nodes[via_e4].games, 3);
        // Rated games keep the expected score of the side to move.
        let e4 = &root.moves[0];
        assert_eq!(e4.rated_games, 2);
        assert!(e4.expected_points > 1.0);
        assert_eq!(e4.uci, "e2e4");

        let (pruned, _) = build_tree(
            entries.iter().map(reference),
            &PositionTreeOptions {
                min_games: 2,
                ..options
            },
            &|| false,
        )
        .unwrap();
        assert_eq!(pruned[0].moves.len(), 1);
    }
}
