//! Typical plans after a position: the moves one side makes within its next few moves, in any
//! order, counted once per game over the games of a position snapshot. The interface turns them
//! into a plan (compatible moves that are played together), so its threshold never recalculates.
use super::{
    encoding::{decode_move, iter_mainline_move_bytes},
    opening_report::{chess_from_fen, expected_white_score},
    position_query::{
        open_index, preempt_background_searches, snapshot_for, MatchRecord, Snapshot,
    },
    search::begin_position_search,
    search_index::{GameResult, MmapSearchIndex, SearchGameEntryRef},
};
use crate::{error::Error, AppState};
use serde::{Deserialize, Serialize};
use shakmaty::{CastlingSide, Color, Move, Position, Role, Square};
use specta::Type;
use std::{
    collections::HashMap,
    sync::atomic::Ordering,
    time::{Duration, Instant},
};
use tauri::Manager;

const BATCH: u32 = 4096;
/// Broad positions are sampled evenly beyond this many games; the result says so.
const MAX_PLAN_GAMES: u32 = 100_000;
const MAX_WINDOW: u32 = 10;
/// Moves below this share are never returned; the interface filters further.
const MIN_SHARE: f64 = 0.05;
const MAX_MOVES: usize = 24;

fn invalid(message: &str) -> Error {
    std::io::Error::other(message).into()
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PositionPlansOptions {
    /// The side whose moves are counted.
    pub white: bool,
    /// How many of that side's moves are read after the position.
    pub window: u32,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlanMove {
    /// "N", "B", "R", "Q", "K" or "P".
    pub piece: String,
    pub from: String,
    /// For a castle, the king's destination.
    pub to: String,
    /// "O-O" or "O-O-O".
    pub castle: Option<String>,
    pub promotion: Option<String>,
    pub games: u32,
    /// Games where the move captured something.
    pub captures: u32,
    /// Mean full-move number at which it was played.
    pub typical_move: f64,
    /// Games with both ratings and a known result: the base of the two means below.
    pub rated_games: u32,
    /// Mean score of the side in those games.
    pub score: f64,
    /// Mean score the ratings predicted for the side in those games.
    pub expected: f64,
    /// Games that also contain each returned move, in the same order (its own entry = games).
    pub together: Vec<u32>,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PositionPlans {
    /// Games of the snapshot.
    pub total: u32,
    /// Games read: all of them, or an even sample of a broad position.
    pub scanned: u32,
    /// Games read in which the side moved at least once: the base of every share.
    pub games: u32,
    pub rated_games: u32,
    pub score: f64,
    pub expected: f64,
    pub moves: Vec<PlanMove>,
    pub elapsed_ms: u32,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum Key {
    Normal {
        role: Role,
        /// None when only the destination counts (pieces in a pawn-structure search).
        from: Option<Square>,
        to: Square,
        promotion: Option<Role>,
    },
    Castle(CastlingSide),
}

/// `by_destination`: games of a pawn-structure search reach it with pieces anywhere, so a piece
/// move is told by where it goes; pawns share the structure and keep their origin.
fn key(movement: &Move, by_destination: bool) -> Option<Key> {
    match *movement {
        Move::Normal {
            role,
            from,
            to,
            promotion,
            ..
        } => Some(Key::Normal {
            role,
            from: (!by_destination || role == Role::Pawn).then_some(from),
            to,
            promotion,
        }),
        Move::EnPassant { from, to } => Some(Key::Normal {
            role: Role::Pawn,
            from: Some(from),
            to,
            promotion: None,
        }),
        Move::Castle { king, rook } => Some(Key::Castle(if rook.file() > king.file() {
            CastlingSide::KingSide
        } else {
            CastlingSide::QueenSide
        })),
        Move::Put { .. } => None,
    }
}

#[derive(Clone, Copy)]
struct Outcome {
    score: Option<f64>,
    expected: Option<f64>,
}

fn outcome(entry: &SearchGameEntryRef<'_>, side: Color) -> Outcome {
    let white = match entry.result {
        GameResult::WhiteWin => Some(1.0),
        GameResult::BlackWin => Some(0.0),
        GameResult::Draw => Some(0.5),
        GameResult::None | GameResult::Other => None,
    };
    let for_side = |white: f64| {
        if side == Color::White {
            white
        } else {
            1.0 - white
        }
    };
    Outcome {
        score: white.map(for_side),
        expected: (white.is_some() && entry.white_elo > 0 && entry.black_elo > 0).then(|| {
            for_side(expected_white_score(
                entry.white_elo as f64,
                entry.black_elo as f64,
            ))
        }),
    }
}

#[derive(Clone, Copy, Default)]
struct Aggregate {
    games: u32,
    captures: u32,
    move_sum: f64,
    rated: u32,
    score_sum: f64,
    expected_sum: f64,
}

impl Aggregate {
    fn add(&mut self, outcome: Outcome) {
        self.games += 1;
        if let (Some(score), Some(expected)) = (outcome.score, outcome.expected) {
            self.rated += 1;
            self.score_sum += score;
            self.expected_sum += expected;
        }
    }
    fn means(&self) -> (f64, f64) {
        if self.rated == 0 {
            return (0.0, 0.0);
        }
        (
            self.score_sum / self.rated as f64,
            self.expected_sum / self.rated as f64,
        )
    }
}

type Found = Vec<(Key, bool, u32)>;

/// Each side's distinct moves after the matched position (white first), with whether each
/// captured and the full-move number it was played at. Empty for a side that did not move.
fn moves_after(
    entry: &SearchGameEntryRef<'_>,
    record: &MatchRecord,
    window: u32,
    by_destination: bool,
) -> Result<[Found; 2], Error> {
    let mut chess = chess_from_fen(entry.fen)?;
    let mut iterator = iter_mainline_move_bytes(entry.moves);
    for _ in 0..record.ply {
        let byte = iterator
            .next()
            .ok_or_else(|| invalid("Truncated plans game"))?;
        let movement = decode_move(byte, &chess).ok_or_else(|| invalid("Invalid plans move"))?;
        chess.play_unchecked(&movement);
    }
    let mut found: [Found; 2] = [Vec::new(), Vec::new()];
    for _ in 0..window * 2 {
        let Some(byte) = iterator.next() else { break };
        let movement = decode_move(byte, &chess).ok_or_else(|| invalid("Invalid plans move"))?;
        let side = &mut found[side_index(chess.turn())];
        if let Some(key) = key(&movement, by_destination) {
            if !side.iter().any(|(seen, _, _)| *seen == key) {
                side.push((key, movement.is_capture(), chess.fullmoves().get()));
            }
        }
        chess.play_unchecked(&movement);
    }
    Ok(found)
}

fn side_index(side: Color) -> usize {
    if side == Color::White {
        0
    } else {
        1
    }
}

fn describe(key: Key, side: Color) -> (String, String, String, Option<String>, Option<String>) {
    match key {
        Key::Normal {
            role,
            from,
            to,
            promotion,
        } => (
            role.upper_char().to_string(),
            from.map(|square| square.to_string()).unwrap_or_default(),
            to.to_string(),
            None,
            promotion.map(|role| role.upper_char().to_string()),
        ),
        Key::Castle(castle) => (
            "K".into(),
            Square::from_coords(shakmaty::File::E, side.backrank()).to_string(),
            castle.king_to(side).to_string(),
            Some(
                if castle == CastlingSide::KingSide {
                    "O-O"
                } else {
                    "O-O-O"
                }
                .into(),
            ),
            None,
        ),
    }
}

/// Any search but an exact position matches games whose pieces stand elsewhere.
fn by_destination(snapshot: &Snapshot) -> bool {
    snapshot
        .query
        .position
        .as_ref()
        .is_some_and(|position| position.type_ != "exact")
}

pub(super) fn build_plans(
    snapshot: &Snapshot,
    index: &MmapSearchIndex,
    options: &PositionPlansOptions,
    max_games: u32,
    cancelled: &dyn Fn() -> bool,
) -> Result<PositionPlans, Error> {
    snapshot.check_revision()?;
    let started = Instant::now();
    let side = if options.white {
        Color::White
    } else {
        Color::Black
    };
    let window = options.window.clamp(1, MAX_WINDOW);
    let by_destination = by_destination(snapshot);
    let total = snapshot.summary.total;
    let stride = total.div_ceil(max_games.max(1)).max(1);

    let mut ids: HashMap<Key, u32> = HashMap::new();
    let mut keys: Vec<Key> = Vec::new();
    let mut aggregates: Vec<Aggregate> = Vec::new();
    // Each counted game's move ids, flattened, for the pairs once the top moves are known.
    let mut game_moves: Vec<u32> = Vec::new();
    let mut game_ends: Vec<u32> = Vec::new();
    let mut base = Aggregate::default();
    let mut scanned = 0_u32;

    for offset in (0..total).step_by(BATCH as usize) {
        if cancelled() {
            return Err(Error::SearchCancelled);
        }
        if started.elapsed() > Duration::from_secs(120) {
            return Err(invalid("Plans timed out"));
        }
        let records = snapshot.records(offset, BATCH)?;
        for (i, record) in records.iter().enumerate() {
            if !(offset + i as u32).is_multiple_of(stride) {
                continue;
            }
            scanned += 1;
            let entry = index
                .get_entry_ref(record.index_offset as usize)
                .filter(|entry| entry.id == record.id)
                .ok_or_else(|| invalid("Position query expired"))?;
            let [white, black] = moves_after(&entry, record, window, by_destination)?;
            let found = if side == Color::White { white } else { black };
            if found.is_empty() {
                continue;
            }
            let result = outcome(&entry, side);
            base.add(result);
            for (key, capture, fullmove) in found {
                let id = *ids.entry(key).or_insert_with(|| {
                    keys.push(key);
                    aggregates.push(Aggregate::default());
                    (keys.len() - 1) as u32
                });
                let aggregate = &mut aggregates[id as usize];
                aggregate.add(result);
                aggregate.move_sum += fullmove as f64;
                aggregate.captures += capture as u32;
                game_moves.push(id);
            }
            game_ends.push(game_moves.len() as u32);
        }
    }

    let minimum = ((base.games as f64 * MIN_SHARE).ceil() as u32).max(1);
    let mut selected: Vec<u32> = (0..keys.len() as u32)
        .filter(|&id| aggregates[id as usize].games >= minimum)
        .collect();
    let typical = |id: u32| {
        let aggregate = &aggregates[id as usize];
        aggregate.move_sum / aggregate.games as f64
    };
    selected.sort_by(|a, b| {
        aggregates[*b as usize]
            .games
            .cmp(&aggregates[*a as usize].games)
            .then_with(|| typical(*a).total_cmp(&typical(*b)))
            .then_with(|| describe(keys[*a as usize], side).cmp(&describe(keys[*b as usize], side)))
    });
    selected.truncate(MAX_MOVES);

    let mut position = vec![usize::MAX; keys.len()];
    for (i, id) in selected.iter().enumerate() {
        position[*id as usize] = i;
    }
    let mut together = vec![vec![0_u32; selected.len()]; selected.len()];
    let mut start = 0;
    for end in game_ends {
        let present: Vec<usize> = game_moves[start..end as usize]
            .iter()
            .map(|id| position[*id as usize])
            .filter(|&i| i != usize::MAX)
            .collect();
        for &a in &present {
            for &b in &present {
                together[a][b] += 1;
            }
        }
        start = end as usize;
    }

    let moves = selected
        .iter()
        .zip(together)
        .map(|(id, together)| {
            let aggregate = aggregates[*id as usize];
            let (piece, from, to, castle, promotion) = describe(keys[*id as usize], side);
            let (score, expected) = aggregate.means();
            PlanMove {
                piece,
                from,
                to,
                castle,
                promotion,
                games: aggregate.games,
                captures: aggregate.captures,
                typical_move: aggregate.move_sum / aggregate.games as f64,
                rated_games: aggregate.rated,
                score,
                expected,
                together,
            }
        })
        .collect();
    let (score, expected) = base.means();
    Ok(PositionPlans {
        total,
        scanned,
        games: base.games,
        rated_games: base.rated,
        score,
        expected,
        moves,
        elapsed_ms: started.elapsed().as_millis().min(u32::MAX as u128) as u32,
    })
}

/// Report plans use a fixed window: the report has no control for it.
pub(super) const REPORT_PLAN_WINDOW: u32 = 4;
/// Most played moves kept per side in a report; their cells follow the report's filters.
const MAX_REPORT_PLAN_MOVES: usize = 16;

#[derive(Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReportPlanMove {
    pub white: bool,
    pub piece: String,
    pub from: String,
    pub to: String,
    pub castle: Option<String>,
    pub promotion: Option<String>,
    /// Games of the sample with the move, before any filter.
    pub games: u32,
    pub typical_move: f64,
}

/// One move (or, without `plan_move`, the side itself) for one year and mean-Elo band, so the
/// report's rating and period filters also apply to its plans.
#[derive(Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReportPlanCell {
    /// Index into `ReportPlans::moves`; None for the side's games (the base of every share).
    pub plan_move: Option<u32>,
    pub white: bool,
    pub year: Option<u32>,
    /// Index into the report's `elo_bands`.
    pub band: Option<u32>,
    pub games: u32,
    pub captures: u32,
    /// Games with both ratings and a known result, and the side's score and expected score
    /// summed over them.
    pub rated_games: u32,
    pub score: f64,
    pub expected: f64,
}

#[derive(Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReportPlans {
    pub window: u32,
    /// Matching games read: all of them, or an even sample.
    pub scanned: u32,
    pub moves: Vec<ReportPlanMove>,
    pub cells: Vec<ReportPlanCell>,
}

#[derive(Clone, Copy, Default)]
struct CellSums {
    games: u32,
    captures: u32,
    rated: u32,
    score: f64,
    expected: f64,
}

impl CellSums {
    fn add(&mut self, outcome: Outcome, capture: bool) {
        self.games += 1;
        self.captures += capture as u32;
        if let (Some(score), Some(expected)) = (outcome.score, outcome.expected) {
            self.rated += 1;
            self.score += score;
            self.expected += expected;
        }
    }
}

/// (move id, or None for the side's own games; year; band).
type CellKey = (Option<u32>, Option<u32>, Option<u32>);

#[derive(Default)]
struct SidePlans {
    ids: HashMap<Key, u32>,
    keys: Vec<Key>,
    totals: Vec<Aggregate>,
    cells: HashMap<CellKey, CellSums>,
}

/// Collects both sides' plans while the report walks its games, reading an even sample of at
/// most `MAX_PLAN_GAMES` of them.
pub(super) struct ReportPlansBuilder {
    stride: u32,
    scanned: u32,
    sides: [SidePlans; 2],
}

impl ReportPlansBuilder {
    pub(super) fn new(total: u32) -> Self {
        Self {
            stride: total.div_ceil(MAX_PLAN_GAMES).max(1),
            scanned: 0,
            sides: Default::default(),
        }
    }

    /// `offset`: the game's position in the snapshot, which decides whether it is sampled.
    pub(super) fn add(
        &mut self,
        offset: u32,
        entry: &SearchGameEntryRef<'_>,
        record: &MatchRecord,
        year: Option<u32>,
        band: Option<u32>,
    ) -> Result<(), Error> {
        if !offset.is_multiple_of(self.stride) {
            return Ok(());
        }
        self.scanned += 1;
        let found = moves_after(entry, record, REPORT_PLAN_WINDOW, false)?;
        for (index, moves) in found.into_iter().enumerate() {
            if moves.is_empty() {
                continue;
            }
            let side = if index == 0 {
                Color::White
            } else {
                Color::Black
            };
            let result = outcome(entry, side);
            let plans = &mut self.sides[index];
            plans
                .cells
                .entry((None, year, band))
                .or_default()
                .add(result, false);
            for (key, capture, fullmove) in moves {
                let id = *plans.ids.entry(key).or_insert_with(|| {
                    plans.keys.push(key);
                    plans.totals.push(Aggregate::default());
                    (plans.keys.len() - 1) as u32
                });
                let total = &mut plans.totals[id as usize];
                total.add(result);
                total.move_sum += fullmove as f64;
                plans
                    .cells
                    .entry((Some(id), year, band))
                    .or_default()
                    .add(result, capture);
            }
        }
        Ok(())
    }

    pub(super) fn finish(self) -> ReportPlans {
        let mut moves = Vec::new();
        let mut cells = Vec::new();
        for (index, plans) in self.sides.into_iter().enumerate() {
            let side = if index == 0 {
                Color::White
            } else {
                Color::Black
            };
            let side_games: u32 = plans
                .cells
                .iter()
                .filter(|((id, _, _), _)| id.is_none())
                .map(|(_, sums)| sums.games)
                .sum();
            let minimum = ((side_games as f64 * MIN_SHARE).ceil() as u32).max(1);
            let typical = |id: u32| {
                let total = &plans.totals[id as usize];
                total.move_sum / total.games as f64
            };
            let mut selected: Vec<u32> = (0..plans.keys.len() as u32)
                .filter(|&id| plans.totals[id as usize].games >= minimum)
                .collect();
            selected.sort_by(|a, b| {
                plans.totals[*b as usize]
                    .games
                    .cmp(&plans.totals[*a as usize].games)
                    .then_with(|| typical(*a).total_cmp(&typical(*b)))
                    .then_with(|| {
                        describe(plans.keys[*a as usize], side)
                            .cmp(&describe(plans.keys[*b as usize], side))
                    })
            });
            selected.truncate(MAX_REPORT_PLAN_MOVES);
            let mut position: HashMap<u32, u32> = HashMap::new();
            for id in &selected {
                position.insert(*id, moves.len() as u32);
                let (piece, from, to, castle, promotion) = describe(plans.keys[*id as usize], side);
                moves.push(ReportPlanMove {
                    white: index == 0,
                    piece,
                    from,
                    to,
                    castle,
                    promotion,
                    games: plans.totals[*id as usize].games,
                    typical_move: typical(*id),
                });
            }
            let mut side_cells: Vec<ReportPlanCell> = plans
                .cells
                .into_iter()
                .filter_map(|((id, year, band), sums)| {
                    let plan_move = match id {
                        Some(id) => Some(*position.get(&id)?),
                        None => None,
                    };
                    Some(ReportPlanCell {
                        plan_move,
                        white: index == 0,
                        year,
                        band,
                        games: sums.games,
                        captures: sums.captures,
                        rated_games: sums.rated,
                        score: sums.score,
                        expected: sums.expected,
                    })
                })
                .collect();
            // A stable order keeps reports identical for identical input.
            side_cells.sort_by_key(|cell| (cell.plan_move, cell.year, cell.band));
            cells.extend(side_cells);
        }
        ReportPlans {
            window: REPORT_PLAN_WINDOW,
            scanned: self.scanned,
            moves,
            cells,
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn position_plans(
    token: String,
    options: PositionPlansOptions,
    tab_id: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<PositionPlans, Error> {
    let snapshot = snapshot_for(&token, &state)?;
    let sequence = state
        .position_search_sequence
        .fetch_add(1, Ordering::Relaxed)
        + 1;
    // Its own owner key: a new request for the tab supersedes the previous one.
    let request = begin_position_search(
        &state.active_position_searches,
        tab_id,
        snapshot.database.clone(),
        sequence,
    );
    preempt_background_searches(&state.active_position_searches);
    // Held only while the index opens: the count is CPU work and must not starve explorer queries.
    let permit = tokio::select! {
        permit = state.new_request.acquire() => permit.unwrap(),
        _ = request.cancelled() => return Err(Error::SearchCancelled),
    };
    let build_lock = tokio::select! {
        lock = state.position_index_build.lock() => lock,
        _ = request.cancelled() => return Err(Error::SearchCancelled),
    };
    let index_app = app.clone();
    let database = snapshot.database.clone();
    let flag = request.cancellation.clone();
    let index = tauri::async_runtime::spawn_blocking(move || {
        open_index(
            &database,
            &index_app.state::<AppState>(),
            &|| flag.cancelled.load(Ordering::Acquire),
            &|_| {},
        )
    })
    .await
    .map_err(|e| invalid(&e.to_string()))??;
    drop(build_lock);
    drop(permit);
    request.ensure_active("plans-index")?;
    let plans_snapshot = snapshot.clone();
    let flag = request.cancellation.clone();
    let plans = tauri::async_runtime::spawn_blocking(move || {
        build_plans(&plans_snapshot, &index, &options, MAX_PLAN_GAMES, &|| {
            flag.cancelled.load(Ordering::Acquire)
        })
    })
    .await
    .map_err(|e| invalid(&e.to_string()))??;
    request.ensure_active("plans-publication")?;
    Ok(plans)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{
        encoding::encode_move, position_query::tests::snapshot, GameQuery, PositionQueryJs,
    };
    use shakmaty::{fen::Fen, Chess};

    fn fixture(games: &[(&str, &str, i32)]) -> (tempfile::TempDir, std::path::PathBuf, AppState) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("plans.db3");
        let db = rusqlite::Connection::open(&path).unwrap();
        db.execute_batch(include_str!("create.sql")).unwrap();
        for (i, (moves, result, elo)) in games.iter().enumerate() {
            let mut chess = Chess::default();
            let mut bytes = Vec::new();
            for san in moves.split_whitespace() {
                let movement = san
                    .parse::<shakmaty::san::San>()
                    .unwrap()
                    .to_move(&chess)
                    .unwrap();
                bytes.push(encode_move(&movement, &chess).unwrap());
                chess.play_unchecked(&movement);
            }
            let material = super::super::get_material_count(chess.board());
            db.execute("INSERT INTO Games (ID,EventID,SiteID,WhiteID,BlackID,Date,WhiteElo,BlackElo,WhiteMaterial,BlackMaterial,Result,PlyCount,Moves,PawnHome) VALUES (?1,0,0,0,0,NULL,?2,?2,?3,?4,?5,?6,?7,?8)",
                rusqlite::params![i as i32 + 1, elo, material.white, material.black, result, bytes.len() as i32, bytes, super::super::get_pawn_home(chess.board())]).unwrap();
        }
        drop(db);
        (dir, path, AppState::default())
    }

    fn plans(
        games: &[(&str, &str, i32)],
        white: bool,
        window: u32,
        max_games: u32,
    ) -> PositionPlans {
        let (_dir, path, state) = fixture(games);
        let query = GameQuery::new().position(PositionQueryJs {
            fen: Fen::default().to_string(),
            type_: "exact".into(),
            ..Default::default()
        });
        let snapshot = snapshot(&path, &state, query);
        let index = open_index(&path, &state, &|| false, &|_| {}).unwrap();
        build_plans(
            &snapshot,
            &index,
            &PositionPlansOptions { white, window },
            max_games,
            &|| false,
        )
        .unwrap()
    }

    fn name(planned: &PlanMove) -> String {
        planned
            .castle
            .clone()
            .unwrap_or_else(|| format!("{}{}-{}", planned.piece, planned.from, planned.to))
    }

    const GAMES: &[(&str, &str, i32)] = &[
        ("e4 e5 Nf3 Nc6 Bc4 Nf6 O-O Bc5", "1-0", 2500),
        ("e4 e5 Nf3 Nc6 Bb5 a6", "0-1", 2500),
        ("d4 d5 c4", "1/2-1/2", 0),
        ("e4 c5 Nf3", "*", 2400),
    ];

    #[test]
    fn counts_each_move_once_per_game_within_the_window() {
        let result = plans(GAMES, true, 2, 100);
        assert_eq!((result.total, result.scanned, result.games), (4, 4, 4));
        let names: Vec<String> = result.moves.iter().map(name).collect();
        assert_eq!(names, ["Pe2-e4", "Ng1-f3", "Pd2-d4", "Pc2-c4"]);
        let e4 = &result.moves[0];
        assert_eq!(e4.games, 3);
        assert_eq!(e4.typical_move, 1.0);
        assert_eq!(result.moves[1].typical_move, 2.0);
        // e4 and Nf3 always come together; c4 only meets d4.
        assert_eq!(e4.together, vec![3, 3, 0, 0]);
        assert_eq!(result.moves[3].together, vec![0, 0, 1, 1]);
    }

    #[test]
    fn scores_only_games_with_ratings_and_a_result() {
        let result = plans(GAMES, true, 2, 100);
        let e4 = &result.moves[0];
        // Game 1 won, game 2 lost; game 4 has no result and game 3 has no ratings.
        assert_eq!(e4.rated_games, 2);
        assert!((e4.score - 0.5).abs() < 1e-9);
        assert!((e4.expected - 0.5).abs() < 1e-9);
        assert_eq!(result.rated_games, 2);
    }

    #[test]
    fn reads_the_chosen_side_and_names_castling_by_the_king() {
        let white = plans(GAMES, true, 4, 100);
        let castle = white.moves.iter().find(|m| m.castle.is_some()).unwrap();
        assert_eq!(
            (
                castle.castle.as_deref(),
                castle.from.as_str(),
                castle.to.as_str()
            ),
            (Some("O-O"), "e1", "g1")
        );
        assert_eq!(castle.typical_move, 4.0);
        let black = plans(GAMES, false, 1, 100);
        let names: Vec<String> = black.moves.iter().map(name).collect();
        assert_eq!(names, ["Pe7-e5", "Pc7-c5", "Pd7-d5"]);
        assert_eq!(black.games, 4);
    }

    #[test]
    fn groups_pieces_by_destination_in_structure_searches() {
        let chess = Chess::default();
        let play = |san: &str| {
            san.parse::<shakmaty::san::San>()
                .unwrap()
                .to_move(&chess)
                .unwrap()
        };
        let (knight, pawn) = (play("Nf3"), play("e4"));
        assert!(matches!(
            key(&knight, true),
            Some(Key::Normal { from: None, .. })
        ));
        assert!(matches!(
            key(&pawn, true),
            Some(Key::Normal { from: Some(_), .. })
        ));
        assert!(matches!(
            key(&knight, false),
            Some(Key::Normal { from: Some(_), .. })
        ));
    }

    #[test]
    fn samples_broad_positions_evenly() {
        let result = plans(GAMES, true, 2, 2);
        assert_eq!((result.total, result.scanned), (4, 2));
    }
}
