//! Every game of a player in one call, with what the player card needs and the database does not
//! store: the opening named from the moves, how the game ended on the board and the last clocks.
//!
//! The moves are only decoded, never turned into PGN, and the games are processed in parallel, so
//! a player with thousands of games is read in well under a second.

use std::{path::PathBuf, time::Instant};

use diesel::prelude::*;
use log::info;
use rayon::prelude::*;
use serde::Serialize;
use shakmaty::{fen::Fen, CastlingMode, Chess, Color, EnPassantMode, FromSetup, Position};
use specta::Type;

use super::{
    encoding::{
        decode_move, COMMENT_MARKER, NAG_MARKER, VARIATION_END_MARKER, VARIATION_START_MARKER,
    },
    get_db_or_create,
    pawn_structures::{PawnStructureHit, StructureTracker},
    schema::{events, games, players, sites},
    ConnectionOptions,
};
use crate::{error::Error, opening::get_opening_from_setup, AppState};

/// Plies looked at to name the opening (the longest line of the opening catalog).
const OPENING_PLIES: usize = 55;

/// How the mainline ends on the board. Resignations, time losses and agreed draws are not stored
/// in the database, so they all read as `Open`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum BoardEnding {
    Checkmate,
    Stalemate,
    InsufficientMaterial,
    Open,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlayerGameRow {
    pub id: i32,
    /// Which of the requested player records played this game.
    pub player_id: i32,
    pub is_white: bool,
    pub opponent: String,
    pub opponent_id: i32,
    pub player_elo: Option<i32>,
    pub opponent_elo: Option<i32>,
    /// "1-0", "0-1", "1/2-1/2" or "*".
    pub result: String,
    pub date: Option<String>,
    pub time: Option<String>,
    pub event: String,
    pub site: String,
    pub time_control: Option<String>,
    pub eco: Option<String>,
    /// Deepest catalog opening reached by the mainline.
    pub opening: Option<String>,
    /// Mainline length.
    pub plies: u32,
    /// Starts from a position other than the standard one.
    pub custom_start: bool,
    pub ending: BoardEnding,
    /// The side to move in the final position is the player.
    pub player_to_move_at_end: bool,
    /// Last `[%clk]` after a move of each side, in seconds.
    pub player_last_clock: Option<f32>,
    pub opponent_last_clock: Option<f32>,
    /// Named pawn structures of the middlegame (I-31).
    pub structures: Vec<PawnStructureHit>,
    /// How long the player thought per move, from the clocks and the time control (I-43).
    pub player_think: Option<ThinkTime>,
    /// First ply without queens on the board.
    pub queens_off_ply: Option<u32>,
    /// First ply of the endgame as Player Analysis defines it: no queens, at most six pieces.
    pub endgame_ply: Option<u32>,
}

/// Upper bounds, in seconds, of the think-time bins (the last one is open).
pub const THINK_BINS: [f32; 7] = [1.0, 2.0, 4.0, 8.0, 16.0, 32.0, 64.0];
/// Plies of the opening phase for the think time (the first ten moves of each side).
pub const THINK_OPENING_PLIES: u32 = 20;

/// Time the player spent on their moves in one game, from consecutive `[%clk]` values and the
/// increment: what a twin needs to think like them (I-43).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ThinkTime {
    /// Moves after the first ten, and the seconds spent on them.
    pub moves: u32,
    pub seconds: f32,
    /// Moves of the first ten (from the second one: the first clock is not reliable).
    pub opening_moves: u32,
    pub opening_seconds: f32,
    /// Moves after the first ten by time spent (`THINK_BINS`, plus one open bin).
    pub bins: [u32; 8],
}

/// "180+2" or "600" (Chess.com) as base and increment in seconds.
fn parse_time_control(time_control: &str) -> Option<(f32, f32)> {
    let mut parts = time_control.trim().split('+');
    let base = parts.next()?.trim().parse::<f32>().ok()?;
    let increment = match parts.next() {
        Some(increment) => increment.trim().parse::<f32>().ok()?,
        None => 0.0,
    };
    (base > 0.0).then_some((base, increment))
}

/// The player's think time from the clocks after each mainline ply. The first move of each side
/// is left out (Lichess starts the clocks after it), and spending is never negative.
pub(crate) fn think_time(
    clocks: &[(u32, f32)],
    player_white: bool,
    time_control: Option<&str>,
) -> Option<ThinkTime> {
    let (base, increment) = parse_time_control(time_control?)?;
    let parity = if player_white { 1 } else { 0 };
    let mut previous = base;
    let mut think = ThinkTime::default();
    for (index, (ply, clock)) in clocks
        .iter()
        .filter(|(ply, _)| ply % 2 == parity)
        .enumerate()
    {
        let spent = (previous - clock + increment).max(0.0);
        previous = *clock;
        if index == 0 {
            continue;
        }
        if *ply <= THINK_OPENING_PLIES {
            think.opening_moves += 1;
            think.opening_seconds += spent;
        } else {
            think.moves += 1;
            think.seconds += spent;
            let bin = THINK_BINS
                .iter()
                .position(|bound| spent < *bound)
                .unwrap_or(THINK_BINS.len());
            think.bins[bin] += 1;
        }
    }
    (think.moves + think.opening_moves > 0).then_some(think)
}

/// What the encoded mainline says beyond the headers.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct MainlineSummary {
    pub opening: Option<String>,
    pub plies: u32,
    pub ending: BoardEnding,
    pub white_to_move_at_end: bool,
    pub last_clock: [Option<f32>; 2],
    /// `[%clk]` after each mainline ply that has one.
    pub clocks: Vec<(u32, f32)>,
    pub structures: Vec<PawnStructureHit>,
    pub queens_off_ply: Option<u32>,
    pub endgame_ply: Option<u32>,
}

/// Parses the `[%clk h:mm:ss(.f)]` command of a comment.
pub(crate) fn parse_clock(comment: &str) -> Option<f32> {
    let start = comment.find("[%clk")? + "[%clk".len();
    let rest = comment[start..].trim_start();
    let end = rest.find(']')?;
    let mut seconds = 0.0_f32;
    for part in rest[..end].trim().split(':') {
        seconds = seconds * 60.0 + part.trim().parse::<f32>().ok()?;
    }
    Some(seconds)
}

pub(crate) fn summarize_mainline(moves: &[u8], initial_fen: &Fen) -> Option<MainlineSummary> {
    let mut chess = Chess::from_setup(initial_fen.clone().into_setup(), CastlingMode::Chess960)
        .or_else(shakmaty::PositionError::ignore_too_much_material)
        .ok()?;
    let mut opening = None;
    let mut plies = 0_u32;
    let mut depth = 0_usize;
    let mut last_mover: Option<Color> = None;
    let mut last_clock = [None, None];
    let mut clocks = Vec::new();
    let mut cursor = 0_usize;
    let mut broken = false;
    let mut structures = StructureTracker::default();
    let mut queens_off_ply = None;
    let mut endgame_ply = None;

    while cursor < moves.len() {
        let byte = moves[cursor];
        cursor += 1;
        match byte {
            VARIATION_START_MARKER => depth += 1,
            VARIATION_END_MARKER => depth = depth.saturating_sub(1),
            COMMENT_MARKER | NAG_MARKER => {
                if cursor + 2 > moves.len() {
                    break;
                }
                let len = u16::from_le_bytes([moves[cursor], moves[cursor + 1]]) as usize;
                cursor += 2;
                let end = cursor.saturating_add(len).min(moves.len());
                if byte == COMMENT_MARKER && depth == 0 {
                    if let Some(mover) = last_mover {
                        let comment = String::from_utf8_lossy(&moves[cursor..end]);
                        if let Some(clock) = parse_clock(&comment) {
                            last_clock[usize::from(mover == Color::Black)] = Some(clock);
                            clocks.push((plies, clock));
                        }
                    }
                }
                cursor = end;
            }
            _ if depth == 0 && !broken => {
                let Some(next) = decode_move(byte, &chess) else {
                    broken = true;
                    continue;
                };
                last_mover = Some(chess.turn());
                chess.play_unchecked(&next);
                plies += 1;
                structures.observe(plies, chess.board());
                if queens_off_ply.is_none() && chess.board().queens().is_empty() {
                    queens_off_ply = Some(plies);
                }
                if endgame_ply.is_none()
                    && chess.board().queens().is_empty()
                    && (chess.board().occupied() & !chess.board().pawns() & !chess.board().kings())
                        .count()
                        <= 6
                {
                    endgame_ply = Some(plies);
                }
                if (plies as usize) <= OPENING_PLIES {
                    if let Ok(name) =
                        get_opening_from_setup(chess.clone().into_setup(EnPassantMode::Legal))
                    {
                        opening = Some(name);
                    }
                }
            }
            _ => {}
        }
    }

    let ending = if chess.is_checkmate() {
        BoardEnding::Checkmate
    } else if chess.is_stalemate() {
        BoardEnding::Stalemate
    } else if chess.is_insufficient_material() {
        BoardEnding::InsufficientMaterial
    } else {
        BoardEnding::Open
    };
    Some(MainlineSummary {
        opening,
        plies,
        ending,
        white_to_move_at_end: chess.turn() == Color::White,
        last_clock,
        clocks,
        structures: structures.hits,
        queens_off_ply,
        endgame_ply,
    })
}

type GameRow = (
    (
        i32,
        Option<String>,
        Option<String>,
        i32,
        Option<i32>,
        i32,
        Option<i32>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    ),
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Vec<u8>,
);

#[tauri::command]
#[specta::specta]
pub async fn get_player_games(
    file: PathBuf,
    player_ids: Vec<i32>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<PlayerGameRow>, Error> {
    if player_ids.is_empty() {
        return Ok(Vec::new());
    }
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;
    load_player_games(db, &player_ids)
}

pub(crate) fn load_player_games(
    db: &mut SqliteConnection,
    player_ids: &[i32],
) -> Result<Vec<PlayerGameRow>, Error> {
    let timer = Instant::now();

    let (white_players, black_players) = diesel::alias!(players as white, players as black);
    let rows: Vec<GameRow> = games::table
        .inner_join(white_players.on(games::white_id.eq(white_players.field(players::id))))
        .inner_join(black_players.on(games::black_id.eq(black_players.field(players::id))))
        .inner_join(events::table.on(games::event_id.eq(events::id)))
        .inner_join(sites::table.on(games::site_id.eq(sites::id)))
        .filter(
            games::white_id
                .eq_any(player_ids)
                .or(games::black_id.eq_any(player_ids)),
        )
        .select((
            (
                games::id,
                games::date,
                games::time,
                games::white_id,
                games::white_elo,
                games::black_id,
                games::black_elo,
                games::result,
                games::time_control,
                games::eco,
                games::fen,
            ),
            white_players.field(players::name),
            black_players.field(players::name),
            events::name,
            sites::name,
            games::moves,
        ))
        .load(db)?;

    let mut data: Vec<PlayerGameRow> = rows
        .into_par_iter()
        .map(|(core, white, black, event, site, moves)| {
            let (
                id,
                date,
                time,
                white_id,
                white_elo,
                black_id,
                black_elo,
                result,
                time_control,
                eco,
                fen,
            ) = core;
            let is_white = player_ids.contains(&white_id);
            let start = fen
                .as_deref()
                .and_then(|fen| Fen::from_ascii(fen.as_bytes()).ok())
                .unwrap_or_default();
            let summary = summarize_mainline(&moves, &start);
            let (player_side, opponent_side) = if is_white { (0, 1) } else { (1, 0) };
            let player_think = summary
                .as_ref()
                .and_then(|summary| think_time(&summary.clocks, is_white, time_control.as_deref()));
            PlayerGameRow {
                id,
                player_id: if is_white { white_id } else { black_id },
                is_white,
                opponent: if is_white { black } else { white }.unwrap_or_default(),
                opponent_id: if is_white { black_id } else { white_id },
                player_elo: if is_white { white_elo } else { black_elo },
                opponent_elo: if is_white { black_elo } else { white_elo },
                result: match result.as_deref() {
                    Some(value @ ("1-0" | "0-1" | "1/2-1/2")) => value.to_string(),
                    _ => "*".to_string(),
                },
                date,
                time,
                event: event.unwrap_or_default(),
                site: site.unwrap_or_default(),
                time_control,
                eco,
                opening: summary.as_ref().and_then(|summary| summary.opening.clone()),
                plies: summary.as_ref().map_or(0, |summary| summary.plies),
                custom_start: fen.is_some(),
                ending: summary
                    .as_ref()
                    .map_or(BoardEnding::Open, |summary| summary.ending),
                player_to_move_at_end: summary
                    .as_ref()
                    .is_some_and(|summary| summary.white_to_move_at_end == is_white),
                player_last_clock: summary
                    .as_ref()
                    .and_then(|summary| summary.last_clock[player_side]),
                opponent_last_clock: summary
                    .as_ref()
                    .and_then(|summary| summary.last_clock[opponent_side]),
                structures: summary
                    .as_ref()
                    .map(|summary| summary.structures.clone())
                    .unwrap_or_default(),
                player_think,
                queens_off_ply: summary.as_ref().and_then(|summary| summary.queens_off_ply),
                endgame_ply: summary.as_ref().and_then(|summary| summary.endgame_ply),
            }
        })
        .collect();

    // Newest first; games without a date go last.
    data.sort_by(|a, b| {
        b.date
            .is_some()
            .cmp(&a.date.is_some())
            .then_with(|| b.date.cmp(&a.date))
            .then_with(|| b.time.cmp(&a.time))
            .then_with(|| b.id.cmp(&a.id))
    });

    // Logged for the performance budget (I-54): opening a player card.
    info!(
        "player games: {} games of {} record(s) in {} ms",
        data.len(),
        player_ids.len(),
        timer.elapsed().as_millis()
    );
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{Importer, TempGame};
    use pgn_reader::BufferedReader;

    fn encoded(pgn: &str) -> Vec<u8> {
        let mut importer = Importer::new(None);
        let games: Vec<TempGame> = BufferedReader::new(pgn.as_bytes())
            .into_iter(&mut importer)
            .flatten()
            .flatten()
            .collect();
        games[0].moves.clone()
    }

    /// Times `load_player_games` on a real database: `ONYX_BENCH_DB` (path) and
    /// `ONYX_BENCH_PLAYER` (exact name). Run with `cargo test --release player_games_bench -- --ignored --nocapture`.
    #[test]
    #[ignore = "needs a real database"]
    fn player_games_bench() {
        use diesel::Connection;
        let path = std::env::var("ONYX_BENCH_DB").expect("ONYX_BENCH_DB");
        let name = std::env::var("ONYX_BENCH_PLAYER").expect("ONYX_BENCH_PLAYER");
        let db = &mut SqliteConnection::establish(&path).unwrap();
        let id: i32 = players::table
            .filter(players::name.eq(&name))
            .select(players::id)
            .first(db)
            .unwrap();
        let timer = Instant::now();
        let games = load_player_games(db, &[id]).unwrap();
        let elapsed = timer.elapsed();
        let with_clock = games
            .iter()
            .filter(|game| game.player_last_clock.is_some())
            .count();
        let mates = games
            .iter()
            .filter(|game| game.ending == BoardEnding::Checkmate)
            .count();
        let named = games.iter().filter(|game| game.opening.is_some()).count();
        println!(
            "{name}: {} games in {} ms; {with_clock} with clocks, {mates} mates, {named} with an opening",
            games.len(),
            elapsed.as_millis()
        );
        let json = serde_json::to_string(&games).unwrap();
        println!("payload: {} kB", json.len() / 1024);
    }

    #[test]
    fn think_time_from_clocks_and_increment() {
        // 3+2: White's clocks after plies 1, 3, 5, 23 and 25; Black's after 2 and 4.
        let clocks = [
            (1, 180.0),
            (2, 180.0),
            (3, 178.0),
            (4, 175.0),
            (5, 170.0),
            (23, 160.0),
            (25, 130.0),
        ];
        let white = think_time(&clocks, true, Some("180+2")).unwrap();
        // The first move is skipped; 180 → 178 is 4 s with the increment, 178 → 170 is 10 s.
        assert_eq!(white.opening_moves, 2);
        assert_eq!(white.opening_seconds, 14.0);
        // 170 → 160 (12 s) and 160 → 130 (32 s) are after the first ten moves.
        assert_eq!(white.moves, 2);
        assert_eq!(white.seconds, 44.0);
        assert_eq!(white.bins[4], 1, "12 s is in 8–16");
        assert_eq!(white.bins[6], 1, "32 s is in 32–64");
        let black = think_time(&clocks, false, Some("180+2")).unwrap();
        assert_eq!(black.opening_moves, 1);
        assert_eq!(black.opening_seconds, 7.0);
        assert!(think_time(&clocks, true, Some("-")).is_none());
        assert!(think_time(&clocks, true, None).is_none());
        assert_eq!(parse_time_control("600"), Some((600.0, 0.0)));
    }

    #[test]
    fn clocks_are_parsed_in_seconds() {
        assert_eq!(parse_clock("[%clk 0:02:59]"), Some(179.0));
        assert_eq!(parse_clock("text [%clk 1:00:00.5] more"), Some(3600.5));
        assert_eq!(parse_clock("[%eval 0.3]"), None);
    }

    #[test]
    fn mainline_summary_reads_mate_turn_and_last_clocks() {
        let moves = encoded(
            r#"[Event "T"]
[Site "S"]
[White "W"]
[Black "B"]
[Result "0-1"]

1. f3 { [%clk 0:03:00] } e5 { [%clk 0:02:58] } 2. g4 { [%clk 0:02:55] } (2. g3 { [%clk 0:00:01] }) Qh4# { [%clk 0:02:50] } 0-1
"#,
        );
        let summary = summarize_mainline(&moves, &Fen::default()).unwrap();
        assert_eq!(summary.plies, 4);
        assert_eq!(summary.ending, BoardEnding::Checkmate);
        assert!(summary.white_to_move_at_end);
        // The clock of the variation does not replace the mainline one.
        assert_eq!(summary.last_clock, [Some(175.0), Some(170.0)]);
    }

    #[test]
    fn mainline_summary_names_the_opening_and_leaves_open_endings_open() {
        let moves = encoded(
            r#"[Event "T"]
[Site "S"]
[White "W"]
[Black "B"]
[Result "1-0"]

1. e4 c6 2. d4 d5 1-0
"#,
        );
        let summary = summarize_mainline(&moves, &Fen::default()).unwrap();
        assert_eq!(summary.ending, BoardEnding::Open);
        assert_eq!(summary.last_clock, [None, None]);
        assert!(summary
            .opening
            .is_some_and(|name| name.contains("Caro-Kann")));
    }
}
