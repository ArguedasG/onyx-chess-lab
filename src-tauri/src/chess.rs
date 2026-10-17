use std::{
    collections::BTreeMap,
    fmt::Display,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

use derivative::Derivative;
use governor::{Quota, RateLimiter};
use log::{info, warn};
use nonzero_ext::*;
use serde::{Deserialize, Serialize};
use shakmaty::{
    fen::Fen, san::SanPlus, uci::UciMove, ByColor, CastlingMode, Chess, Color, EnPassantMode,
    Position, Role,
};
use specta::Type;
use tauri_specta::Event;
use tokio::sync::Mutex;
use vampirc_uci::{
    parse_one,
    uci::{Score, ScoreValue},
    UciInfoAttribute, UciMessage, UciOptionConfig,
};

use crate::{
    analysis_cache::{self, AnalysisCache, CachedLine},
    db::{positions_in_db, NoveltyReference},
    engine::{
        parse_fen_and_apply_moves, BaseEngine, EngineLog, EngineOption, EngineReader, GoMode,
    },
    error::Error,
    lichess_cloud,
    progress::update_progress,
    AppState,
};

pub struct EngineProcess {
    base: BaseEngine,
    last_depth: u32,
    best_moves: Vec<BestMoves>,
    last_best_moves: Vec<BestMoves>,
    last_progress: f32,
    options: EngineOptions,
    go_mode: GoMode,
    running: bool,
    real_multipv: u16,
    start: Instant,
}

impl EngineProcess {
    async fn new(path: PathBuf, args: &[String]) -> Result<(Self, EngineReader), Error> {
        let mut base = BaseEngine::spawn(path, args).await?;
        base.init_uci().await?;
        let reader = base.take_reader().ok_or(Error::EngineDisconnected)?;

        Ok((
            Self {
                base,
                last_depth: 0,
                best_moves: Vec::new(),
                last_best_moves: Vec::new(),
                last_progress: 0.0,
                options: EngineOptions::default(),
                real_multipv: 0,
                go_mode: GoMode::Infinite,
                running: false,
                start: Instant::now(),
            },
            reader,
        ))
    }

    async fn set_option<T>(&mut self, name: &str, value: T) -> Result<(), Error>
    where
        T: Display,
    {
        self.base.set_option(name, value).await
    }

    async fn set_options(&mut self, options: EngineOptions) -> Result<(), Error> {
        let fen_changed = options.fen != self.options.fen;
        let fen: Fen = options.fen.parse()?;
        let setup = fen.as_setup();
        let castling_mode = CastlingMode::detect(setup);
        let pos = parse_fen_and_apply_moves(&options.fen, &options.moves)?;

        if fen_changed {
            if castling_mode.is_chess960() {
                self.set_option("UCI_Chess960", "true").await?;
            } else {
                self.set_option("UCI_Chess960", "false").await?;
            }
        }

        let multipv = options
            .extra_options
            .iter()
            .find(|x| x.name == "MultiPV")
            .map(|x| x.value.parse().unwrap_or(1))
            .unwrap_or(1);

        self.real_multipv = multipv.min(pos.legal_moves().len() as u16);

        for option in &options.extra_options {
            if !self.options.extra_options.contains(option) && option.name != "UCI_Chess960" {
                self.set_option(&option.name, &option.value).await?;
            }
        }

        if fen_changed || options.moves != self.options.moves {
            self.set_position(&options.fen, &options.moves).await?;
        }
        self.last_depth = 0;
        self.options = options.clone();
        self.best_moves.clear();
        self.last_best_moves.clear();
        Ok(())
    }

    async fn set_position(&mut self, fen: &str, moves: &[String]) -> Result<(), Error> {
        self.base.set_position(fen, moves).await?;
        self.options.fen = fen.to_string();
        self.options.moves = moves.to_owned();
        Ok(())
    }

    async fn go(&mut self, mode: &GoMode) -> Result<(), Error> {
        self.go_mode = mode.clone();
        self.base.go(mode).await?;
        self.running = true;
        self.start = Instant::now();
        Ok(())
    }

    async fn stop(&mut self) -> Result<(), Error> {
        self.base.stop().await?;
        self.running = false;
        Ok(())
    }

    async fn kill(&mut self) -> Result<(), Error> {
        self.base.quit().await?;
        self.running = false;
        Ok(())
    }

    pub fn kill_sync(&mut self) {
        self.base.kill_sync();
    }
}

#[derive(Clone, Serialize, Debug, Derivative, Type)]
#[derivative(Default)]
pub struct BestMoves {
    nodes: u32,
    depth: u32,
    score: Score,
    #[serde(rename = "uciMoves")]
    uci_moves: Vec<String>,
    #[serde(rename = "sanMoves")]
    san_moves: Vec<String>,
    #[derivative(Default(value = "1"))]
    multipv: u16,
    nps: u32,
}

#[derive(Serialize, Debug, Clone, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct BestMovesPayload {
    pub best_lines: Vec<BestMoves>,
    pub engine: String,
    pub tab: String,
    pub fen: String,
    pub moves: Vec<String>,
    pub progress: f64,
}

/// An `error ...` line from a running analysis engine. Lc0, for example, stays alive but never
/// searches when its backend cannot start, so without this the panel would wait forever.
#[derive(Serialize, Debug, Clone, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct EngineErrorPayload {
    pub engine: String,
    pub tab: String,
    pub message: String,
}

impl BestMoves {
    /// `(is_mate, value)` from White's perspective.
    #[cfg(test)]
    pub(crate) fn score_value(&self) -> (bool, i32) {
        match self.score.value {
            ScoreValue::Cp(cp) => (false, cp),
            ScoreValue::Mate(moves) => (true, moves),
        }
    }
}

impl From<&BestMoves> for CachedLine {
    fn from(line: &BestMoves) -> Self {
        let (mate, value) = match line.score.value {
            ScoreValue::Cp(cp) => (false, cp),
            ScoreValue::Mate(moves) => (true, moves),
        };
        CachedLine {
            multipv: line.multipv,
            depth: line.depth,
            nodes: line.nodes,
            nps: line.nps,
            mate,
            value,
            wdl: line.score.wdl,
            uci: line.uci_moves.clone(),
            san: line.san_moves.clone(),
        }
    }
}

impl From<CachedLine> for BestMoves {
    fn from(line: CachedLine) -> Self {
        BestMoves {
            nodes: line.nodes,
            depth: line.depth,
            score: Score {
                value: if line.mate {
                    ScoreValue::Mate(line.value)
                } else {
                    ScoreValue::Cp(line.value)
                },
                wdl: line.wdl,
                lower_bound: None,
                upper_bound: None,
            },
            uci_moves: line.uci,
            san_moves: line.san,
            multipv: line.multipv,
            nps: line.nps,
        }
    }
}

fn invert_score(score: Score) -> Score {
    let new_value = match score.value {
        ScoreValue::Cp(x) => ScoreValue::Cp(-x),
        ScoreValue::Mate(x) => ScoreValue::Mate(-x),
    };
    let new_wdl = score.wdl.map(|(w, d, l)| (l, d, w));
    Score {
        value: new_value,
        wdl: new_wdl,
        ..score
    }
}

fn parse_uci_attrs(
    attrs: Vec<UciInfoAttribute>,
    fen: &Fen,
    moves: &[String],
) -> Result<BestMoves, Error> {
    let mut best_moves = BestMoves::default();

    let mut pos = parse_fen_and_apply_moves(&fen.to_string(), moves)?;
    let turn = pos.turn();

    for a in attrs {
        match a {
            UciInfoAttribute::Pv(m) => {
                for mv in m {
                    let uci: UciMove = mv.to_string().parse()?;
                    let m = uci.to_move(&pos)?;
                    let san = SanPlus::from_move_and_play_unchecked(&mut pos, &m);
                    best_moves.san_moves.push(san.to_string());
                    best_moves.uci_moves.push(uci.to_string());
                }
            }
            UciInfoAttribute::Nps(nps) => {
                best_moves.nps = nps as u32;
            }
            UciInfoAttribute::Nodes(nodes) => {
                best_moves.nodes = nodes as u32;
            }
            UciInfoAttribute::Depth(depth) => {
                best_moves.depth = depth;
            }
            UciInfoAttribute::MultiPv(multipv) => {
                best_moves.multipv = multipv;
            }
            UciInfoAttribute::Score(score) => {
                best_moves.score = score;
            }
            _ => (),
        }
    }

    if best_moves.san_moves.is_empty() {
        return Err(Error::NoMovesFound);
    }

    if turn == Color::Black {
        best_moves.score = invert_score(best_moves.score);
    }

    Ok(best_moves)
}

/// Runs one bounded search and returns the score from White's perspective.
/// The caller owns the engine process so several positions can be analyzed
/// without spawning a new process for every ply.
pub(crate) async fn evaluate_position_score(
    base: &mut BaseEngine,
    reader: &mut EngineReader,
    fen: &str,
    moves: &[String],
    go_mode: &GoMode,
) -> Result<ScoreValue, Error> {
    base.set_position(fen, moves).await?;
    base.go(go_mode).await?;

    let parsed_fen: Fen = fen.parse()?;
    let mut latest_score = None;

    while let Some(line) = reader.next_line().await? {
        base.log_engine(&line);
        match parse_one(&line) {
            UciMessage::Info(attrs) => {
                if let Ok(best_moves) = parse_uci_attrs(attrs, &parsed_fen, moves) {
                    latest_score = Some(best_moves.score.value);
                }
            }
            UciMessage::BestMove { .. } => break,
            _ => {}
        }
    }

    latest_score.ok_or(Error::NoMovesFound)
}

/// Runs one bounded search and returns the score and W/D/L from White's perspective.
pub(crate) async fn evaluate_position_wdl(
    base: &mut BaseEngine,
    reader: &mut EngineReader,
    fen: &str,
    moves: &[String],
    go_mode: &GoMode,
) -> Result<Option<(u32, u32, u32)>, Error> {
    base.set_position(fen, moves).await?;
    base.go(go_mode).await?;

    let parsed_fen: Fen = fen.parse()?;
    let mut latest_wdl = None;

    while let Some(line) = reader.next_line().await? {
        base.log_engine(&line);
        match parse_one(&line) {
            UciMessage::Info(attrs) => {
                if let Ok(best_moves) = parse_uci_attrs(attrs, &parsed_fen, moves) {
                    if let Some((win, draw, loss)) = best_moves.score.wdl {
                        latest_wdl =
                            Some((win.max(0) as u32, draw.max(0) as u32, loss.max(0) as u32));
                    }
                }
            }
            UciMessage::BestMove { .. } => break,
            _ => {}
        }
    }

    Ok(latest_wdl)
}

#[derive(Deserialize, Debug, Clone, Type, Derivative, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
#[derivative(Default)]
pub struct EngineOptions {
    pub fen: String,
    pub moves: Vec<String>,
    pub extra_options: Vec<EngineOption>,
}

#[tauri::command]
#[specta::specta]
pub async fn kill_engines(tab: String, state: tauri::State<'_, AppState>) -> Result<(), Error> {
    let keys: Vec<_> = state
        .engine_processes
        .iter()
        .map(|x| x.key().clone())
        .collect();
    for key in keys.clone() {
        if key.0.starts_with(&tab) {
            {
                let process = state.engine_processes.get_mut(&key).unwrap();
                let mut process = process.lock().await;
                process.kill().await?;
            }
            state.engine_processes.remove(&key);
        }
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn kill_engine(
    engine: String,
    tab: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), Error> {
    let key = (tab, engine);
    if let Some(process) = state.engine_processes.get(&key) {
        let mut process = process.lock().await;
        process.kill().await?;
    }
    Ok(())
}
#[tauri::command]
#[specta::specta]
pub async fn stop_engine(
    engine: String,
    tab: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), Error> {
    let key = (tab, engine);
    if let Some(process) = state.engine_processes.get(&key) {
        let mut process = process.lock().await;
        process.stop().await?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_engine_logs(
    engine: String,
    tab: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<EngineLog>, Error> {
    let key = (tab, engine);
    if let Some(process) = state.engine_processes.get(&key) {
        let process = process.lock().await;
        Ok(process.base.get_logs())
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
#[specta::specta]
pub async fn get_best_moves(
    id: String,
    engine: String,
    engine_args: Vec<String>,
    tab: String,
    go_mode: GoMode,
    options: EngineOptions,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Option<(f32, Vec<BestMoves>)>, Error> {
    let path = PathBuf::from(&engine);

    let key = (tab.clone(), id.clone());

    if state.engine_processes.contains_key(&key) {
        {
            let process = state.engine_processes.get_mut(&key).unwrap();
            let mut process = process.lock().await;
            if options == process.options && go_mode == process.go_mode && process.running {
                return Ok(Some((
                    process.last_progress,
                    process.last_best_moves.clone(),
                )));
            }
            process.stop().await?;
        }
        // give time for engine to stop and process previous lines
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        {
            let process = state.engine_processes.get_mut(&key).unwrap();
            let mut process = process.lock().await;
            process.set_options(options.clone()).await?;
            process.go(&go_mode).await?;
        }
        return Ok(None);
    }

    let (mut process, mut reader) = EngineProcess::new(path, &engine_args).await?;
    process.set_options(options.clone()).await?;
    process.go(&go_mode).await?;

    let process = Arc::new(Mutex::new(process));

    state.engine_processes.insert(key.clone(), process.clone());

    let lim = RateLimiter::direct(Quota::per_second(nonzero!(5u32)));

    while let Some(line) = reader.next_line().await? {
        let mut proc = process.lock().await;
        match parse_one(&line) {
            UciMessage::Info(attrs) => {
                match parse_uci_attrs(attrs, &proc.options.fen.parse()?, &proc.options.moves) {
                    Ok(best_moves) => {
                        if best_moves.score.lower_bound == Some(true)
                            || best_moves.score.upper_bound == Some(true)
                        {
                            continue;
                        }
                        let multipv = best_moves.multipv;
                        let cur_depth = best_moves.depth;
                        let cur_nodes = best_moves.nodes;
                        if multipv as usize == proc.best_moves.len() + 1 {
                            proc.best_moves.push(best_moves);
                            if multipv == proc.real_multipv {
                                if proc.best_moves.iter().all(|x| x.depth == cur_depth)
                                    && cur_depth >= proc.last_depth
                                    && lim.check().is_ok()
                                {
                                    let progress = match &proc.go_mode {
                                        GoMode::Depth(depth) => {
                                            (cur_depth as f64 / *depth as f64) * 100.0
                                        }
                                        GoMode::Time(time) => {
                                            (proc.start.elapsed().as_millis() as f64 / *time as f64)
                                                * 100.0
                                        }
                                        GoMode::Nodes(nodes) => {
                                            (cur_nodes as f64 / *nodes as f64) * 100.0
                                        }
                                        GoMode::DepthTime(limit) => {
                                            ((cur_depth as f64 / limit.depth as f64).max(
                                                proc.start.elapsed().as_millis() as f64
                                                    / limit.time as f64,
                                            ) * 100.0)
                                                .min(99.99)
                                        }
                                        GoMode::PlayersTime(_) => 99.99,
                                        GoMode::Infinite => 99.99,
                                    };
                                    BestMovesPayload {
                                        best_lines: proc.best_moves.clone(),
                                        engine: id.clone(),
                                        tab: tab.clone(),
                                        fen: proc.options.fen.clone(),
                                        moves: proc.options.moves.clone(),
                                        progress,
                                    }
                                    .emit(&app)?;
                                    proc.last_depth = cur_depth;
                                    proc.last_best_moves = proc.best_moves.clone();
                                    proc.last_progress = progress as f32;
                                }
                                proc.best_moves.clear();
                            }
                        }
                    }
                    Err(e) => match e {
                        Error::NoMovesFound => {}
                        _ => {
                            warn!("Failed to parse info line: {}, error: {:?}", line, e);
                        }
                    },
                }
            }
            UciMessage::BestMove { .. } => {
                BestMovesPayload {
                    best_lines: proc.last_best_moves.clone(),
                    engine: id.clone(),
                    tab: tab.clone(),
                    fen: proc.options.fen.clone(),
                    moves: proc.options.moves.clone(),
                    progress: 100.0,
                }
                .emit(&app)?;
                proc.last_progress = 100.0;
            }
            _ => {
                if let Some(message) = engine_error_message(&line) {
                    warn!(
                        "Engine reported an error: tab: {}, engine: {}, {}",
                        tab, engine, message
                    );
                    EngineErrorPayload {
                        engine: id.clone(),
                        tab: tab.clone(),
                        message: message.to_string(),
                    }
                    .emit(&app)?;
                }
            }
        }
        proc.base.log_engine(&line);
    }
    info!("Engine process finished: tab: {}, engine: {}", tab, engine);
    state.engine_processes.remove(&key);
    Ok(None)
}

/// Text of a UCI-style `error` line, which the protocol does not define but Lc0 and others send.
fn engine_error_message(line: &str) -> Option<&str> {
    let message = line.trim().strip_prefix("error")?;
    if !message.is_empty() && !message.starts_with(char::is_whitespace) {
        return None;
    }
    Some(message.trim()).filter(|message| !message.is_empty())
}

fn update_best_moves_snapshot(snapshot: &mut BTreeMap<u16, BestMoves>, best_moves: BestMoves) {
    let latest_depth = snapshot
        .values()
        .map(|line| line.depth)
        .max()
        .unwrap_or_default();
    if best_moves.depth < latest_depth {
        return;
    }
    if best_moves.depth > latest_depth {
        snapshot.clear();
    }
    snapshot.insert(best_moves.multipv, best_moves);
}

async fn get_best_moves_once_inner(
    path: PathBuf,
    engine_args: &[String],
    go_mode: &GoMode,
    options: EngineOptions,
) -> Result<Vec<BestMoves>, Error> {
    let (mut process, mut reader) = EngineProcess::new(path, engine_args).await?;
    process.set_options(options).await?;
    process.go(go_mode).await?;

    let mut snapshot = BTreeMap::new();
    while let Some(line) = reader.next_line().await? {
        process.base.log_engine(&line);
        match parse_one(&line) {
            UciMessage::Info(attrs) => {
                match parse_uci_attrs(attrs, &process.options.fen.parse()?, &process.options.moves)
                {
                    Ok(best_moves) => update_best_moves_snapshot(&mut snapshot, best_moves),
                    Err(Error::NoMovesFound) => {}
                    Err(error) => {
                        warn!("Failed to parse bounded engine response: {line}, error: {error:?}");
                    }
                }
            }
            UciMessage::BestMove { .. } => {
                process.running = false;
                let _ = process.kill().await;
                let result = snapshot.into_values().collect::<Vec<_>>();
                return if result.is_empty() {
                    Err(Error::NoMovesFound)
                } else {
                    Ok(result)
                };
            }
            _ => {}
        }
    }

    Err(Error::EngineDisconnected)
}

/// Runs an isolated, bounded engine query for an interactive decision.
///
/// Unlike `get_best_moves`, this command returns as soon as the engine emits
/// `bestmove`. Dropping the private process on timeout also terminates the
/// engine, so callers never depend on the lifecycle of the continuous analysis
/// stream.
#[tauri::command]
#[specta::specta]
pub async fn get_best_moves_once(
    engine: PathBuf,
    engine_args: Vec<String>,
    go_mode: GoMode,
    options: EngineOptions,
    timeout_ms: u32,
) -> Result<Vec<BestMoves>, Error> {
    let timeout = Duration::from_millis(u64::from(timeout_ms.clamp(500, 30_000)));
    tokio::time::timeout(
        timeout,
        get_best_moves_once_inner(engine, &engine_args, &go_mode, options),
    )
    .await
    .map_err(|_| Error::EngineTimeout("bounded interactive evaluation".to_string()))?
}

#[derive(Serialize, Debug, Default, Type)]
pub struct MoveAnalysis {
    pub(crate) best: Vec<BestMoves>,
    novelty: bool,
    is_sacrifice: bool,
}

#[derive(Deserialize, Debug, Default, Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisOptions {
    pub fen: String,
    pub moves: Vec<String>,
    pub annotate_novelties: bool,
    pub reference_db: Option<PathBuf>,
    pub reversed: bool,
    /// PGN date of the analyzed game; only earlier database games count for its novelty.
    #[serde(default)]
    #[specta(optional)]
    pub game_date: Option<String>,
    /// Players of the analyzed game, used to leave the game itself out when it has no date.
    #[serde(default)]
    #[specta(optional)]
    pub white: Option<String>,
    #[serde(default)]
    #[specta(optional)]
    pub black: Option<String>,
    /// Batch analyses wait for a slot of the engine budget and use its threads and hash.
    #[serde(default)]
    #[specta(optional)]
    pub priority: Option<AnalysisPriority>,
    /// Reuse and store evaluations in the analysis cache (on unless `false`).
    #[serde(default)]
    #[specta(optional)]
    pub use_cache: Option<bool>,
    /// Second, deeper pass only around the moves the first pass judged doubtful.
    #[serde(default)]
    #[specta(optional)]
    pub refine: Option<GoMode>,
    /// Take the evaluations of the opening from the Lichess cloud when it has them (sends the
    /// positions to Lichess; off unless `true`).
    #[serde(default)]
    #[specta(optional)]
    pub cloud_openings: Option<bool>,
}

/// A cloud evaluation as the engine would have reported it. `None` if a line is not legal here.
fn cloud_analysis(fen: &Fen, evaluation: &lichess_cloud::CloudEval) -> Option<MoveAnalysis> {
    let mut best = Vec::new();
    for (index, pv) in evaluation.pvs.iter().enumerate() {
        let mut position: Chess = fen
            .clone()
            .into_position(CastlingMode::detect(fen.as_setup()))
            .ok()?;
        let mut line = BestMoves {
            depth: evaluation.depth,
            multipv: index as u16 + 1,
            score: Score {
                value: match (pv.mate, pv.cp) {
                    (Some(mate), _) => ScoreValue::Mate(mate),
                    (None, Some(cp)) => ScoreValue::Cp(cp),
                    (None, None) => return None,
                },
                ..Score::default()
            },
            ..BestMoves::default()
        };
        for uci in pv.moves.split_whitespace() {
            let uci: UciMove = uci.parse().ok()?;
            let chess_move = uci.to_move(&position).ok()?;
            // Lichess writes castling as king takes rook (e1h1); the rest of Onyx uses e1g1.
            line.uci_moves
                .push(UciMove::from_move(&chess_move, CastlingMode::Standard).to_string());
            line.san_moves.push(
                SanPlus::from_move_and_play_unchecked(&mut position, &chess_move).to_string(),
            );
        }
        if line.uci_moves.is_empty() {
            return None;
        }
        best.push(line);
    }
    Some(MoveAnalysis {
        best,
        ..MoveAnalysis::default()
    })
}

#[derive(Deserialize, Debug, Default, Clone, Copy, PartialEq, Eq, Type)]
#[serde(rename_all = "camelCase")]
pub enum AnalysisPriority {
    #[default]
    Interactive,
    Batch,
}

/// Live-analysis engines searching right now (a busy, locked one counts as searching) plus bot
/// engines thinking in games.
fn running_live_engines(state: &AppState) -> u32 {
    state.game_manager.thinking_engines()
        + state
            .engine_processes
            .iter()
            .filter(|entry| {
                entry
                    .value()
                    .try_lock()
                    .map_or(true, |process| process.running)
            })
            .count() as u32
}

/// Moves losing more winning chances than this (points, 0–100) are looked at again in the second
/// pass: everything the report would annotate (?!, ?, ??), with a little margin below.
pub(crate) const REFINE_MIN_LOSS: f64 = 4.0;
/// At most this many positions are refined per game, the largest losses first, so the second
/// pass stays within a few seconds per game.
pub(crate) const MAX_REFINED_POSITIONS: usize = 12;

fn win_chance(cp: f64) -> f64 {
    50.0 + 50.0 * (2.0 / (1.0 + (-0.003_682_08 * cp).exp()) - 1.0)
}

/// White's evaluation of a position in centipawns, mates at ±1000 like the report.
fn white_centipawns(analysis: &MoveAnalysis) -> Option<f64> {
    let line = analysis.best.first()?;
    Some(match line.score.value {
        ScoreValue::Cp(cp) => (cp as f64).clamp(-1000.0, 1000.0),
        ScoreValue::Mate(moves) => 1000.0 * (moves as f64).signum(),
    })
}

/// Positions (in game order) to analyze again: both sides of every move whose loss of winning
/// chances exceeds `REFINE_MIN_LOSS`, largest losses first, at most `MAX_REFINED_POSITIONS`.
/// `white_to_move[i]` tells who moves in position `i`.
pub(crate) fn refinement_targets(analysis: &[MoveAnalysis], white_to_move: &[bool]) -> Vec<usize> {
    let mut moves: Vec<(f64, usize)> = (0..analysis.len().saturating_sub(1))
        .filter_map(|ply| {
            let before = white_centipawns(&analysis[ply])?;
            let after = white_centipawns(&analysis[ply + 1])?;
            let sign = if *white_to_move.get(ply)? { 1.0 } else { -1.0 };
            let loss = win_chance(sign * before) - win_chance(sign * after);
            (loss > REFINE_MIN_LOSS).then_some((loss, ply))
        })
        .collect();
    moves.sort_by(|a, b| b.0.total_cmp(&a.0));
    let mut targets: Vec<usize> = Vec::new();
    for (_, ply) in moves {
        for position in [ply, ply + 1] {
            if targets.len() < MAX_REFINED_POSITIONS && !targets.contains(&position) {
                targets.push(position);
            }
        }
    }
    targets.sort_unstable();
    targets
}

/// Second pass: analyzes `targets` again with `refine` and keeps those results.
pub(crate) async fn refine_positions(
    run: &AnalysisRun<'_>,
    refine: &GoMode,
    positions: &[(Fen, Vec<String>)],
    analysis: &mut [MoveAnalysis],
    targets: &[usize],
    cancelled: &AtomicBool,
    progress: &mut (dyn FnMut(usize) + Send),
) -> Result<AnalysisRunStats, Error> {
    let subset: Vec<(Fen, Vec<String>)> = targets
        .iter()
        .map(|&index| positions[index].clone())
        .collect();
    let deep = AnalysisRun {
        go_mode: refine,
        ..*run
    };
    let (refined, stats) = analyze_positions(&deep, &subset, cancelled, progress).await?;
    for (&index, result) in targets.iter().zip(refined) {
        if !result.best.is_empty() {
            analysis[index].best = result.best;
        }
    }
    Ok(stats)
}

/// Engine lines per analyzed position (the best move and the second best).
const ANALYSIS_LINES: u16 = 2;

/// Sets `name` to `value`, replacing it if the engine settings already had it.
fn set_engine_option(options: &mut Vec<EngineOption>, name: &str, value: String) {
    options.retain(|option| !option.name.eq_ignore_ascii_case(name));
    options.push(EngineOption {
        name: name.to_string(),
        value,
    });
}

/// Statistics of one analysis run, kept for the logs and the benchmark.
#[derive(Debug, Default, Clone, Copy)]
pub struct AnalysisRunStats {
    pub positions: usize,
    pub cache_hits: usize,
}

/// Grace period on top of the requested move time before a silent engine counts as hung.
const ENGINE_HANG_MARGIN: Duration = Duration::from_secs(30);

#[tauri::command]
#[specta::specta]
pub async fn cancel_analysis(id: String, state: tauri::State<'_, AppState>) -> Result<(), Error> {
    if let Some(flag) = state.analysis_cancel_flags.get(&id) {
        flag.store(true, Ordering::SeqCst);
    }
    Ok(())
}

/// Removes a report's cancel flag on every exit path, unless a newer run already replaced it.
struct CancelFlagGuard<'a> {
    flags: &'a dashmap::DashMap<String, Arc<AtomicBool>>,
    id: String,
    flag: Arc<AtomicBool>,
}

impl Drop for CancelFlagGuard<'_> {
    fn drop(&mut self) {
        self.flags
            .remove_if(&self.id, |_, current| Arc::ptr_eq(current, &self.flag));
    }
}

/// What `analyze_positions` needs to know about the engine and the search.
pub(crate) struct AnalysisRun<'a> {
    pub engine: &'a std::path::Path,
    pub engine_args: &'a [String],
    pub go_mode: &'a GoMode,
    /// Final options, `MultiPV` included.
    pub uci_options: &'a [EngineOption],
    /// FEN the `moves` of every position start from.
    pub start_fen: &'a str,
    pub cache: Option<&'a AnalysisCache>,
}

/// Analyzes each position (its FEN and the moves that lead to it), answering from the cache when
/// it can and starting the engine only for the rest. `progress` receives the positions done.
pub(crate) async fn analyze_positions(
    run: &AnalysisRun<'_>,
    positions: &[(Fen, Vec<String>)],
    cancelled: &AtomicBool,
    progress: &mut (dyn FnMut(usize) + Send),
) -> Result<(Vec<MoveAnalysis>, AnalysisRunStats), Error> {
    let identity = analysis_cache::engine_identity(run.engine, run.engine_args, run.uci_options);
    let limit = serde_json::to_string(run.go_mode).unwrap_or_default();
    // The number of lines is part of the cache key: two lines are not five.
    let lines = run
        .uci_options
        .iter()
        .find(|option| option.name.eq_ignore_ascii_case("MultiPV"))
        .and_then(|option| option.value.parse::<u16>().ok())
        .unwrap_or(ANALYSIS_LINES);
    let mut stats = AnalysisRunStats::default();
    let mut analysis: Vec<MoveAnalysis> = Vec::with_capacity(positions.len());
    // Started on the first position the cache cannot answer.
    let mut engine_process: Option<(EngineProcess, EngineReader)> = None;

    for (i, (position_fen, moves)) in positions.iter().enumerate() {
        if cancelled.load(Ordering::SeqCst) {
            if let Some((proc, _)) = engine_process.as_mut() {
                let _ = proc.kill().await;
            }
            return Err(Error::AnalysisCancelled);
        }

        progress(i);

        stats.positions += 1;
        let cache_key =
            analysis_cache::entry_key(&identity, &limit, lines, &position_fen.to_string());
        if let Some(lines) = run.cache.and_then(|cache| cache.get(&cache_key)) {
            stats.cache_hits += 1;
            analysis.push(MoveAnalysis {
                best: lines.into_iter().map(BestMoves::from).collect(),
                ..MoveAnalysis::default()
            });
            continue;
        }

        if engine_process.is_none() {
            engine_process =
                Some(EngineProcess::new(run.engine.to_path_buf(), run.engine_args).await?);
        }
        let (proc, reader) = engine_process.as_mut().expect("started above");

        // A position without moves stands on its own (`evaluate_positions`); otherwise the moves
        // from the start keep the history the engine needs for repetitions.
        proc.set_options(EngineOptions {
            fen: if moves.is_empty() {
                position_fen.to_string()
            } else {
                run.start_fen.to_string()
            },
            moves: moves.clone(),
            extra_options: run.uci_options.to_vec(),
        })
        .await?;

        proc.go(run.go_mode).await?;
        // Only a time limit says how long a search should take; depth or nodes can legitimately
        // take minutes, so those are never cut off.
        let hang_deadline = match run.go_mode {
            GoMode::Time(ms) => {
                Some(Instant::now() + Duration::from_millis((*ms).into()) + ENGINE_HANG_MARGIN)
            }
            GoMode::DepthTime(limit) => {
                Some(Instant::now() + Duration::from_millis(limit.time.into()) + ENGINE_HANG_MARGIN)
            }
            _ => None,
        };

        let mut current_analysis = MoveAnalysis::default();
        loop {
            // Poll so a cancel takes effect during long searches, not only between positions.
            let line =
                match tokio::time::timeout(Duration::from_millis(250), reader.next_line()).await {
                    Err(_) => {
                        if cancelled.load(Ordering::SeqCst) {
                            let _ = proc.kill().await;
                            return Err(Error::AnalysisCancelled);
                        }
                        if hang_deadline.is_some_and(|deadline| Instant::now() > deadline) {
                            let _ = proc.kill().await;
                            return Err(Error::EngineTimeout(format!(
                                "no answer in position {} of {}",
                                i + 1,
                                positions.len()
                            )));
                        }
                        continue;
                    }
                    Ok(Ok(Some(line))) => line,
                    // The engine exited or crashed: fail instead of returning an empty report.
                    Ok(_) => return Err(Error::EngineDisconnected),
                };
            match parse_one(&line) {
                UciMessage::Info(attrs) => {
                    if let Ok(best_moves) =
                        parse_uci_attrs(attrs, &proc.options.fen.parse()?, moves)
                    {
                        let multipv = best_moves.multipv;
                        let cur_depth = best_moves.depth;
                        if multipv as usize == proc.best_moves.len() + 1 {
                            proc.best_moves.push(best_moves);
                            if multipv == proc.real_multipv {
                                if proc.best_moves.iter().all(|x| x.depth == cur_depth)
                                    && cur_depth >= proc.last_depth
                                {
                                    current_analysis.best = proc.best_moves.clone();
                                    proc.last_depth = cur_depth;
                                }
                                assert_eq!(proc.best_moves.len(), proc.real_multipv as usize);
                                proc.best_moves.clear();
                            }
                        }
                    }
                }
                UciMessage::BestMove { .. } => {
                    break;
                }
                _ => {}
            }
        }
        if let Some(cache) = run.cache {
            if !current_analysis.best.is_empty() {
                let lines: Vec<CachedLine> =
                    current_analysis.best.iter().map(CachedLine::from).collect();
                cache.put(&cache_key, &lines);
            }
        }
        analysis.push(current_analysis);
    }
    if let Some((proc, _)) = engine_process.as_mut() {
        let _ = proc.kill().await;
    }
    if let Some(cache) = run.cache {
        cache.prune(analysis_cache::MAX_ENTRIES);
    }
    Ok((analysis, stats))
}

/// Lines `evaluate_positions` may ask for.
const MAX_EVALUATION_LINES: u16 = 8;

/// Evaluates unrelated positions with one engine process: the batch analyzer of the reports
/// (engine budget, cache, cancellation with `cancel_analysis`), with `lines` principal variations.
/// Used by the repertoire generator and the surprise finder (8.5).
#[tauri::command]
#[specta::specta]
pub async fn evaluate_positions(
    id: String,
    engine: String,
    engine_args: Vec<String>,
    go_mode: GoMode,
    fens: Vec<String>,
    lines: u16,
    uci_options: Vec<EngineOption>,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<MoveAnalysis>, Error> {
    let cancel_flag = Arc::new(AtomicBool::new(false));
    if let Some(previous) = state
        .analysis_cancel_flags
        .insert(id.clone(), cancel_flag.clone())
    {
        previous.store(true, Ordering::SeqCst);
    }
    let _cancel_guard = CancelFlagGuard {
        flags: &state.analysis_cancel_flags,
        id: id.clone(),
        flag: cancel_flag.clone(),
    };
    let positions = fens
        .iter()
        .map(|fen| Fen::from_ascii(fen.as_bytes()).map(|fen| (fen, Vec::new())))
        .collect::<Result<Vec<(Fen, Vec<String>)>, _>>()?;
    if positions.is_empty() {
        return Ok(Vec::new());
    }
    let _batch_slot =
        crate::engine_budget::acquire_batch_slot(|| running_live_engines(&state)).await;
    let budget = *crate::engine_budget::BUDGET;
    let mut uci_options = uci_options;
    set_engine_option(
        &mut uci_options,
        "Threads",
        budget.threads_per_process.to_string(),
    );
    set_engine_option(
        &mut uci_options,
        "Hash",
        budget.hash_mb_per_process.to_string(),
    );
    set_engine_option(
        &mut uci_options,
        "MultiPV",
        lines.clamp(1, MAX_EVALUATION_LINES).to_string(),
    );
    let cache = analysis_cache::cache_path(&app)
        .and_then(|cache_path| AnalysisCache::open(&cache_path))
        .map_err(|error| warn!("Analysis cache unavailable: {error}"))
        .ok();
    let path = PathBuf::from(&engine);
    let start_fen = positions[0].0.to_string();
    let run = AnalysisRun {
        engine: &path,
        engine_args: &engine_args,
        go_mode: &go_mode,
        uci_options: &uci_options,
        start_fen: &start_fen,
        cache: cache.as_ref(),
    };
    let total = positions.len();
    let (analysis, stats) = analyze_positions(&run, &positions, &cancel_flag, &mut |done| {
        let _ = update_progress(
            &state.progress_state,
            &app,
            id.clone(),
            (done as f32 / total as f32) * 100.0,
            false,
        );
    })
    .await?;
    info!(
        "Evaluation {id}: {} positions, {} from the cache",
        stats.positions, stats.cache_hits
    );
    let _ = update_progress(&state.progress_state, &app, id.clone(), 100.0, true);
    Ok(analysis)
}

#[tauri::command]
#[specta::specta]
pub async fn analyze_game(
    id: String,
    engine: String,
    engine_args: Vec<String>,
    go_mode: GoMode,
    options: AnalysisOptions,
    uci_options: Vec<EngineOption>,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<MoveAnalysis>, Error> {
    if options.annotate_novelties && options.reference_db.is_none() {
        return Err(Error::MissingReferenceDatabase);
    }

    let cancel_flag = Arc::new(AtomicBool::new(false));
    // A new report for the same tab replaces the old one; otherwise the old run could no longer
    // be cancelled and would keep the engine and the database busy.
    if let Some(previous) = state
        .analysis_cancel_flags
        .insert(id.clone(), cancel_flag.clone())
    {
        previous.store(true, Ordering::SeqCst);
    }
    let _cancel_guard = CancelFlagGuard {
        flags: &state.analysis_cancel_flags,
        id: id.clone(),
        flag: cancel_flag.clone(),
    };

    let path = PathBuf::from(&engine);

    // Batch work waits for a slot so several analyses never saturate the machine.
    let priority = options.priority.unwrap_or_default();
    let _batch_slot = if priority == AnalysisPriority::Batch {
        Some(crate::engine_budget::acquire_batch_slot(|| running_live_engines(&state)).await)
    } else {
        None
    };
    let mut uci_options = uci_options;
    if priority == AnalysisPriority::Batch {
        let budget = *crate::engine_budget::BUDGET;
        set_engine_option(
            &mut uci_options,
            "Threads",
            budget.threads_per_process.to_string(),
        );
        set_engine_option(
            &mut uci_options,
            "Hash",
            budget.hash_mb_per_process.to_string(),
        );
    }
    set_engine_option(&mut uci_options, "MultiPV", ANALYSIS_LINES.to_string());

    // The cache never decides whether the analysis runs: any failure just disables it.
    let cache = if options.use_cache != Some(false) {
        analysis_cache::cache_path(&app)
            .and_then(|cache_path| AnalysisCache::open(&cache_path))
            .map_err(|error| warn!("Analysis cache unavailable: {error}"))
            .ok()
    } else {
        None
    };

    let fen = Fen::from_ascii(options.fen.as_bytes())?;
    let setup = fen.as_setup().clone();
    let castling_mode = CastlingMode::detect(&setup);

    let mut chess: Chess = setup.position(castling_mode)?;
    let mut fens: Vec<(Fen, Vec<String>, bool)> = vec![(fen, vec![], false)];

    options
        .moves
        .iter()
        .enumerate()
        .try_for_each(|(i, m)| -> Result<(), Error> {
            let uci = UciMove::from_ascii(m.as_bytes())?;
            let m = uci.to_move(&chess)?;
            let previous_pos = chess.clone();
            chess.play_unchecked(&m);
            let current_pos = chess.clone();
            if !chess.is_game_over() {
                let prev_eval = naive_eval(&previous_pos);
                let cur_eval = -naive_eval(&current_pos);
                fens.push((
                    Fen::from_position(current_pos, EnPassantMode::Legal),
                    options.moves.clone().into_iter().take(i + 1).collect(),
                    prev_eval > cur_eval + 100,
                ));
            }
            Ok(())
        })?;

    // Opening positions from the Lichess cloud, if the user asked for it. The last one is left to
    // the engine as well, so the move that leaves the cloud compares two engine evaluations.
    let mut cloud_prefix: Vec<MoveAnalysis> = Vec::new();
    if options.cloud_openings == Some(true) {
        let fen_strings: Vec<String> = fens.iter().map(|(fen, _, _)| fen.to_string()).collect();
        let evaluations =
            lichess_cloud::opening_prefix(&fen_strings, ANALYSIS_LINES, &cancel_flag).await;
        for (index, evaluation) in evaluations.iter().enumerate() {
            match cloud_analysis(&fens[index].0, evaluation) {
                Some(analysis) => cloud_prefix.push(analysis),
                None => break,
            }
        }
        cloud_prefix.pop();
        info!(
            "Analysis {id}: {} positions from the Lichess cloud",
            cloud_prefix.len()
        );
    }

    // Leave room in the progress bar for the database pass that finds the novelty.
    let engine_share = if options.annotate_novelties {
        90.0
    } else {
        100.0
    };

    // The engine analyzes the positions after the cloud prefix, last first when reversed.
    let mut positions: Vec<(Fen, Vec<String>)> = fens[cloud_prefix.len()..]
        .iter()
        .map(|(fen, moves, _)| (fen.clone(), moves.clone()))
        .collect();
    if options.reversed {
        positions.reverse();
    }
    let total = positions.len().max(1);
    // The second pass, if any, takes the last part of the engine's share of the progress bar.
    let first_share = if options.refine.is_some() {
        engine_share * 0.85
    } else {
        engine_share
    };
    let run = AnalysisRun {
        engine: &path,
        engine_args: &engine_args,
        go_mode: &go_mode,
        uci_options: &uci_options,
        start_fen: &options.fen,
        cache: cache.as_ref(),
    };
    let (mut analysis, stats) = analyze_positions(&run, &positions, &cancel_flag, &mut |done| {
        let _ = update_progress(
            &state.progress_state,
            &app,
            id.clone(),
            (done as f32 / total as f32) * first_share,
            false,
        );
    })
    .await?;
    info!(
        "Analysis {id}: {} positions, {} from the cache",
        stats.positions, stats.cache_hits
    );

    if options.reversed {
        analysis.reverse();
    }
    // Back in game order, after the positions taken from the cloud.
    let mut analysis = {
        let mut full = cloud_prefix;
        full.extend(analysis);
        full
    };

    if let Some(refine) = options.refine.as_ref() {
        let white_to_move: Vec<bool> = fens
            .iter()
            .map(|(fen, _, _)| fen.as_setup().turn == Color::White)
            .collect();
        let targets = refinement_targets(&analysis, &white_to_move);
        if !targets.is_empty() {
            let positions: Vec<(Fen, Vec<String>)> = fens
                .iter()
                .map(|(fen, moves, _)| (fen.clone(), moves.clone()))
                .collect();
            let run = AnalysisRun {
                engine: &path,
                engine_args: &engine_args,
                go_mode: &go_mode,
                uci_options: &uci_options,
                start_fen: &options.fen,
                cache: cache.as_ref(),
            };
            let total = targets.len();
            let stats = refine_positions(
                &run,
                refine,
                &positions,
                &mut analysis,
                &targets,
                &cancel_flag,
                &mut |done| {
                    let _ = update_progress(
                        &state.progress_state,
                        &app,
                        id.clone(),
                        engine_share * (0.85 + 0.15 * done as f32 / total as f32),
                        false,
                    );
                },
            )
            .await?;
            info!(
                "Analysis {id}: second pass on {} positions, {} from the cache",
                stats.positions, stats.cache_hits
            );
        }
    }

    for (i, analysis) in analysis.iter_mut().enumerate() {
        analysis.is_sacrifice = fens[i].2;
    }

    if let (true, Some(reference)) = (options.annotate_novelties, options.reference_db.clone()) {
        // The novelty is the first position of the game that no game in the database reached.
        let positions = fens
            .iter()
            .map(|(fen, _, _)| {
                let setup = fen.as_setup().clone();
                let mode = CastlingMode::detect(&setup);
                setup.position::<Chess>(mode).map_err(Error::from)
            })
            .collect::<Result<Vec<_>, _>>()?;
        let report_progress = |fraction: f32| {
            let _ = update_progress(
                &state.progress_state,
                &app,
                id.clone(),
                engine_share + fraction * (100.0 - engine_share - 1.0),
                false,
            );
        };
        let known = |name: &Option<String>| {
            name.as_deref()
                .map(str::trim)
                .filter(|name| !name.is_empty() && *name != "?")
                .map(str::to_string)
        };
        let novelty_reference = NoveltyReference {
            date: options.game_date.clone(),
            players: known(&options.white).zip(known(&options.black)),
        };
        let novelty_key = analysis_cache::novelty_key(
            &reference,
            novelty_reference.date.as_deref(),
            novelty_reference
                .players
                .as_ref()
                .map(|(white, black)| (white.as_str(), black.as_str())),
            &fens
                .iter()
                .map(|(fen, _, _)| fen.to_string())
                .collect::<Vec<_>>(),
        );
        let cached = cache
            .as_ref()
            .and_then(|cache| cache.get_novelty(&novelty_key))
            .filter(|found| found.len() == positions.len());
        let found = match cached {
            Some(found) => found,
            None => {
                let found = positions_in_db(
                    reference,
                    positions,
                    novelty_reference,
                    id.clone(),
                    state.clone(),
                    &cancel_flag,
                    &report_progress,
                )
                .await?;
                if let Some(cache) = cache.as_ref() {
                    cache.put_novelty(&novelty_key, &found);
                }
                found
            }
        };
        if let Some(first_new) = found.iter().position(|found| !found) {
            analysis[first_new].novelty = true;
        }
    }

    update_progress(&state.progress_state, &app, id.clone(), 100.0, true)?;
    Ok(analysis)
}

fn count_material(position: &Chess) -> i32 {
    if position.is_checkmate() {
        return -10000;
    }
    let material: ByColor<i32> = position.board().material().map(|p| {
        p.pawn as i32 * piece_value(Role::Pawn)
            + p.knight as i32 * piece_value(Role::Knight)
            + p.bishop as i32 * piece_value(Role::Bishop)
            + p.rook as i32 * piece_value(Role::Rook)
            + p.queen as i32 * piece_value(Role::Queen)
    });
    if position.turn() == Color::White {
        material.white - material.black
    } else {
        material.black - material.white
    }
}

fn piece_value(role: Role) -> i32 {
    match role {
        Role::Pawn => 90,
        Role::Knight => 300,
        Role::Bishop => 300,
        Role::Rook => 500,
        Role::Queen => 1000,
        _ => 0,
    }
}

fn qsearch(position: &Chess, mut alpha: i32, beta: i32) -> i32 {
    let stand_pat = count_material(position);

    if stand_pat >= beta {
        return beta;
    }
    if alpha < stand_pat {
        alpha = stand_pat;
    }
    let legal_moves = position.legal_moves();
    let mut captures: Vec<_> = legal_moves.iter().filter(|m| m.is_capture()).collect();

    captures.sort_by(|a, b| {
        let a_value = piece_value(a.capture().unwrap());
        let b_value = piece_value(b.capture().unwrap());
        b_value.cmp(&a_value)
    });

    for capture in captures {
        let mut new_position = position.clone();
        new_position.play_unchecked(capture);
        let score = -qsearch(&new_position, -beta, -alpha);
        if score >= beta {
            return beta;
        }
        if score > alpha {
            alpha = score;
        }
    }

    alpha
}

fn naive_eval(pos: &Chess) -> i32 {
    pos.legal_moves()
        .iter()
        .map(|mv| {
            let mut new_position = pos.clone();
            new_position.play_unchecked(mv);
            -qsearch(&new_position, i32::MIN, i32::MAX)
        })
        .max()
        .unwrap_or(i32::MIN)
}

#[cfg(test)]
mod tests {
    use std::{
        env,
        io::{self, BufRead, Write},
        time::Instant,
    };

    use shakmaty::FromSetup;

    use super::*;

    static BOUNDED_ENGINE_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

    #[test]
    #[ignore = "helper process for bounded interactive UCI tests"]
    fn mock_bounded_uci_engine() {
        let Some(mode) = env::var_os("CHESS_LAB_MOCK_BOUNDED_UCI") else {
            return;
        };
        let hangs = mode == "hang";
        let stdin = io::stdin();
        let mut stdout = io::stdout();

        for line in stdin.lock().lines() {
            let line = line.expect("mock engine must read stdin");
            match line.as_str() {
                "uci" => {
                    writeln!(stdout, "id name Chess Lab bounded mock engine").unwrap();
                    writeln!(
                        stdout,
                        "option name MultiPV type spin default 1 min 1 max 8"
                    )
                    .unwrap();
                    writeln!(stdout, "option name UCI_Chess960 type check default false").unwrap();
                    writeln!(stdout, "uciok").unwrap();
                }
                "isready" => writeln!(stdout, "readyok").unwrap(),
                command if command.starts_with("go ") && !hangs => {
                    writeln!(
                        stdout,
                        "info depth 16 multipv 1 score cp 40 nodes 10 nps 100 pv e2e4"
                    )
                    .unwrap();
                    writeln!(
                        stdout,
                        "info depth 16 multipv 2 score cp 20 nodes 10 nps 100 pv d2d4"
                    )
                    .unwrap();
                    writeln!(stdout, "bestmove e2e4").unwrap();
                }
                "quit" => break,
                _ => {}
            }
            stdout.flush().unwrap();
        }
    }

    fn bounded_mock_args() -> Vec<String> {
        vec![
            "--ignored".to_string(),
            "--exact".to_string(),
            "chess::tests::mock_bounded_uci_engine".to_string(),
            "--nocapture".to_string(),
        ]
    }

    fn bounded_test_options() -> EngineOptions {
        EngineOptions {
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".to_string(),
            moves: Vec::new(),
            extra_options: vec![EngineOption {
                name: "MultiPV".to_string(),
                value: "8".to_string(),
            }],
        }
    }

    #[tokio::test]
    async fn bounded_engine_query_returns_on_bestmove_without_waiting_for_process_exit() {
        let _guard = BOUNDED_ENGINE_TEST_LOCK.lock().await;
        env::set_var("CHESS_LAB_MOCK_BOUNDED_UCI", "respond");
        let result = get_best_moves_once(
            env::current_exe().unwrap(),
            bounded_mock_args(),
            GoMode::Depth(16),
            bounded_test_options(),
            5_000,
        )
        .await;
        env::remove_var("CHESS_LAB_MOCK_BOUNDED_UCI");

        let lines = result.unwrap();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].multipv, 1);
        assert_eq!(lines[0].uci_moves.first().map(String::as_str), Some("e2e4"));
        assert_eq!(lines[1].multipv, 2);
        assert_eq!(lines[1].uci_moves.first().map(String::as_str), Some("d2d4"));
    }

    #[tokio::test]
    async fn bounded_engine_query_times_out_and_releases_the_caller() {
        let _guard = BOUNDED_ENGINE_TEST_LOCK.lock().await;
        env::set_var("CHESS_LAB_MOCK_BOUNDED_UCI", "hang");
        let started = Instant::now();
        let result = get_best_moves_once(
            env::current_exe().unwrap(),
            bounded_mock_args(),
            GoMode::Depth(16),
            bounded_test_options(),
            1_500,
        )
        .await;
        env::remove_var("CHESS_LAB_MOCK_BOUNDED_UCI");

        assert!(matches!(result, Err(Error::EngineTimeout(_))));
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[tokio::test]
    #[ignore = "requires CHESS_LAB_REFERENCE_ENGINE pointing to a strong UCI engine"]
    async fn bounded_engine_query_works_with_a_real_reference_engine() {
        let Some(path) = env::var_os("CHESS_LAB_REFERENCE_ENGINE") else {
            eprintln!("CHESS_LAB_REFERENCE_ENGINE is not configured; skipping external audit");
            return;
        };
        let lines = get_best_moves_once(
            path.into(),
            Vec::new(),
            GoMode::Depth(12),
            bounded_test_options(),
            8_000,
        )
        .await
        .unwrap();

        assert!(!lines.is_empty());
        assert_eq!(lines[0].multipv, 1);
        assert!(!lines[0].uci_moves.is_empty());
    }

    fn pos(fen: &str) -> Chess {
        let fen: Fen = fen.parse().unwrap();
        Chess::from_setup(fen.into_setup(), CastlingMode::Chess960).unwrap()
    }

    #[test]
    fn cloud_lines_become_engine_lines_with_standard_castling() {
        let fen: Fen = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4"
            .parse()
            .unwrap();
        let pv = |moves: &str, cp: Option<i32>, mate: Option<i32>| crate::lichess_cloud::CloudPv {
            moves: moves.to_string(),
            cp,
            mate,
        };
        let evaluation = crate::lichess_cloud::CloudEval {
            depth: 40,
            pvs: vec![pv("e1h1 f8c5", Some(25), None), pv("f3g5", None, Some(-7))],
        };
        let analysis = cloud_analysis(&fen, &evaluation).unwrap();
        assert_eq!(analysis.best[0].uci_moves, vec!["e1g1", "f8c5"]);
        assert_eq!(analysis.best[0].san_moves, vec!["O-O", "Bc5"]);
        assert_eq!(analysis.best[0].score_value(), (false, 25));
        assert_eq!(analysis.best[1].multipv, 2);
        assert_eq!(analysis.best[1].score_value(), (true, -7));
        // A line that is not legal in the position is rejected.
        let broken = crate::lichess_cloud::CloudEval {
            depth: 40,
            pvs: vec![pv("e1e5", Some(0), None)],
        };
        assert!(cloud_analysis(&fen, &broken).is_none());
    }

    fn scored(cp: i32) -> MoveAnalysis {
        MoveAnalysis {
            best: vec![BestMoves {
                score: Score {
                    value: ScoreValue::Cp(cp),
                    ..Score::default()
                },
                ..BestMoves::default()
            }],
            ..MoveAnalysis::default()
        }
    }

    #[test]
    fn engine_error_lines_are_recognised() {
        assert_eq!(
            engine_error_message("error No CUDA driver, or one older than the CUDA library"),
            Some("No CUDA driver, or one older than the CUDA library")
        );
        assert_eq!(engine_error_message("errors are fine"), None);
        assert_eq!(engine_error_message("error"), None);
        assert_eq!(engine_error_message("info string error in eval"), None);
    }

    #[test]
    fn second_pass_targets_both_sides_of_doubtful_moves() {
        // White to move first. 1. 0 → +20 (fine), 1... +20 → +250 (Black loses ~20 points),
        // 2. +250 → +240 (fine), 2... +240 → +260 (fine).
        let analysis: Vec<MoveAnalysis> = [0, 20, 250, 240, 260].map(scored).into();
        let white_to_move = [true, false, true, false, true];
        assert_eq!(refinement_targets(&analysis, &white_to_move), vec![1, 2]);
        // Nothing doubtful, nothing to refine.
        let quiet: Vec<MoveAnalysis> = [0, 10, 0, 10].map(scored).into();
        assert!(refinement_targets(&quiet, &[true, false, true, false]).is_empty());
        // A game full of errors is capped, keeping the largest losses.
        let wild: Vec<MoveAnalysis> = (0..40)
            .map(|ply| scored(if ply % 2 == 0 { 300 } else { -300 }))
            .collect();
        let white_to_move: Vec<bool> = (0..40).map(|ply| ply % 2 == 0).collect();
        assert_eq!(
            refinement_targets(&wild, &white_to_move).len(),
            MAX_REFINED_POSITIONS
        );
    }

    #[test]
    fn eval_start_pos() {
        assert_eq!(naive_eval(&Chess::default()), 0);
    }

    #[test]
    fn eval_scandi() {
        let position = pos("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2");
        assert_eq!(naive_eval(&position), 0);
    }

    #[test]
    fn eval_hanging_pawn() {
        let position = pos("r1bqkbnr/ppp1pppp/2n5/1B1p4/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3");
        assert_eq!(naive_eval(&position), 90);
    }

    #[test]
    fn eval_complex_center() {
        let position = pos("r1bqkbnr/ppp2ppp/2n5/1B1pp3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4");
        assert_eq!(naive_eval(&position), 90);
    }

    #[test]
    fn eval_in_check() {
        let position = pos("r1bqkbnr/ppp2ppp/2B5/3pp3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 4");
        assert_eq!(naive_eval(&position), -90);
    }

    #[test]
    fn eval_rook_stack() {
        let position = pos("rnrq4/8/8/1R6/1R6/1R5K/1Q6/7k w - - 0 1");
        assert_eq!(naive_eval(&position), 10000);
    }

    #[test]
    fn eval_rook_stack2() {
        let position = pos("rnrq4/8/8/1R6/1Q6/1R5K/1R6/7k w - - 0 1");
        assert_eq!(naive_eval(&position), 10000);
    }

    #[test]
    fn eval_opera_game1() {
        let position = pos("4kb1r/p2rqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2K4R w k - 0 14");
        assert_eq!(naive_eval(&position), -120);
    }

    #[test]
    fn eval_opera_game2() {
        let position = pos("4kb1r/p2rqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2KR4 b k - 1 14");
        assert_eq!(naive_eval(&position), 20);
    }
}

#[derive(Type, Default, Serialize, Debug)]
pub struct EngineConfig {
    pub name: String,
    pub options: Vec<UciOptionConfig>,
}

const ENGINE_CONFIG_TIMEOUT: Duration = Duration::from_secs(30);

#[tauri::command]
#[specta::specta]
pub async fn get_engine_config(path: PathBuf, args: Vec<String>) -> Result<EngineConfig, Error> {
    let mut base = BaseEngine::spawn(path, &args).await?;

    base.send("uci").await?;

    let mut config = EngineConfig::default();

    tokio::time::timeout(ENGINE_CONFIG_TIMEOUT, async {
        let reader = base.reader_mut().ok_or(Error::EngineDisconnected)?;
        while let Some(line) = reader.next_line().await? {
            if let UciMessage::Id {
                name: Some(name),
                author: _,
            } = parse_one(&line)
            {
                config.name = name;
            }
            if let UciMessage::Option(opt) = parse_one(&line) {
                config.options.push(opt);
            }
            if let UciMessage::UciOk = parse_one(&line) {
                return Ok(());
            }
        }
        Err(Error::EngineDisconnected)
    })
    .await
    .map_err(|_| Error::EngineTimeout("uciok".to_string()))??;

    println!("{:?}", config);
    base.quit().await?;
    Ok(config)
}
