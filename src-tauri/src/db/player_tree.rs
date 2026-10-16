//! The opening tree of a player's games (8.6): what they play with each colour and what their
//! opponents tried against them, for the preparation tab, the generator against a rival (I-41)
//! and the twin's book (I-43).
//!
//! The frontend sends the games that pass the card filters, so the tree follows the same period,
//! time control and "last N games" as the rest of the card. It reuses the tree builder of the
//! repertoire generator (8.5): one pass, transpositions merged by Zobrist hash.

use std::{path::PathBuf, time::Instant};

use diesel::prelude::*;
use log::info;
use serde::Serialize;
use specta::Type;

use shakmaty::{uci::UciMove, CastlingMode, Chess, Position};

use super::{
    encoding::{decode_move, iter_mainline_move_bytes},
    get_db_or_create,
    position_tree::{build_tree, PositionTreeNode, PositionTreeOptions},
    schema::games,
    search_index::{GameResult, SearchGameEntryRef},
    ConnectionOptions,
};
use crate::{error::Error, AppState};

/// Plies of the book: enough for the preparation and the twin, small enough to send.
const MAX_PLIES: u32 = 20;
const CHUNK: usize = 900;

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlayerTree {
    /// Games where the player had White, from the standard start (node 0 is the root).
    pub white: Vec<PositionTreeNode>,
    pub black: Vec<PositionTreeNode>,
    pub white_games: u32,
    pub black_games: u32,
    /// The first plies of every game (UCI), identical sequences merged: the twin's book.
    pub white_lines: Vec<BookLine>,
    pub black_lines: Vec<BookLine>,
    pub elapsed_ms: f64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BookLine {
    pub moves: Vec<String>,
    pub games: u32,
}

/// Merges the opening sequences of the games, most played first.
fn book_lines(entries: &[OwnedEntry], max_plies: u32) -> Vec<BookLine> {
    let mut counts: std::collections::HashMap<Vec<String>, u32> = std::collections::HashMap::new();
    for entry in entries {
        let mut chess = Chess::default();
        let mut moves = Vec::new();
        for byte in iter_mainline_move_bytes(&entry.moves).take(max_plies as usize) {
            let Some(movement) = decode_move(byte, &chess) else {
                break;
            };
            moves.push(UciMove::from_move(&movement, CastlingMode::Standard).to_string());
            chess.play_unchecked(&movement);
        }
        if !moves.is_empty() {
            *counts.entry(moves).or_default() += 1;
        }
    }
    let mut lines: Vec<BookLine> = counts
        .into_iter()
        .map(|(moves, games)| BookLine { moves, games })
        .collect();
    lines.sort_by(|a, b| b.games.cmp(&a.games).then_with(|| a.moves.cmp(&b.moves)));
    lines
}

type TreeRow = (
    i32,
    i32,
    i32,
    Option<String>,
    Option<String>,
    Option<i32>,
    Option<i32>,
    Option<String>,
    Vec<u8>,
);

struct OwnedEntry {
    id: i32,
    white_id: i32,
    black_id: i32,
    date: Option<String>,
    result: GameResult,
    white_elo: i16,
    black_elo: i16,
    moves: Vec<u8>,
}

impl OwnedEntry {
    fn as_ref(&self) -> SearchGameEntryRef<'_> {
        SearchGameEntryRef {
            id: self.id,
            white_id: self.white_id,
            black_id: self.black_id,
            date: self.date.as_deref(),
            result: self.result,
            pawn_home: 0,
            white_material: 0,
            black_material: 0,
            white_elo: self.white_elo,
            black_elo: self.black_elo,
            fen: None,
            moves: &self.moves,
        }
    }
}

fn rating(value: Option<i32>) -> i16 {
    value
        .filter(|elo| (1..=i16::MAX as i32).contains(elo))
        .map_or(0, |elo| elo as i16)
}

#[tauri::command]
#[specta::specta]
pub async fn get_player_tree(
    file: PathBuf,
    player_ids: Vec<i32>,
    game_ids: Vec<i32>,
    max_plies: u32,
    state: tauri::State<'_, AppState>,
) -> Result<PlayerTree, Error> {
    let started = Instant::now();
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;
    let mut rows: Vec<TreeRow> = Vec::with_capacity(game_ids.len());
    for chunk in game_ids.chunks(CHUNK) {
        rows.extend(
            games::table
                .filter(games::id.eq_any(chunk))
                .select((
                    games::id,
                    games::white_id,
                    games::black_id,
                    games::date,
                    games::result,
                    games::white_elo,
                    games::black_elo,
                    games::fen,
                    games::moves,
                ))
                .load::<TreeRow>(db)?,
        );
    }
    let tree = tauri::async_runtime::spawn_blocking(move || {
        build_player_tree(rows, &player_ids, max_plies)
    })
    .await
    .map_err(|error| Error::InvalidRequest(error.to_string()))??;
    info!(
        "player tree: {} + {} games in {} ms",
        tree.white_games,
        tree.black_games,
        started.elapsed().as_millis()
    );
    Ok(PlayerTree {
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        ..tree
    })
}

fn build_player_tree(
    rows: Vec<TreeRow>,
    player_ids: &[i32],
    max_plies: u32,
) -> Result<PlayerTree, Error> {
    let (mut white, mut black) = (Vec::new(), Vec::new());
    for (id, white_id, black_id, date, result, white_elo, black_elo, fen, moves) in rows {
        // Only games from the standard start share the tree.
        if fen.is_some() {
            continue;
        }
        let entry = OwnedEntry {
            id,
            white_id,
            black_id,
            date,
            result: GameResult::from_str(result.as_deref()),
            white_elo: rating(white_elo),
            black_elo: rating(black_elo),
            moves,
        };
        if player_ids.contains(&white_id) {
            white.push(entry);
        } else if player_ids.contains(&black_id) {
            black.push(entry);
        }
    }
    let max_plies = max_plies.clamp(1, MAX_PLIES);
    let options = PositionTreeOptions {
        max_plies,
        min_games: 1,
        min_elo: None,
        since_year: None,
        until_year: None,
        max_games: None,
        model_by_recent: Some(true),
    };
    let tree = |entries: &[OwnedEntry]| -> Result<Vec<PositionTreeNode>, Error> {
        if entries.is_empty() {
            return Ok(Vec::new());
        }
        let (nodes, _) = build_tree(
            entries.iter().map(|entry| (entry.as_ref(), 0)),
            &options,
            &|| false,
        )?;
        Ok(nodes)
    };
    Ok(PlayerTree {
        white: tree(&white)?,
        black: tree(&black)?,
        white_games: white.len() as u32,
        black_games: black.len() as u32,
        white_lines: book_lines(&white, max_plies),
        black_lines: book_lines(&black, max_plies),
        elapsed_ms: 0.0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{Importer, TempGame};
    use pgn_reader::BufferedReader;

    fn encoded(moves: &str) -> Vec<u8> {
        let pgn = format!(
            "[Event \"T\"]\n[Site \"S\"]\n[White \"W\"]\n[Black \"B\"]\n[Result \"*\"]\n\n{moves} *\n"
        );
        let mut importer = Importer::new(None);
        let games: Vec<TempGame> = BufferedReader::new(pgn.as_bytes())
            .into_iter(&mut importer)
            .flatten()
            .flatten()
            .collect();
        games[0].moves.clone()
    }

    fn row(id: i32, white: i32, black: i32, date: &str, result: &str, moves: &str) -> TreeRow {
        (
            id,
            white,
            black,
            Some(date.to_string()),
            Some(result.to_string()),
            Some(1800),
            Some(1900),
            None,
            encoded(moves),
        )
    }

    /// Times the tree of a player on a real database: `ONYX_BENCH_DB` and `ONYX_BENCH_PLAYER`
    /// (exact name). Run with `cargo test --release player_tree_bench -- --ignored --nocapture`.
    #[test]
    #[ignore = "needs a real database"]
    fn player_tree_bench() {
        use crate::db::schema::players;
        let path = std::env::var("ONYX_BENCH_DB").expect("ONYX_BENCH_DB");
        let name = std::env::var("ONYX_BENCH_PLAYER").expect("ONYX_BENCH_PLAYER");
        let db = &mut SqliteConnection::establish(&format!("file:{path}?mode=ro")).unwrap();
        let id: i32 = players::table
            .filter(players::name.eq(&name))
            .select(players::id)
            .first(db)
            .unwrap();
        let started = Instant::now();
        let rows: Vec<TreeRow> = games::table
            .filter(games::white_id.eq(id).or(games::black_id.eq(id)))
            .select((
                games::id,
                games::white_id,
                games::black_id,
                games::date,
                games::result,
                games::white_elo,
                games::black_elo,
                games::fen,
                games::moves,
            ))
            .load(db)
            .unwrap();
        let read = started.elapsed();
        let tree = build_player_tree(rows, &[id], MAX_PLIES).unwrap();
        let json = serde_json::to_string(&tree).unwrap();
        println!(
            "{name}: {} + {} games, read {} ms, tree {} ms, {} + {} nodes, {} + {} lines, {} kB",
            tree.white_games,
            tree.black_games,
            read.as_millis(),
            (started.elapsed() - read).as_millis(),
            tree.white.len(),
            tree.black.len(),
            tree.white_lines.len(),
            tree.black_lines.len(),
            json.len() / 1024
        );
    }

    #[test]
    fn games_are_split_by_the_player_colour_with_dates_and_recent_models() {
        let rows = vec![
            row(1, 7, 2, "2023.01.01", "1-0", "1. e4 e5 2. Nf3"),
            row(2, 7, 3, "2024.06.01", "0-1", "1. e4 c5"),
            row(3, 4, 7, "2024.02.01", "1/2-1/2", "1. d4 d5"),
            (
                4,
                7,
                5,
                None,
                Some("1-0".into()),
                None,
                None,
                Some("8/8/8/8/8/8/8/K6k w - - 0 1".into()),
                Vec::new(),
            ),
        ];
        let tree = build_player_tree(rows, &[7], 6).unwrap();
        assert_eq!(tree.white_games, 2, "the custom start is left out");
        assert_eq!(tree.black_games, 1);
        let e4 = &tree.white[0].moves[0];
        assert_eq!(e4.san, "e4");
        assert_eq!(e4.games, 2);
        assert_eq!(e4.first_date.as_deref(), Some("2023.01.01"));
        assert_eq!(e4.last_date.as_deref(), Some("2024.06.01"));
        assert_eq!(
            e4.model_game_id,
            Some(2),
            "the most recent game is the model"
        );
        assert_eq!(tree.black[0].moves[0].san, "d4");
        assert_eq!(
            tree.white_lines,
            vec![
                BookLine {
                    moves: vec!["e2e4".into(), "c7c5".into()],
                    games: 1
                },
                BookLine {
                    moves: vec!["e2e4".into(), "e7e5".into(), "g1f3".into()],
                    games: 1
                },
            ]
        );
    }
}
