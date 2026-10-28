use std::{
    collections::HashMap,
    fs::File,
    io::{BufRead, BufReader, Cursor, Read, Write},
    path::{Path, PathBuf},
    sync::Arc,
    time::Instant,
};

use chrono::{SecondsFormat, Utc};
use dashmap::DashMap;
use log::{error, info};
use pgn_reader::{BufferedReader, RawHeader, Skip, Visitor};
use polyglot_book_rs::PolyglotBook;
use rand::{rngs::StdRng, seq::IteratorRandom, Rng, SeedableRng};
use serde::{Deserialize, Serialize};
use shakmaty::{
    fen::Fen, san::SanPlus, uci::UciMove, CastlingMode, Chess, Color, EnPassantMode, Position,
};
use specta::Type;
use tauri::{AppHandle, Manager};
use tauri_specta::Event;
use tokio::{
    sync::{watch, Mutex, RwLock},
    time::{interval, Duration},
};

use vampirc_uci::uci::ScoreValue;

use crate::{
    bot_candidates::policy_launch,
    bot_strength::strength_plan,
    bot_style::{choose_bot_move, BotPlayConfig},
    engine::{
        parse_fen_to_position, BaseEngine, EngineKillHandle, EngineLaunchMetadata, EngineLog,
        EngineOption, GoMode, PlayersTime,
    },
    error::Error,
};

pub type GameId = String;

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PlayerConfig {
    Human {
        name: String,
    },
    Engine {
        name: String,
        path: String,
        #[serde(default)]
        version: String,
        #[serde(default, rename = "presetCategory")]
        #[specta(rename = "presetCategory")]
        preset_category: PlayerPresetCategory,
        #[serde(default, rename = "targetElo")]
        #[specta(rename = "targetElo")]
        target_elo: Option<u32>,
        #[serde(default)]
        seed: Option<u32>,
        #[serde(default)]
        args: Vec<String>,
        #[serde(default)]
        options: Vec<EngineOption>,
        #[serde(default, rename = "openingRepertoire")]
        #[specta(rename = "openingRepertoire")]
        opening_repertoire: Option<OpeningRepertoireConfig>,
        #[serde(default, rename = "humanTiming")]
        #[specta(rename = "humanTiming")]
        human_timing: Option<HumanTimingConfig>,
        /// With 7 pieces or fewer, play the best tablebase defense instead of searching.
        #[serde(default, rename = "tablebaseDefense")]
        #[specta(rename = "tablebaseDefense")]
        tablebase_defense: Option<bool>,
        /// Styled human bot (Phase 9.1): Maia's candidates re-weighted by its play style.
        #[serde(default, rename = "botPlay")]
        #[specta(rename = "botPlay")]
        bot_play: Option<BotPlayConfig>,
        go: Option<GoMode>,
    },
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PlayerPresetCategory {
    #[default]
    Custom,
    HumanLike,
    Limited,
    Strong,
    Reference,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OpeningRepertoireConfig {
    pub id: String,
    #[serde(default = "default_repertoire_version")]
    pub version: u32,
    #[serde(default)]
    pub mode: OpeningRepertoireMode,
    #[serde(default = "default_repertoire_max_ply")]
    pub max_ply: u32,
    #[serde(default)]
    pub lines: Vec<WeightedOpeningLine>,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OpeningRepertoireMode {
    #[default]
    Weighted,
    ForcedLine,
    None,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OpeningLineSide {
    White,
    Black,
    #[default]
    Both,
}

fn default_repertoire_version() -> u32 {
    1
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WeightedOpeningLine {
    pub moves: Vec<String>,
    #[serde(default = "default_repertoire_line_weight")]
    pub weight: u16,
    #[serde(default)]
    pub side: OpeningLineSide,
}

fn default_repertoire_max_ply() -> u32 {
    16
}

fn default_repertoire_line_weight() -> u16 {
    1
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HumanTimingConfig {
    pub min_think_time_ms: u32,
    pub average_think_time_ms: u32,
    pub max_think_time_ms: u32,
    pub repertoire_time_percent: u16,
    /// The times were measured at the rhythm being played (a twin, I-43), so they are not
    /// scaled from blitz.
    #[serde(default)]
    pub fixed_rhythm: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TimeControl {
    pub initial_time: u64,
    pub increment: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GameConfig {
    pub white: PlayerConfig,
    pub black: PlayerConfig,
    pub white_time_control: Option<TimeControl>,
    pub black_time_control: Option<TimeControl>,
    pub initial_fen: Option<String>,
    #[serde(default)]
    pub initial_moves: Vec<String>,
    pub opening_book: Option<OpeningBookConfig>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OpeningBookConfig {
    pub path: String,
    #[serde(default = "default_opening_book_max_ply")]
    pub max_ply: usize,
}

fn default_opening_book_max_ply() -> usize {
    40
}

#[derive(Clone, Debug, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum GameStatus {
    Playing,
    Finished { result: GameResult },
}

#[derive(Clone, Debug, Serialize, Deserialize, Type, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum GameResult {
    WhiteWins { reason: GameEndReason },
    BlackWins { reason: GameEndReason },
    Draw { reason: DrawReason },
}

#[derive(Clone, Debug, Serialize, Deserialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum GameEndReason {
    Checkmate,
    Timeout,
    Resignation,
    Abandonment,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum DrawReason {
    Stalemate,
    InsufficientMaterial,
    ThreefoldRepetition,
    FiftyMoveRule,
    Agreement,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GameMove {
    pub uci: String,
    pub san: String,
    pub fen_after: String,
    pub clock: Option<u64>,
    pub white_time: Option<u64>,
    pub black_time: Option<u64>,
    pub color: String,
    pub source: GameMoveSource,
    pub think_time_ms: Option<u64>,
    /// Score of the engine's own search for this move, from White's point of view: the
    /// evaluation of the position the engine moved from, read at no extra cost.
    pub engine_eval: Option<ScoreValue>,
    /// Tablebase category of the position the engine moved from, for its side to move, when the
    /// move came from the tablebase.
    pub tablebase_category: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GameMoveSource {
    Human,
    Engine,
    ProfileRepertoire,
    Polyglot,
    Initial,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GameState {
    pub game_id: GameId,
    pub status: GameStatus,
    pub initial_fen: String,
    pub moves: Vec<GameMove>,
    pub current_fen: String,
    pub ply: u32,
    pub turn: String,
    pub white_time: Option<u64>,
    pub black_time: Option<u64>,
    pub white_player: String,
    pub black_player: String,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GameManifest {
    pub schema_version: u32,
    pub application_version: String,
    pub game_id: GameId,
    pub started_at: String,
    pub exported_at: String,
    pub hardware: ManifestHardware,
    pub initial_fen: String,
    pub initial_moves: Vec<String>,
    pub white: PlayerConfig,
    pub black: PlayerConfig,
    pub white_engine_launch: Option<EngineLaunchMetadata>,
    pub black_engine_launch: Option<EngineLaunchMetadata>,
    pub white_time_control: Option<TimeControl>,
    pub black_time_control: Option<TimeControl>,
    pub opening_book: Option<OpeningBookConfig>,
    pub status: GameStatus,
    pub result: Option<GameResult>,
    pub moves: Vec<GameMove>,
    pub current_fen: String,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ManifestHardware {
    pub operating_system: String,
    pub architecture: String,
    pub logical_cpus: usize,
}

#[derive(Clone, Debug, Serialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct GameMoveEvent {
    pub game_id: GameId,
    pub moves: Vec<GameMove>,
    pub fen: String,
    pub white_time: Option<u64>,
    pub black_time: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct ClockUpdateEvent {
    pub game_id: GameId,
    pub white_time: Option<u64>,
    pub black_time: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct GameOverEvent {
    pub game_id: GameId,
    pub result: GameResult,
    pub moves: Vec<GameMove>,
}

struct ClockState {
    white_time: Option<u64>,
    black_time: Option<u64>,
    white_increment: u64,
    black_increment: u64,
    last_tick: Instant,
}

/// What a styled bot adds to its engine: Maia launched through the policy wrapper and, when it has
/// a style, a verifier.
struct BotEngine {
    config: BotPlayConfig,
    verifier: Option<Arc<Mutex<BaseEngine>>>,
    verifier_kill: Option<EngineKillHandle>,
}

impl GameController {
    /// Kills every engine process of the game, the verifiers of styled bots included.
    fn kill_engines(&self) {
        for handle in [&self.white_engine_kill, &self.black_engine_kill]
            .into_iter()
            .flatten()
        {
            handle.kill_sync();
        }
        self.kill_verifiers();
    }

    fn kill_verifiers(&self) {
        for bot in [&self.white_bot, &self.black_bot].into_iter().flatten() {
            if let Some(handle) = &bot.verifier_kill {
                handle.kill_sync();
            }
        }
    }
}

struct GameController {
    game_id: GameId,
    config: GameConfig,
    initial_fen: String,
    moves: Vec<GameMove>,
    position: Chess,
    position_history: HashMap<String, u32>,
    status: GameStatus,
    clock: Option<ClockState>,
    white_engine: Option<Arc<Mutex<BaseEngine>>>,
    black_engine: Option<Arc<Mutex<BaseEngine>>>,
    white_engine_kill: Option<EngineKillHandle>,
    black_engine_kill: Option<EngineKillHandle>,
    white_engine_launch: Option<EngineLaunchMetadata>,
    black_engine_launch: Option<EngineLaunchMetadata>,
    /// Styled bots: whether Maia prints its policy, and the Stockfish that checks the candidates.
    white_bot: Option<BotEngine>,
    black_bot: Option<BotEngine>,
    started_at: String,
    shutdown_tx: Option<watch::Sender<bool>>,
    move_notify_tx: Option<tokio::sync::mpsc::Sender<()>>,
    engine_thinking: bool,
    polyglot_book: Option<PolyglotBook>,
    polyglot_max_ply: usize,
}

impl GameController {
    fn new(game_id: GameId, config: GameConfig) -> Result<Self, Error> {
        let initial_fen = config.initial_fen.clone().unwrap_or_else(|| {
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".to_string()
        });

        let position = parse_fen_to_position(&initial_fen)?;

        let clock = if config.white_time_control.is_some() || config.black_time_control.is_some() {
            Some(ClockState {
                white_time: config.white_time_control.as_ref().map(|tc| tc.initial_time),
                black_time: config.black_time_control.as_ref().map(|tc| tc.initial_time),
                white_increment: config
                    .white_time_control
                    .as_ref()
                    .map(|tc| tc.increment)
                    .unwrap_or(0),
                black_increment: config
                    .black_time_control
                    .as_ref()
                    .map(|tc| tc.increment)
                    .unwrap_or(0),
                last_tick: Instant::now(),
            })
        } else {
            None
        };

        let mut position_history = HashMap::new();
        let initial_key = Self::position_key(&position);
        position_history.insert(initial_key, 1);

        let initial_moves = config.initial_moves.clone();

        let mut controller = Self {
            game_id,
            config,
            initial_fen,
            moves: Vec::new(),
            position,
            position_history,
            status: GameStatus::Playing,
            clock,
            white_engine: None,
            black_engine: None,
            white_engine_kill: None,
            black_engine_kill: None,
            white_engine_launch: None,
            black_engine_launch: None,
            white_bot: None,
            black_bot: None,
            started_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
            shutdown_tx: None,
            move_notify_tx: None,
            engine_thinking: false,
            polyglot_book: None,
            polyglot_max_ply: 0,
        };

        for uci_str in &initial_moves {
            controller.apply_move_no_clock(uci_str)?;
        }

        Ok(controller)
    }

    fn get_state(&self) -> GameState {
        let turn = if self.position.turn() == Color::White {
            "white"
        } else {
            "black"
        };

        let (white_time, black_time) = self.get_current_times();

        let white_player = match &self.config.white {
            PlayerConfig::Human { name } => name.clone(),
            PlayerConfig::Engine { name, .. } => name.clone(),
        };

        let black_player = match &self.config.black {
            PlayerConfig::Human { name } => name.clone(),
            PlayerConfig::Engine { name, .. } => name.clone(),
        };

        GameState {
            game_id: self.game_id.clone(),
            status: self.status.clone(),
            initial_fen: self.initial_fen.clone(),
            moves: self.moves.clone(),
            current_fen: Fen::from_position(self.position.clone(), EnPassantMode::Legal)
                .to_string(),
            ply: self.moves.len() as u32,
            turn: turn.to_string(),
            white_time,
            black_time,
            white_player,
            black_player,
        }
    }

    fn get_manifest(&self) -> GameManifest {
        let result = match &self.status {
            GameStatus::Playing => None,
            GameStatus::Finished { result } => Some(result.clone()),
        };

        GameManifest {
            schema_version: 1,
            application_version: env!("CARGO_PKG_VERSION").to_string(),
            game_id: self.game_id.clone(),
            started_at: self.started_at.clone(),
            exported_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
            hardware: ManifestHardware {
                operating_system: std::env::consts::OS.to_string(),
                architecture: std::env::consts::ARCH.to_string(),
                logical_cpus: std::thread::available_parallelism()
                    .map(|value| value.get())
                    .unwrap_or(1),
            },
            initial_fen: self.initial_fen.clone(),
            initial_moves: self.config.initial_moves.clone(),
            white: self.config.white.clone(),
            black: self.config.black.clone(),
            white_engine_launch: self.white_engine_launch.clone(),
            black_engine_launch: self.black_engine_launch.clone(),
            white_time_control: self.config.white_time_control.clone(),
            black_time_control: self.config.black_time_control.clone(),
            opening_book: self.config.opening_book.clone(),
            status: self.status.clone(),
            result,
            moves: self.moves.clone(),
            current_fen: Fen::from_position(self.position.clone(), EnPassantMode::Legal)
                .to_string(),
        }
    }

    fn position_key(position: &Chess) -> String {
        let fen = Fen::from_position(position.clone(), EnPassantMode::Legal).to_string();
        fen.split_whitespace().take(4).collect::<Vec<_>>().join(" ")
    }

    fn current_turn_player(&self) -> &PlayerConfig {
        if self.position.turn() == Color::White {
            &self.config.white
        } else {
            &self.config.black
        }
    }

    fn is_engine_turn(&self) -> bool {
        matches!(self.current_turn_player(), PlayerConfig::Engine { .. })
    }

    fn apply_move(
        &mut self,
        uci_str: &str,
        source: GameMoveSource,
        think_time_ms: Option<u64>,
    ) -> Result<GameMove, Error> {
        if self.status != GameStatus::Playing {
            return Err(Error::GameNotInProgress);
        }

        let color = if self.position.turn() == Color::White {
            "white"
        } else {
            "black"
        };
        let uci = UciMove::from_ascii(uci_str.as_bytes())?;
        let mv = uci.to_move(&self.position)?;

        let san = SanPlus::from_move_and_play_unchecked(&mut self.position.clone(), &mv);

        let clock = self.clock.as_ref().and_then(|c| {
            if self.position.turn() == Color::White {
                c.white_time
            } else {
                c.black_time
            }
        });

        self.position.play_unchecked(&mv);

        let pos_key = Self::position_key(&self.position);
        *self.position_history.entry(pos_key).or_insert(0) += 1;

        if let Some(ref mut clock_state) = self.clock {
            let elapsed = clock_state.last_tick.elapsed().as_millis() as u64;

            if self.position.turn() == Color::Black {
                if let Some(ref mut wt) = clock_state.white_time {
                    *wt = wt.saturating_sub(elapsed);
                    *wt += clock_state.white_increment;
                }
            } else if let Some(ref mut bt) = clock_state.black_time {
                *bt = bt.saturating_sub(elapsed);
                *bt += clock_state.black_increment;
            }

            clock_state.last_tick = Instant::now();
        }

        let (white_time, black_time) = self
            .clock
            .as_ref()
            .map(|c| (c.white_time, c.black_time))
            .unwrap_or((None, None));

        let fen_after = Fen::from_position(self.position.clone(), EnPassantMode::Legal).to_string();

        let game_move = GameMove {
            uci: uci_str.to_string(),
            san: san.to_string(),
            fen_after,
            clock,
            white_time,
            black_time,
            color: color.to_string(),
            source,
            think_time_ms,
            engine_eval: None,
            tablebase_category: None,
        };

        self.moves.push(game_move.clone());
        self.check_game_end();

        Ok(game_move)
    }

    fn apply_move_no_clock(&mut self, uci_str: &str) -> Result<GameMove, Error> {
        let color = if self.position.turn() == Color::White {
            "white"
        } else {
            "black"
        };
        let uci = UciMove::from_ascii(uci_str.as_bytes())?;
        let mv = uci.to_move(&self.position)?;

        let san = SanPlus::from_move_and_play_unchecked(&mut self.position.clone(), &mv);

        self.position.play_unchecked(&mv);

        let pos_key = Self::position_key(&self.position);
        *self.position_history.entry(pos_key).or_insert(0) += 1;

        let (white_time, black_time) = self
            .clock
            .as_ref()
            .map(|c| (c.white_time, c.black_time))
            .unwrap_or((None, None));

        let fen_after = Fen::from_position(self.position.clone(), EnPassantMode::Legal).to_string();

        let game_move = GameMove {
            uci: uci_str.to_string(),
            san: san.to_string(),
            fen_after,
            clock: None,
            white_time,
            black_time,
            color: color.to_string(),
            source: GameMoveSource::Initial,
            think_time_ms: None,
            engine_eval: None,
            tablebase_category: None,
        };

        self.moves.push(game_move.clone());
        self.check_game_end();

        Ok(game_move)
    }

    fn rebuild_position_from_moves(&mut self) -> Result<(), Error> {
        self.position = parse_fen_to_position(&self.initial_fen)?;

        self.position_history.clear();
        let initial_key = Self::position_key(&self.position);
        self.position_history.insert(initial_key, 1);

        for m in &self.moves {
            let uci = UciMove::from_ascii(m.uci.as_bytes())?;
            let mv = uci.to_move(&self.position)?;
            self.position.play_unchecked(&mv);
            let pos_key = Self::position_key(&self.position);
            *self.position_history.entry(pos_key).or_insert(0) += 1;
        }

        if let Some(ref mut clock) = self.clock {
            clock.white_time = self
                .config
                .white_time_control
                .as_ref()
                .map(|tc| tc.initial_time);
            clock.black_time = self
                .config
                .black_time_control
                .as_ref()
                .map(|tc| tc.initial_time);

            if let Some(last_move) = self.moves.last() {
                if last_move.white_time.is_some() || last_move.black_time.is_some() {
                    clock.white_time = last_move.white_time;
                    clock.black_time = last_move.black_time;
                }
            }

            clock.last_tick = Instant::now();
        }

        Ok(())
    }

    fn check_game_end(&mut self) {
        if self.position.is_checkmate() {
            let result = if self.position.turn() == Color::White {
                GameResult::BlackWins {
                    reason: GameEndReason::Checkmate,
                }
            } else {
                GameResult::WhiteWins {
                    reason: GameEndReason::Checkmate,
                }
            };
            self.status = GameStatus::Finished { result };
            return;
        }

        if self.position.is_stalemate() {
            self.status = GameStatus::Finished {
                result: GameResult::Draw {
                    reason: DrawReason::Stalemate,
                },
            };
            return;
        }

        if self.position.is_insufficient_material() {
            self.status = GameStatus::Finished {
                result: GameResult::Draw {
                    reason: DrawReason::InsufficientMaterial,
                },
            };
            return;
        }

        if self.position.halfmoves() >= 100 {
            self.status = GameStatus::Finished {
                result: GameResult::Draw {
                    reason: DrawReason::FiftyMoveRule,
                },
            };
            return;
        }

        let pos_key = Self::position_key(&self.position);
        if let Some(&count) = self.position_history.get(&pos_key) {
            if count >= 3 {
                self.status = GameStatus::Finished {
                    result: GameResult::Draw {
                        reason: DrawReason::ThreefoldRepetition,
                    },
                };
            }
        }
    }

    fn check_timeout(&mut self) -> Option<GameResult> {
        if let Some(ref clock) = self.clock {
            let elapsed = clock.last_tick.elapsed().as_millis() as u64;

            if self.position.turn() == Color::White {
                if let Some(wt) = clock.white_time {
                    if wt.saturating_sub(elapsed) == 0 {
                        return Some(GameResult::BlackWins {
                            reason: GameEndReason::Timeout,
                        });
                    }
                }
            } else if let Some(bt) = clock.black_time {
                if bt.saturating_sub(elapsed) == 0 {
                    return Some(GameResult::WhiteWins {
                        reason: GameEndReason::Timeout,
                    });
                }
            }
        }
        None
    }

    fn get_current_times(&self) -> (Option<u64>, Option<u64>) {
        if let Some(ref clock) = self.clock {
            let elapsed = clock.last_tick.elapsed().as_millis() as u64;

            let white_time = if self.position.turn() == Color::White {
                clock.white_time.map(|t| t.saturating_sub(elapsed))
            } else {
                clock.white_time
            };

            let black_time = if self.position.turn() == Color::Black {
                clock.black_time.map(|t| t.saturating_sub(elapsed))
            } else {
                clock.black_time
            };

            (white_time, black_time)
        } else {
            (None, None)
        }
    }

    fn end_game(&mut self, result: GameResult) {
        self.status = GameStatus::Finished { result };
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(true);
        }
    }

    fn reset_clock(&mut self) {
        if let Some(ref mut clock) = self.clock {
            clock.last_tick = Instant::now();
        }
    }
}

pub struct GameManager {
    games: DashMap<GameId, Arc<RwLock<GameController>>>,
}

impl GameManager {
    pub fn new() -> Self {
        Self {
            games: DashMap::new(),
        }
    }

    pub async fn start_game(
        &self,
        game_id: GameId,
        config: GameConfig,
        app: AppHandle,
    ) -> Result<GameState, Error> {
        if let Some((_, old_game)) = self.games.remove(&game_id) {
            let mut game = old_game.write().await;
            if let Some(tx) = game.shutdown_tx.take() {
                let _ = tx.send(true);
            }
            game.kill_engines();
        }

        let OpeningBookResult {
            mut config,
            polyglot_book,
            polyglot_max_ply,
        } = apply_opening_book(config)?;
        let castling_mode = CastlingMode::detect(
            config
                .clone()
                .initial_fen
                .unwrap_or_default()
                .parse::<Fen>()
                .unwrap_or_default()
                .as_setup(),
        );
        normalize_game_engine_options(&mut config.white, castling_mode.is_chess960());
        normalize_game_engine_options(&mut config.black, castling_mode.is_chess960());
        normalize_lc0_go_mode(&mut config.white);
        normalize_lc0_go_mode(&mut config.black);

        let mut controller = GameController::new(game_id.clone(), config.clone())?;
        controller.polyglot_book = polyglot_book;
        controller.polyglot_max_ply = polyglot_max_ply;

        let scripts_dir = app.path().app_data_dir()?.join("scripts");
        if let Some(spawned) =
            spawn_player_engine(&config.white, castling_mode, &scripts_dir).await?
        {
            controller.white_engine_launch = Some(spawned.engine.launch_metadata());
            controller.white_engine_kill = Some(spawned.engine.kill_handle());
            controller.white_engine = Some(Arc::new(Mutex::new(spawned.engine)));
            controller.white_bot = spawned.bot;
        }
        if let Some(spawned) =
            spawn_player_engine(&config.black, castling_mode, &scripts_dir).await?
        {
            controller.black_engine_launch = Some(spawned.engine.launch_metadata());
            controller.black_engine_kill = Some(spawned.engine.kill_handle());
            controller.black_engine = Some(Arc::new(Mutex::new(spawned.engine)));
            controller.black_bot = spawned.bot;
        }

        controller.reset_clock();

        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        controller.shutdown_tx = Some(shutdown_tx);

        let (move_notify_tx, move_notify_rx) = tokio::sync::mpsc::channel(1);
        controller.move_notify_tx = Some(move_notify_tx);

        let state = controller.get_state();
        let controller = Arc::new(RwLock::new(controller));
        self.games.insert(game_id.clone(), controller.clone());

        tokio::spawn(game_loop(
            game_id,
            controller,
            shutdown_rx,
            move_notify_rx,
            app,
        ));

        Ok(state)
    }

    pub async fn get_game_state(&self, game_id: &str) -> Result<GameState, Error> {
        let game = self
            .games
            .get(game_id)
            .ok_or_else(|| Error::GameNotFound(game_id.to_string()))?;
        let controller = game.read().await;
        Ok(controller.get_state())
    }

    pub async fn get_game_manifest(&self, game_id: &str) -> Result<GameManifest, Error> {
        let game = self
            .games
            .get(game_id)
            .ok_or_else(|| Error::GameNotFound(game_id.to_string()))?;
        let controller = game.read().await;
        Ok(controller.get_manifest())
    }

    pub async fn make_move(
        &self,
        game_id: &str,
        uci: &str,
        app: &AppHandle,
    ) -> Result<GameState, Error> {
        let game = self
            .games
            .get(game_id)
            .ok_or_else(|| Error::GameNotFound(game_id.to_string()))?;

        let mut controller = game.write().await;

        if controller.is_engine_turn() {
            return Err(Error::NotHumanTurn);
        }

        let game_move = controller.apply_move(uci, GameMoveSource::Human, None)?;
        let (white_time, black_time) = controller.get_current_times();

        GameMoveEvent {
            game_id: game_id.to_string(),
            moves: controller.moves.clone(),
            fen: game_move.fen_after,
            white_time,
            black_time,
        }
        .emit(app)?;

        if let GameStatus::Finished { result } = &controller.status {
            GameOverEvent {
                game_id: game_id.to_string(),
                result: result.clone(),
                moves: controller.moves.clone(),
            }
            .emit(app)?;
        } else if let Some(tx) = &controller.move_notify_tx {
            let _ = tx.try_send(());
        }

        Ok(controller.get_state())
    }

    pub async fn take_back_move(&self, game_id: &str, app: &AppHandle) -> Result<GameState, Error> {
        let game = self
            .games
            .get(game_id)
            .ok_or_else(|| Error::GameNotFound(game_id.to_string()))?;

        let mut controller = game.write().await;

        if controller.moves.is_empty() {
            return Err(Error::NoMovesFound);
        }

        let human_color = match (&controller.config.white, &controller.config.black) {
            (PlayerConfig::Human { .. }, PlayerConfig::Engine { .. }) => Some(Color::White),
            (PlayerConfig::Engine { .. }, PlayerConfig::Human { .. }) => Some(Color::Black),
            _ => None,
        };

        let should_pop_two = human_color
            .map(|c| controller.position.turn() == c)
            .unwrap_or(false);

        controller.moves.pop();
        if should_pop_two {
            controller.moves.pop();
        }
        controller.status = GameStatus::Playing;
        controller.engine_thinking = false;

        controller.rebuild_position_from_moves()?;
        controller.check_game_end();

        let (white_time, black_time) = controller.get_current_times();
        let fen = Fen::from_position(controller.position.clone(), EnPassantMode::Legal).to_string();

        GameMoveEvent {
            game_id: game_id.to_string(),
            moves: controller.moves.clone(),
            fen,
            white_time,
            black_time,
        }
        .emit(app)?;

        if let GameStatus::Finished { result } = &controller.status {
            GameOverEvent {
                game_id: game_id.to_string(),
                result: result.clone(),
                moves: controller.moves.clone(),
            }
            .emit(app)?;
        } else if controller.is_engine_turn() {
            if let Some(tx) = &controller.move_notify_tx {
                let _ = tx.try_send(());
            }
        }

        Ok(controller.get_state())
    }

    /// Takes the game back to the position after its first `ply` moves, never before the moves it
    /// started with, so a student can retry from an earlier position without a new game.
    pub async fn rewind_to(
        &self,
        game_id: &str,
        ply: usize,
        app: &AppHandle,
    ) -> Result<GameState, Error> {
        let game = self
            .games
            .get(game_id)
            .ok_or_else(|| Error::GameNotFound(game_id.to_string()))?;

        let mut controller = game.write().await;
        if controller.status != GameStatus::Playing {
            return Err(Error::GameNotInProgress);
        }

        let initial = controller
            .moves
            .iter()
            .take_while(|m| m.source == GameMoveSource::Initial)
            .count();
        let target = ply.clamp(initial, controller.moves.len());
        controller.moves.truncate(target);
        controller.engine_thinking = false;

        controller.rebuild_position_from_moves()?;
        controller.check_game_end();

        let (white_time, black_time) = controller.get_current_times();
        let fen = Fen::from_position(controller.position.clone(), EnPassantMode::Legal).to_string();

        GameMoveEvent {
            game_id: game_id.to_string(),
            moves: controller.moves.clone(),
            fen,
            white_time,
            black_time,
        }
        .emit(app)?;

        if controller.status == GameStatus::Playing && controller.is_engine_turn() {
            if let Some(tx) = &controller.move_notify_tx {
                let _ = tx.try_send(());
            }
        }

        Ok(controller.get_state())
    }

    pub async fn resign(
        &self,
        game_id: &str,
        color: &str,
        app: &AppHandle,
    ) -> Result<GameState, Error> {
        let game = self
            .games
            .get(game_id)
            .ok_or_else(|| Error::GameNotFound(game_id.to_string()))?;

        let mut controller = game.write().await;

        let result = match color {
            "white" => GameResult::BlackWins {
                reason: GameEndReason::Resignation,
            },
            "black" => GameResult::WhiteWins {
                reason: GameEndReason::Resignation,
            },
            _ => return Err(Error::InvalidColor(color.to_string())),
        };

        controller.end_game(result.clone());

        GameOverEvent {
            game_id: game_id.to_string(),
            result,
            moves: controller.moves.clone(),
        }
        .emit(app)?;

        Ok(controller.get_state())
    }

    pub async fn abort_game(&self, game_id: &str) -> Result<(), Error> {
        if let Some((_, game)) = self.games.remove(game_id) {
            let mut controller = game.write().await;
            if let Some(tx) = controller.shutdown_tx.take() {
                let _ = tx.send(true);
            }
            controller.kill_engines();
        }
        Ok(())
    }

    /// Bot engines thinking right now, for the engine budget. A game being updated counts as idle.
    pub fn thinking_engines(&self) -> u32 {
        self.games
            .iter()
            .filter(|game| {
                game.value().try_read().is_ok_and(|controller| {
                    controller.engine_thinking && matches!(controller.status, GameStatus::Playing)
                })
            })
            .count() as u32
    }

    pub fn kill_all_sync(&self) {
        for entry in self.games.iter() {
            if let Ok(controller) = entry.value().try_read() {
                if let Some(tx) = &controller.shutdown_tx {
                    let _ = tx.send(true);
                }
                controller.kill_engines();
            }
        }
    }

    pub async fn get_engine_logs(
        &self,
        game_id: &str,
        color: &str,
    ) -> Result<Vec<EngineLog>, Error> {
        let game = self
            .games
            .get(game_id)
            .ok_or_else(|| Error::GameNotFound(game_id.to_string()))?;

        let controller = game.read().await;

        let engine = match color {
            "white" => &controller.white_engine,
            "black" => &controller.black_engine,
            _ => return Err(Error::InvalidColor(color.to_string())),
        };

        if let Some(engine_arc) = engine {
            let engine = engine_arc.lock().await;
            Ok(engine.get_logs())
        } else {
            Ok(Vec::new())
        }
    }

    pub async fn try_get_engine_logs(
        &self,
        game_id: &str,
        color: &str,
    ) -> Result<Vec<EngineLog>, Error> {
        let game = self
            .games
            .get(game_id)
            .ok_or_else(|| Error::GameNotFound(game_id.to_string()))?;
        let controller = game.read().await;
        let engine = match color {
            "white" => &controller.white_engine,
            "black" => &controller.black_engine,
            _ => return Err(Error::InvalidColor(color.to_string())),
        };
        let Some(engine) = engine else {
            return Ok(Vec::new());
        };
        let Ok(engine) = engine.try_lock() else {
            return Ok(Vec::new());
        };
        Ok(engine.get_logs())
    }
}

struct SpawnedEngine {
    engine: BaseEngine,
    bot: Option<BotEngine>,
}

/// Starts the engine of a player. A styled bot runs Maia through the policy wrapper and gets a
/// verifier; if Maia cannot be wrapped or the verifier fails to start, the bot
/// plays as a plain Maia.
async fn spawn_player_engine(
    player: &PlayerConfig,
    castling_mode: CastlingMode,
    scripts_dir: &Path,
) -> Result<Option<SpawnedEngine>, Error> {
    let PlayerConfig::Engine {
        path,
        args,
        options,
        seed,
        bot_play,
        ..
    } = player
    else {
        return Ok(None);
    };
    let wrapped = match bot_play {
        Some(_) => policy_launch(Path::new(path), args, scripts_dir)?,
        None => None,
    };
    let styled = wrapped.is_some();
    let (program, launch_args) = wrapped.unwrap_or_else(|| (PathBuf::from(path), args.clone()));
    let mut engine = BaseEngine::spawn_with_seed(program, &launch_args, *seed).await?;
    engine.init_uci().await?;
    for opt in options {
        if opt.name == "UCI_Chess960" || opt.name == "MultiPV" {
            continue;
        }
        engine
            .set_option_if_supported(&opt.name, &opt.value)
            .await?;
    }
    engine
        .set_option_if_supported(
            "UCI_Chess960",
            if castling_mode.is_chess960() {
                "true"
            } else {
                "false"
            },
        )
        .await?;
    engine.set_option_if_supported("MultiPV", "1").await?;
    if let (Some(config), true) = (bot_play, styled) {
        // Above Maia's range, or with the strength filter, Maia is asked for less (I-48).
        engine
            .set_option_if_supported("SelfElo", strength_plan(config.elo).maia_elo)
            .await?;
    }
    engine.new_game().await?;

    let bot = match bot_play {
        Some(config) if styled => {
            let verifier = match &config.verifier_path {
                // Also without style: the verification marks the critical moves.
                Some(verifier_path) => {
                    match spawn_verifier(verifier_path, &config.verifier_args).await {
                        Ok(verifier) => Some(verifier),
                        Err(err) => {
                            error!("Bot verifier did not start, playing without style: {err}");
                            None
                        }
                    }
                }
                _ => None,
            };
            Some(BotEngine {
                config: config.clone(),
                verifier_kill: verifier.as_ref().map(BaseEngine::kill_handle),
                verifier: verifier.map(|verifier| Arc::new(Mutex::new(verifier))),
            })
        }
        _ => None,
    };
    Ok(Some(SpawnedEngine { engine, bot }))
}

/// A small Stockfish: one thread and little hash are enough for 150 ms on a few candidates.
async fn spawn_verifier(path: &str, args: &[String]) -> Result<BaseEngine, Error> {
    let mut verifier = BaseEngine::spawn(PathBuf::from(path), args).await?;
    verifier.init_uci().await?;
    verifier.set_option_if_supported("Threads", 1).await?;
    verifier.set_option_if_supported("Hash", 32).await?;
    verifier.new_game().await?;
    Ok(verifier)
}

fn normalize_game_engine_options(player: &mut PlayerConfig, chess960: bool) {
    let PlayerConfig::Engine { options, .. } = player else {
        return;
    };

    upsert_engine_option(options, "MultiPV", "1");
    upsert_engine_option(
        options,
        "UCI_Chess960",
        if chess960 { "true" } else { "false" },
    );
}

fn normalize_lc0_go_mode(player: &mut PlayerConfig) {
    let PlayerConfig::Engine {
        name,
        path,
        args,
        go,
        ..
    } = player
    else {
        return;
    };

    let is_lc0 = [name.as_str(), path.as_str()]
        .into_iter()
        .chain(args.iter().map(String::as_str))
        .map(str::to_ascii_lowercase)
        .any(|value| value.contains("lc0") || value.contains("leela"));

    if is_lc0 && matches!(go, Some(GoMode::Depth(_))) {
        *go = Some(GoMode::Nodes(2_000));
    }
}

fn upsert_engine_option(options: &mut Vec<EngineOption>, name: &str, value: &str) {
    options.retain(|option| option.name != name);
    options.push(EngineOption {
        name: name.to_string(),
        value: value.to_string(),
    });
}

impl Default for GameManager {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Debug)]
struct OpeningBookSelection {
    initial_fen: String,
    initial_moves: Vec<String>,
}

struct OpeningBookResult {
    config: GameConfig,
    polyglot_book: Option<PolyglotBook>,
    polyglot_max_ply: usize,
}

fn select_random_epd_entry(reader: impl BufRead) -> Result<OpeningBookSelection, Error> {
    let mut rng = rand::thread_rng();

    let selected_line = reader
        .lines()
        .map_while(Result::ok)
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .choose(&mut rng)
        .ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Opening book EPD has no entries",
            )
        })?;

    Ok(OpeningBookSelection {
        initial_fen: selected_line,
        initial_moves: Vec::new(),
    })
}

struct OpeningBookPgnVisitor {
    selected: Option<OpeningBookSelection>,
    seen: usize,
    current_position: Chess,
    initial_position: Chess,
    castling_mode: CastlingMode,
    initial_fen: Option<String>,
    moves: Vec<String>,
    skip: bool,
}

impl OpeningBookPgnVisitor {
    fn new() -> Self {
        let start = Chess::default();
        Self {
            selected: None,
            seen: 0,
            current_position: start.clone(),
            initial_position: start,
            castling_mode: CastlingMode::Standard,
            initial_fen: None,
            moves: Vec::new(),
            skip: false,
        }
    }
}

impl Visitor for OpeningBookPgnVisitor {
    type Result = Option<OpeningBookSelection>;

    fn begin_game(&mut self) {
        let start = Chess::default();
        self.current_position = start.clone();
        self.initial_position = start;
        self.castling_mode = CastlingMode::Standard;
        self.initial_fen = None;
        self.moves.clear();
        self.skip = false;
    }

    fn header(&mut self, key: &[u8], value: RawHeader<'_>) {
        if key == b"FEN" {
            let fen_text = value.decode_utf8_lossy().into_owned();
            match parse_fen_to_position(&fen_text) {
                Ok(position) => {
                    let parsed_fen: Fen = match fen_text.parse() {
                        Ok(fen) => fen,
                        Err(_) => {
                            self.skip = true;
                            return;
                        }
                    };
                    self.current_position = position.clone();
                    self.initial_position = position;
                    self.castling_mode = CastlingMode::detect(parsed_fen.as_setup());
                    self.initial_fen = Some(fen_text);
                }
                Err(_) => {
                    self.skip = true;
                }
            }
        }
    }

    fn end_headers(&mut self) -> Skip {
        Skip(self.skip)
    }

    fn san(&mut self, san: SanPlus) {
        if self.skip {
            return;
        }

        let mv = match san.san.to_move(&self.current_position) {
            Ok(mv) => mv,
            Err(_) => {
                self.skip = true;
                return;
            }
        };

        let uci = UciMove::from_move(&mv, self.castling_mode).to_string();
        self.moves.push(uci);
        self.current_position.play_unchecked(&mv);
    }

    fn end_game(&mut self) -> Self::Result {
        if self.skip || self.moves.is_empty() {
            return None;
        }

        let initial_fen = self.initial_fen.clone().unwrap_or_else(|| {
            Fen::from_position(self.initial_position.clone(), EnPassantMode::Legal).to_string()
        });

        let candidate = OpeningBookSelection {
            initial_fen,
            initial_moves: self.moves.clone(),
        };

        self.seen += 1;
        let mut rng = rand::thread_rng();
        if rng.gen_range(0..self.seen) == 0 {
            self.selected = Some(candidate.clone());
        }

        Some(candidate)
    }
}

fn select_random_pgn_entry(input: impl Read) -> Result<OpeningBookSelection, Error> {
    let mut reader = BufferedReader::new(input);
    let mut visitor = OpeningBookPgnVisitor::new();

    while reader.read_game(&mut visitor)?.is_some() {}

    visitor.selected.ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "Opening book PGN has no valid games",
        )
        .into()
    })
}

fn read_zip_inner(path: &str) -> Result<(String, Vec<u8>), Error> {
    let file = File::open(path)?;
    let mut archive = zip::ZipArchive::new(BufReader::new(file))?;
    if archive.len() != 1 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "Opening book zip must contain exactly one file",
        )
        .into());
    }
    let mut inner = archive.by_index(0)?;
    let name = inner.name().to_string();
    let mut buf = Vec::new();
    inner.read_to_end(&mut buf)?;
    Ok((name, buf))
}

fn opening_book_ext(name: &str) -> Option<&str> {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".epd") {
        Some("epd")
    } else if lower.ends_with(".pgn") {
        Some("pgn")
    } else if lower.ends_with(".bin") {
        Some("bin")
    } else {
        None
    }
}

fn normalize_polyglot_uci(uci: &str) -> String {
    match uci {
        "e1h1" => "e1g1".to_string(),
        "e1a1" => "e1c1".to_string(),
        "e8h8" => "e8g8".to_string(),
        "e8a8" => "e8c8".to_string(),
        _ => uci.to_string(),
    }
}

fn choose_weighted_index(weights: &[u16], rng: &mut impl Rng) -> usize {
    let total: u64 = weights.iter().map(|w| *w as u64).sum();
    if total == 0 {
        return rng.gen_range(0..weights.len());
    }

    let mut target = rng.gen_range(0..total);
    for (index, weight) in weights.iter().enumerate() {
        let weight = *weight as u64;
        if target < weight {
            return index;
        }
        target -= weight;
    }

    weights.len().saturating_sub(1)
}

fn apply_opening_book(config: GameConfig) -> Result<OpeningBookResult, Error> {
    let Some(opening_book) = &config.opening_book else {
        return Ok(OpeningBookResult {
            config,
            polyglot_book: None,
            polyglot_max_ply: 0,
        });
    };

    let path = &opening_book.path;
    let max_ply = opening_book.max_ply.max(1);
    let ext = PathBuf::from(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());

    let is_human_vs_human = matches!(
        (&config.white, &config.black),
        (PlayerConfig::Human { .. }, PlayerConfig::Human { .. })
    );

    enum BookAction {
        Selection(OpeningBookSelection),
        Polyglot(PolyglotBook),
        Skip,
    }

    let action = match ext.as_deref() {
        Some("epd") => {
            BookAction::Selection(select_random_epd_entry(BufReader::new(File::open(path)?))?)
        }
        Some("pgn") => BookAction::Selection(select_random_pgn_entry(File::open(path)?)?),
        Some("bin") => {
            if is_human_vs_human {
                BookAction::Skip
            } else {
                BookAction::Polyglot(PolyglotBook::load(path)?)
            }
        }
        Some("zip") => {
            let (inner_name, data) = read_zip_inner(path)?;
            match opening_book_ext(&inner_name) {
                Some("epd") => BookAction::Selection(select_random_epd_entry(BufReader::new(
                    Cursor::new(data),
                ))?),
                Some("pgn") => BookAction::Selection(select_random_pgn_entry(Cursor::new(data))?),
                Some("bin") => {
                    if is_human_vs_human {
                        BookAction::Skip
                    } else {
                        let mut temp = tempfile::NamedTempFile::new()?;
                        temp.write_all(&data)?;
                        temp.flush()?;
                        let temp_path = temp.path().to_str().ok_or_else(|| {
                            std::io::Error::new(
                                std::io::ErrorKind::InvalidData,
                                "Temporary Polyglot book path is not valid UTF-8",
                            )
                        })?;
                        BookAction::Polyglot(PolyglotBook::load(temp_path)?)
                    }
                }
                _ => {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        "Zip must contain a .pgn, .epd, or .bin file",
                    )
                    .into())
                }
            }
        }
        _ => {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Unsupported opening book format. Use .pgn, .epd, .bin, or .zip",
            )
            .into())
        }
    };

    match action {
        BookAction::Selection(selection) => {
            let mut next = config;
            next.initial_fen = Some(selection.initial_fen);
            next.initial_moves = selection.initial_moves;
            Ok(OpeningBookResult {
                config: next,
                polyglot_book: None,
                polyglot_max_ply: 0,
            })
        }
        BookAction::Polyglot(book) => Ok(OpeningBookResult {
            config,
            polyglot_book: Some(book),
            polyglot_max_ply: max_ply,
        }),
        BookAction::Skip => Ok(OpeningBookResult {
            config,
            polyglot_book: None,
            polyglot_max_ply: 0,
        }),
    }
}

fn spawn_engine_task(
    game_id: &GameId,
    controller: &Arc<RwLock<GameController>>,
    app: &AppHandle,
) -> tokio::task::JoinHandle<Result<(), Error>> {
    let game_id_clone = game_id.clone();
    let controller_clone = controller.clone();
    let app_clone = app.clone();
    tokio::spawn(
        async move { request_engine_move(&game_id_clone, &controller_clone, &app_clone).await },
    )
}

async fn maybe_start_engine(
    controller: &Arc<RwLock<GameController>>,
    engine_task: &Option<tokio::task::JoinHandle<Result<(), Error>>>,
) -> bool {
    let mut ctrl = controller.write().await;
    if ctrl.status == GameStatus::Playing
        && ctrl.is_engine_turn()
        && !ctrl.engine_thinking
        && engine_task.is_none()
    {
        ctrl.engine_thinking = true;
        true
    } else {
        false
    }
}

async fn game_loop(
    game_id: GameId,
    controller: Arc<RwLock<GameController>>,
    mut shutdown_rx: watch::Receiver<bool>,
    mut move_notify_rx: tokio::sync::mpsc::Receiver<()>,
    app: AppHandle,
) {
    let mut clock_interval = interval(Duration::from_millis(100));
    let mut engine_task: Option<tokio::task::JoinHandle<Result<(), Error>>> = None;
    let mut force_kill_engines = false;

    if maybe_start_engine(&controller, &engine_task).await {
        engine_task = Some(spawn_engine_task(&game_id, &controller, &app));
    }

    loop {
        tokio::select! {
            biased;

            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    info!("Game {} shutting down", game_id);
                    force_kill_engines = true;
                    if let Some(task) = engine_task.take() {
                        task.abort();
                    }
                    break;
                }
            }

            result = async {
                if let Some(ref mut task) = engine_task {
                    Some(task.await)
                } else {
                    std::future::pending::<Option<Result<Result<(), Error>, tokio::task::JoinError>>>().await
                }
            } => {
                engine_task = None;

                match result {
                    Some(Ok(Ok(()))) => {
                        if maybe_start_engine(&controller, &engine_task).await {
                            engine_task = Some(spawn_engine_task(&game_id, &controller, &app));
                        }
                    }
                    Some(Ok(Err(e))) => {
                        error!("Engine move error: {:?}", e);
                        let mut ctrl = controller.write().await;
                        ctrl.engine_thinking = false;
                        let result = if ctrl.position.turn() == Color::White {
                            GameResult::BlackWins { reason: GameEndReason::Abandonment }
                        } else {
                            GameResult::WhiteWins { reason: GameEndReason::Abandonment }
                        };
                        ctrl.end_game(result.clone());
                        let _ = GameOverEvent { game_id: game_id.clone(), result, moves: ctrl.moves.clone() }.emit(&app);
                        break;
                    }
                    Some(Err(_join_error)) => {
                        let mut ctrl = controller.write().await;
                        ctrl.engine_thinking = false;
                        let result = if ctrl.position.turn() == Color::White {
                            GameResult::BlackWins { reason: GameEndReason::Abandonment }
                        } else {
                            GameResult::WhiteWins { reason: GameEndReason::Abandonment }
                        };
                        ctrl.end_game(result.clone());
                        let _ = GameOverEvent { game_id: game_id.clone(), result, moves: ctrl.moves.clone() }.emit(&app);
                        break;
                    }
                    None => unreachable!(),
                }
            }

            _ = move_notify_rx.recv() => {
                if engine_task.is_none() && maybe_start_engine(&controller, &engine_task).await {
                    engine_task = Some(spawn_engine_task(&game_id, &controller, &app));
                }
            }

            _ = clock_interval.tick() => {
                let is_finished;

                {
                    let mut ctrl = controller.write().await;

                    if ctrl.status != GameStatus::Playing {
                        break;
                    }

                    if let Some(result) = ctrl.check_timeout() {
                        ctrl.end_game(result.clone());
                        let _ = GameOverEvent { game_id: game_id.clone(), result, moves: ctrl.moves.clone() }.emit(&app);
                        break;
                    }

                    let (white_time, black_time) = ctrl.get_current_times();
                    let _ = ClockUpdateEvent {
                        game_id: game_id.clone(),
                        white_time,
                        black_time,
                    }.emit(&app);

                    is_finished = ctrl.status != GameStatus::Playing;
                }

                if is_finished {
                    break;
                }
            }
        }
    }

    if let Some(task) = engine_task.take() {
        task.abort();
    }

    {
        let ctrl = controller.read().await;
        if force_kill_engines {
            ctrl.kill_engines();
        } else {
            if let Some(engine) = &ctrl.white_engine {
                let mut proc = engine.lock().await;
                let _ = proc.quit().await;
            }
            if let Some(engine) = &ctrl.black_engine {
                let mut proc = engine.lock().await;
                let _ = proc.quit().await;
            }
            // A verifier never holds anything worth a clean exit.
            ctrl.kill_verifiers();
        }
    }

    info!("Game loop ended for {}", game_id);
}

fn try_polyglot_book_move(controller: &GameController) -> Option<String> {
    let book = controller.polyglot_book.as_ref()?;

    if controller.moves.len() >= controller.polyglot_max_ply {
        return None;
    }

    let fen = Fen::from_position(controller.position.clone(), EnPassantMode::Legal).to_string();
    let entries = book.get_all_moves_from_fen(&fen);

    if entries.is_empty() {
        return None;
    }

    let mut rng = rand::thread_rng();
    let legal_moves = entries
        .into_iter()
        .filter_map(|entry| {
            let uci = normalize_polyglot_uci(&entry.move_string);
            let parsed = UciMove::from_ascii(uci.as_bytes()).ok()?;
            parsed.to_move(&controller.position).ok()?;
            Some((uci, entry.weight))
        })
        .collect::<Vec<_>>();

    if legal_moves.is_empty() {
        return None;
    }

    let weights = legal_moves.iter().map(|(_, w)| *w).collect::<Vec<_>>();
    let selected = choose_weighted_index(&weights, &mut rng);
    Some(legal_moves[selected].0.clone())
}

fn select_repertoire_move(
    repertoire: &OpeningRepertoireConfig,
    played_moves: &[String],
    position: &Chess,
    rng: &mut impl Rng,
) -> Option<String> {
    if repertoire.mode == OpeningRepertoireMode::None {
        return None;
    }

    if played_moves.len() as u32 >= repertoire.max_ply {
        return None;
    }

    let legal_moves = repertoire
        .lines
        .iter()
        .filter(|line| {
            let side_matches = match line.side {
                OpeningLineSide::White => position.turn() == Color::White,
                OpeningLineSide::Black => position.turn() == Color::Black,
                OpeningLineSide::Both => true,
            };
            side_matches
                && line.moves.len() > played_moves.len()
                && line
                    .moves
                    .iter()
                    .zip(played_moves)
                    // A castle may arrive as king-takes-rook ("e1h1") from the board.
                    .all(|(expected, played)| {
                        normalize_polyglot_uci(expected) == normalize_polyglot_uci(played)
                    })
        })
        .filter_map(|line| {
            let uci = line.moves.get(played_moves.len())?;
            let parsed = UciMove::from_ascii(uci.as_bytes()).ok()?;
            parsed.to_move(position).ok()?;
            Some((uci.clone(), line.weight))
        })
        .collect::<Vec<_>>();

    if legal_moves.is_empty() {
        return None;
    }

    let weights = legal_moves
        .iter()
        .map(|(_, weight)| *weight)
        .collect::<Vec<_>>();
    let selected = choose_weighted_index(&weights, rng);
    Some(legal_moves[selected].0.clone())
}

fn try_profile_repertoire_move(controller: &GameController) -> Option<(String, String)> {
    const INITIAL_POSITION_FEN: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    if controller.initial_fen != INITIAL_POSITION_FEN {
        return None;
    }

    let repertoire = match controller.current_turn_player() {
        PlayerConfig::Engine {
            opening_repertoire: Some(repertoire),
            ..
        } => repertoire,
        _ => return None,
    };
    let played_moves = controller
        .moves
        .iter()
        .map(|game_move| game_move.uci.clone())
        .collect::<Vec<_>>();
    let mut rng = rand::thread_rng();
    let selected =
        select_repertoire_move(repertoire, &played_moves, &controller.position, &mut rng)?;

    Some((selected, repertoire.id.clone()))
}

enum EngineBookMove {
    Profile { uci: String, repertoire_id: String },
    Polyglot { uci: String },
}

impl EngineBookMove {
    fn uci(&self) -> &str {
        match self {
            Self::Profile { uci, .. } | Self::Polyglot { uci } => uci,
        }
    }

    fn log_message(&self) -> String {
        match self {
            Self::Profile { uci, repertoire_id } => {
                format!("profile repertoire {}: {}", repertoire_id, uci)
            }
            Self::Polyglot { uci } => format!("polyglot opening book: {}", uci),
        }
    }

    fn source(&self) -> GameMoveSource {
        match self {
            Self::Profile { .. } => GameMoveSource::ProfileRepertoire,
            Self::Polyglot { .. } => GameMoveSource::Polyglot,
        }
    }
}

/// What changes how long a human bot thinks about one move.
#[derive(Clone, Copy, Debug)]
struct ThinkContext {
    source: GameMoveSource,
    legal_move_count: usize,
    in_check: bool,
    ply: usize,
    remaining_time_ms: Option<u64>,
    increment_ms: u64,
    /// The bot's initial clock: with the increment it sets the rhythm.
    initial_time_ms: Option<u64>,
    /// First move of its own after leaving its repertoire or the book.
    out_of_book: bool,
    /// Only one candidate keeps the evaluation, according to the verification.
    critical: bool,
    /// Takes back on the square where the opponent just captured.
    recapture: bool,
}

/// How much longer than in blitz a bot thinks at this rhythm, with the Lichess estimate of a
/// game's duration (base + 40 × increment): bullet 0.6, blitz 1, rapid 1.6, classical 2.5.
/// Without a clock it thinks as in blitz.
fn rhythm_factor(initial_time_ms: Option<u64>, increment_ms: u64) -> f64 {
    let Some(initial) = initial_time_ms else {
        return 1.0;
    };
    let estimated_seconds = (initial + 40 * increment_ms) / 1000;
    match estimated_seconds {
        0..180 => 0.6,
        180..480 => 1.0,
        480..1500 => 1.6,
        _ => 2.5,
    }
}

fn calculate_human_think_time(
    config: &HumanTimingConfig,
    context: ThinkContext,
    rng: &mut impl Rng,
) -> u64 {
    let rhythm = if config.fixed_rhythm {
        1.0
    } else {
        rhythm_factor(context.initial_time_ms, context.increment_ms)
    };
    let scale = |ms: u32| (f64::from(ms) * rhythm) as u64;
    let min_time = scale(config.min_think_time_ms.min(config.max_think_time_ms));
    let max_time = scale(config.max_think_time_ms.max(config.min_think_time_ms));
    let average_time = scale(config.average_think_time_ms).clamp(min_time, max_time);
    let jitter_percent = rng.gen_range(70_u64..=130);
    let mut target = average_time.saturating_mul(jitter_percent) / 100;

    if context.ply < 10 {
        target = target.saturating_mul(80) / 100;
    }
    if context.in_check || context.legal_move_count <= 8 {
        target = target.saturating_mul(70) / 100;
    } else if context.legal_move_count >= 30 {
        target = target.saturating_mul(120) / 100;
    }

    if matches!(
        context.source,
        GameMoveSource::ProfileRepertoire | GameMoveSource::Polyglot
    ) {
        target = target.saturating_mul(u64::from(config.repertoire_time_percent)) / 100;
    } else if context.recapture {
        target /= 2;
    } else if context.out_of_book {
        // Leaving known ground is where a human stops to think the longest.
        target = target.saturating_mul(2);
    } else if context.critical {
        target = target.saturating_mul(150) / 100;
    } else if rng.gen_ratio(1, 10) {
        target = target.saturating_mul(160) / 100;
    }

    target = target.clamp(min_time, max_time);

    if let Some(remaining) = context.remaining_time_ms {
        if remaining <= 150 {
            return 0;
        }
        let expected_moves_left = ((80_usize.saturating_sub(context.ply)) / 2).clamp(10, 35) as u64;
        let sustainable_time =
            remaining / expected_moves_left + context.increment_ms.saturating_mul(3) / 4;
        let clock_cap = sustainable_time.saturating_mul(2).max(100);
        target = target.min(clock_cap).min(remaining.saturating_sub(150));
    }

    target
}

/// Think time of the bot to move. `chosen` is the move it decided on, when known, and
/// `critical` whether the verification found a single good move.
fn sample_human_think_time(
    controller: &GameController,
    source: GameMoveSource,
    chosen: Option<&str>,
    critical: bool,
) -> Option<u64> {
    let config = match controller.current_turn_player() {
        PlayerConfig::Engine {
            human_timing: Some(config),
            ..
        } => config,
        _ => return None,
    };
    let (white_time, black_time) = controller.get_current_times();
    let turn = controller.position.turn();
    let (remaining_time, increment) = match (&controller.clock, turn) {
        (Some(clock), Color::White) => (white_time, clock.white_increment),
        (Some(clock), Color::Black) => (black_time, clock.black_increment),
        (None, _) => (None, 0),
    };
    let initial_time = match turn {
        Color::White => controller.config.white_time_control.as_ref(),
        Color::Black => controller.config.black_time_control.as_ref(),
    }
    .map(|control| control.initial_time);
    let moves = &controller.moves;
    let out_of_book = source == GameMoveSource::Engine
        && moves.len() >= 2
        && matches!(
            moves[moves.len() - 2].source,
            GameMoveSource::ProfileRepertoire | GameMoveSource::Polyglot
        );
    let recapture = match (moves.last(), chosen) {
        (Some(last), Some(chosen)) => {
            last.san.contains('x')
                && chosen.get(2..4).is_some()
                && chosen.get(2..4) == last.uci.get(2..4)
        }
        _ => false,
    };
    let mut rng = rand::thread_rng();

    Some(calculate_human_think_time(
        config,
        ThinkContext {
            source,
            legal_move_count: controller.position.legal_moves().len(),
            in_check: controller.position.is_check(),
            ply: moves.len(),
            remaining_time_ms: remaining_time,
            increment_ms: increment,
            initial_time_ms: initial_time,
            out_of_book,
            critical,
            recapture,
        },
        &mut rng,
    ))
}

async fn wait_for_human_think_time(started_at: Instant, target_ms: Option<u64>) {
    let Some(target_ms) = target_ms else {
        return;
    };
    let elapsed_ms = started_at.elapsed().as_millis() as u64;
    if target_ms > elapsed_ms {
        tokio::time::sleep(Duration::from_millis(target_ms - elapsed_ms)).await;
    }
}

async fn request_engine_move(
    game_id: &str,
    controller: &Arc<RwLock<GameController>>,
    app: &AppHandle,
) -> Result<(), Error> {
    let decision_started_at = Instant::now();

    // A bot's profile repertoire takes priority over the optional shared Polyglot book.
    {
        let ctrl = controller.read().await;
        let book_move = try_profile_repertoire_move(&ctrl)
            .map(|(uci, repertoire_id)| EngineBookMove::Profile { uci, repertoire_id })
            .or_else(|| try_polyglot_book_move(&ctrl).map(|uci| EngineBookMove::Polyglot { uci }));
        let human_think_time_ms = book_move
            .as_ref()
            .and_then(|book_move| sample_human_think_time(&ctrl, book_move.source(), None, false));
        let turn = ctrl.position.turn();
        let engine_arc = if turn == Color::White {
            ctrl.white_engine.clone()
        } else {
            ctrl.black_engine.clone()
        };
        drop(ctrl);

        if let Some(book_move) = book_move {
            wait_for_human_think_time(decision_started_at, human_think_time_ms).await;
            let mut ctrl = controller.write().await;
            ctrl.engine_thinking = false;

            if ctrl.status != GameStatus::Playing || ctrl.position.turn() != turn {
                return Ok(());
            }

            let game_move = ctrl.apply_move(
                book_move.uci(),
                book_move.source(),
                Some(decision_started_at.elapsed().as_millis() as u64),
            )?;
            let (white_time, black_time) = ctrl.get_current_times();

            GameMoveEvent {
                game_id: game_id.to_string(),
                moves: ctrl.moves.clone(),
                fen: game_move.fen_after,
                white_time,
                black_time,
            }
            .emit(app)?;

            if let GameStatus::Finished { result } = &ctrl.status {
                GameOverEvent {
                    game_id: game_id.to_string(),
                    result: result.clone(),
                    moves: ctrl.moves.clone(),
                }
                .emit(app)?;
            }

            drop(ctrl);
            if let Some(engine) = engine_arc {
                engine
                    .lock()
                    .await
                    .log_gui_message(&book_move.log_message());
            }

            return Ok(());
        }
    }

    let (engine_arc, go_mode, initial_fen, moves, turn, tablebase_fen, bot) = {
        let ctrl = controller.read().await;

        if ctrl.status != GameStatus::Playing {
            return Ok(());
        }

        let turn = ctrl.position.turn();
        let (engine_arc, player_config) = if turn == Color::White {
            (ctrl.white_engine.clone(), ctrl.config.white.clone())
        } else {
            (ctrl.black_engine.clone(), ctrl.config.black.clone())
        };

        let engine = match engine_arc {
            Some(e) => e,
            None => return Err(Error::EngineNotInitialized),
        };

        let (go, tablebase_defense) = match player_config {
            PlayerConfig::Engine {
                go,
                tablebase_defense,
                ..
            } => (go, tablebase_defense.unwrap_or(false)),
            _ => return Err(Error::NotEngineTurn),
        };

        let initial_fen = ctrl.initial_fen.clone();
        let moves: Vec<String> = ctrl.moves.iter().map(|m| m.uci.clone()).collect();
        let (white_time, black_time) = ctrl.get_current_times();

        let current_time = if turn == Color::White {
            white_time
        } else {
            black_time
        };

        let go_mode = if current_time.is_some() {
            let (winc, binc) = ctrl
                .clock
                .as_ref()
                .map(|c| {
                    (
                        clock_millis_to_uci(c.white_increment),
                        clock_millis_to_uci(c.black_increment),
                    )
                })
                .unwrap_or((0, 0));

            let wt = white_time.map(clock_millis_to_uci).unwrap_or(u32::MAX);
            let bt = black_time.map(clock_millis_to_uci).unwrap_or(u32::MAX);
            GoMode::PlayersTime(PlayersTime::new(wt, bt, winc, binc))
        } else {
            go.unwrap_or(GoMode::Depth(20))
        };

        let tablebase_fen = (tablebase_defense
            && ctrl.position.board().occupied().count() <= TABLEBASE_MAX_PIECES
            && ctrl.position.castles().is_empty())
        .then(|| Fen::from_position(ctrl.position.clone(), EnPassantMode::Legal).to_string());

        let bot = if turn == Color::White {
            &ctrl.white_bot
        } else {
            &ctrl.black_bot
        }
        .as_ref()
        .map(|bot| {
            (
                bot.config.clone(),
                bot.verifier.clone(),
                ctrl.position.clone(),
            )
        });

        (
            engine,
            go_mode,
            initial_fen,
            moves,
            turn,
            tablebase_fen,
            bot,
        )
    };

    // Best defense: the tablebase answers exactly; without connection the engine plays instead.
    if let Some(fen) = tablebase_fen {
        if let Some((uci, category)) = tablebase_best_move(&fen).await {
            let committed = commit_engine_move(
                game_id,
                controller,
                app,
                turn,
                &uci,
                decision_started_at,
                None,
                Some(category),
            )
            .await?;
            if committed {
                engine_arc
                    .lock()
                    .await
                    .log_gui_message(&format!("Tablebase move: {uci}"));
            }
            return Ok(());
        }
    }

    let (best_move, score, critical) = {
        let mut engine = engine_arc.lock().await;
        engine.set_position(&initial_fen, &moves).await?;
        match bot {
            Some((config, verifier, position)) => {
                let mut verifier = match &verifier {
                    Some(verifier) => Some(verifier.lock().await),
                    None => None,
                };
                let choice = choose_bot_move(
                    &mut engine,
                    verifier.as_deref_mut(),
                    &config,
                    &position,
                    &initial_fen,
                    &moves,
                    &go_mode,
                    &mut StdRng::from_entropy(),
                )
                .await?;
                let score = choice.score();
                let critical = choice.is_critical();
                (choice.uci, score, critical)
            }
            None => {
                engine.go(&go_mode).await?;
                let (best_move, score) = engine.wait_for_bestmove_with_score().await?;
                (best_move, score, false)
            }
        }
    };

    // Sampled once the move is known: recaptures are quick, critical moves take longer. The time
    // spent computing counts as thinking.
    let human_think_time_ms = {
        let ctrl = controller.read().await;
        (ctrl.status == GameStatus::Playing && ctrl.position.turn() == turn)
            .then(|| {
                sample_human_think_time(&ctrl, GameMoveSource::Engine, Some(&best_move), critical)
            })
            .flatten()
    };
    wait_for_human_think_time(decision_started_at, human_think_time_ms).await;

    // The engine reports from its own side; moves store White's point of view.
    let engine_eval = score.map(|value| match (turn, value) {
        (Color::White, value) => value,
        (Color::Black, ScoreValue::Cp(cp)) => ScoreValue::Cp(-cp),
        (Color::Black, ScoreValue::Mate(moves)) => ScoreValue::Mate(-moves),
    });
    commit_engine_move(
        game_id,
        controller,
        app,
        turn,
        &best_move,
        decision_started_at,
        engine_eval,
        None,
    )
    .await?;
    Ok(())
}

const TABLEBASE_MAX_PIECES: usize = 7;
const TABLEBASE_URL: &str = "https://tablebase.lichess.org/standard";

#[derive(Deserialize)]
struct TablebaseResponse {
    category: String,
    moves: Vec<TablebaseResponseMove>,
}

#[derive(Deserialize)]
struct TablebaseResponseMove {
    uci: String,
}

/// Best move of the Lichess tablebase (its moves come best first) and the category of the
/// position for the side to move. `None` when it cannot answer in time.
async fn tablebase_best_move(fen: &str) -> Option<(String, String)> {
    let url = reqwest::Url::parse_with_params(TABLEBASE_URL, &[("fen", fen)]).ok()?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(4))
        .user_agent(concat!("OnyxChessLab/", env!("CARGO_PKG_VERSION")))
        .build()
        .ok()?;
    let response = client.get(url).send().await.ok()?.error_for_status().ok()?;
    let data: TablebaseResponse = response.json().await.ok()?;
    if data.category == "unknown" {
        return None;
    }
    let best = data.moves.into_iter().next()?;
    Some((best.uci, data.category))
}

/// Plays the engine's move if the game is still waiting for it and tells the interface.
/// Returns whether the move was played.
#[allow(clippy::too_many_arguments)]
async fn commit_engine_move(
    game_id: &str,
    controller: &Arc<RwLock<GameController>>,
    app: &AppHandle,
    turn: Color,
    uci: &str,
    decision_started_at: Instant,
    engine_eval: Option<ScoreValue>,
    tablebase_category: Option<String>,
) -> Result<bool, Error> {
    let mut ctrl = controller.write().await;
    ctrl.engine_thinking = false;

    if ctrl.status != GameStatus::Playing || ctrl.position.turn() != turn {
        return Ok(false);
    }

    let game_move = ctrl.apply_move(
        uci,
        GameMoveSource::Engine,
        Some(decision_started_at.elapsed().as_millis() as u64),
    )?;
    if let Some(last) = ctrl.moves.last_mut() {
        last.engine_eval = engine_eval;
        last.tablebase_category = tablebase_category;
    }
    let (white_time, black_time) = ctrl.get_current_times();

    GameMoveEvent {
        game_id: game_id.to_string(),
        moves: ctrl.moves.clone(),
        fen: game_move.fen_after,
        white_time,
        black_time,
    }
    .emit(app)?;

    if let GameStatus::Finished { result } = &ctrl.status {
        GameOverEvent {
            game_id: game_id.to_string(),
            result: result.clone(),
            moves: ctrl.moves.clone(),
        }
        .emit(app)?;
    }

    Ok(true)
}

fn clock_millis_to_uci(value: u64) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

#[tauri::command]
#[specta::specta]
pub async fn start_game(
    game_id: String,
    config: GameConfig,
    app: AppHandle,
    state: tauri::State<'_, crate::AppState>,
) -> Result<GameState, Error> {
    info!("Starting game with ID {}", game_id);
    state.game_manager.start_game(game_id, config, app).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_game_state(
    game_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<GameState, Error> {
    state.game_manager.get_game_state(&game_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn make_game_move(
    game_id: String,
    uci: String,
    app: AppHandle,
    state: tauri::State<'_, crate::AppState>,
) -> Result<GameState, Error> {
    state.game_manager.make_move(&game_id, &uci, &app).await
}

#[tauri::command]
#[specta::specta]
pub async fn take_back_game_move(
    game_id: String,
    app: AppHandle,
    state: tauri::State<'_, crate::AppState>,
) -> Result<GameState, Error> {
    state.game_manager.take_back_move(&game_id, &app).await
}

#[tauri::command]
#[specta::specta]
pub async fn rewind_game(
    game_id: String,
    ply: u32,
    state: tauri::State<'_, crate::AppState>,
    app: AppHandle,
) -> Result<GameState, Error> {
    state
        .game_manager
        .rewind_to(&game_id, ply as usize, &app)
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn resign_game(
    game_id: String,
    color: String,
    app: AppHandle,
    state: tauri::State<'_, crate::AppState>,
) -> Result<GameState, Error> {
    state.game_manager.resign(&game_id, &color, &app).await
}

#[tauri::command]
#[specta::specta]
pub async fn abort_game(
    game_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), Error> {
    state.game_manager.abort_game(&game_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_game_engine_logs(
    game_id: String,
    color: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<EngineLog>, Error> {
    state.game_manager.get_engine_logs(&game_id, &color).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_game_manifest(
    game_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<GameManifest, Error> {
    state.game_manager.get_game_manifest(&game_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::{rngs::StdRng, SeedableRng};
    use serde_json::json;

    fn opening_line(moves: &[&str], weight: u16) -> WeightedOpeningLine {
        WeightedOpeningLine {
            moves: moves.iter().map(|value| (*value).to_string()).collect(),
            weight,
            side: OpeningLineSide::Both,
        }
    }

    fn initial_position() -> Chess {
        parse_fen_to_position("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
            .expect("initial position must be valid")
    }

    #[test]
    fn player_config_deserializes_camel_case_opening_repertoire() {
        let config: PlayerConfig = serde_json::from_value(json!({
            "type": "engine",
            "name": "Luna",
            "path": "maia3.exe",
            "version": "3.0",
            "presetCategory": "humanLike",
            "targetElo": 900,
            "seed": 42,
            "openingRepertoire": {
                "id": "luna-variety",
                "maxPly": 12,
                "lines": [{
                    "moves": ["e2e4", "e7e5"],
                    "weight": 5
                }]
            },
            "humanTiming": {
                "minThinkTimeMs": 450,
                "averageThinkTimeMs": 1200,
                "maxThinkTimeMs": 3500,
                "repertoireTimePercent": 45
            },
            "go": null
        }))
        .expect("frontend player config must deserialize");

        match &config {
            PlayerConfig::Engine {
                opening_repertoire: Some(repertoire),
                human_timing: Some(timing),
                version,
                preset_category,
                target_elo,
                seed,
                ..
            } => {
                assert_eq!(repertoire.id, "luna-variety");
                assert_eq!(repertoire.max_ply, 12);
                assert_eq!(repertoire.lines.len(), 1);
                assert_eq!(repertoire.lines[0].moves, ["e2e4", "e7e5"]);
                assert_eq!(repertoire.lines[0].weight, 5);
                assert_eq!(timing.average_think_time_ms, 1200);
                assert_eq!(timing.repertoire_time_percent, 45);
                assert_eq!(version, "3.0");
                assert_eq!(*preset_category, PlayerPresetCategory::HumanLike);
                assert_eq!(*target_elo, Some(900));
                assert_eq!(*seed, Some(42));
            }
            _ => panic!("openingRepertoire was silently discarded"),
        }

        let serialized = serde_json::to_value(config).expect("player config must serialize");
        assert!(serialized.get("openingRepertoire").is_some());
        assert!(serialized.get("opening_repertoire").is_none());
        assert!(serialized.get("humanTiming").is_some());
        assert!(serialized.get("human_timing").is_none());
    }

    #[test]
    fn manifest_preserves_reproducible_position_player_and_resource_inputs() {
        let config = GameConfig {
            white: PlayerConfig::Human {
                name: "Player".to_string(),
            },
            black: PlayerConfig::Engine {
                name: "Stockfish 18".to_string(),
                path: "stockfish.exe".to_string(),
                version: "18".to_string(),
                preset_category: PlayerPresetCategory::Reference,
                target_elo: None,
                seed: Some(7),
                args: Vec::new(),
                options: vec![
                    EngineOption {
                        name: "Threads".to_string(),
                        value: "1".to_string(),
                    },
                    EngineOption {
                        name: "Hash".to_string(),
                        value: "256".to_string(),
                    },
                ],
                opening_repertoire: None,
                human_timing: None,
                go: Some(GoMode::Depth(24)),
                tablebase_defense: None,
                bot_play: None,
            },
            white_time_control: None,
            black_time_control: None,
            initial_fen: None,
            initial_moves: vec!["e2e4".to_string()],
            opening_book: None,
        };
        let controller = GameController::new("manifest-test".to_string(), config).unwrap();
        let manifest = controller.get_manifest();

        assert_eq!(manifest.schema_version, 1);
        assert_eq!(manifest.initial_moves, ["e2e4"]);
        assert_eq!(manifest.moves.len(), 1);
        assert_eq!(manifest.moves[0].source, GameMoveSource::Initial);
        assert!(manifest.result.is_none());
        assert!(manifest.hardware.logical_cpus >= 1);
        match manifest.black {
            PlayerConfig::Engine {
                version,
                preset_category,
                options,
                go,
                seed,
                ..
            } => {
                assert_eq!(version, "18");
                assert_eq!(preset_category, PlayerPresetCategory::Reference);
                assert_eq!(seed, Some(7));
                assert!(options.iter().any(|option| option.name == "Threads"));
                assert_eq!(go, Some(GoMode::Depth(24)));
            }
            _ => panic!("black player must remain an engine"),
        }
    }

    #[test]
    fn normalized_game_options_record_effective_multipv_and_variant() {
        let mut player = PlayerConfig::Engine {
            name: "Engine".to_string(),
            path: "engine".to_string(),
            version: String::new(),
            preset_category: PlayerPresetCategory::Custom,
            target_elo: None,
            seed: None,
            args: Vec::new(),
            options: vec![
                EngineOption {
                    name: "MultiPV".to_string(),
                    value: "8".to_string(),
                },
                EngineOption {
                    name: "MultiPV".to_string(),
                    value: "4".to_string(),
                },
            ],
            opening_repertoire: None,
            human_timing: None,
            go: Some(GoMode::Depth(12)),
            tablebase_defense: None,
            bot_play: None,
        };

        normalize_game_engine_options(&mut player, true);

        let PlayerConfig::Engine { options, .. } = player else {
            panic!("player must remain an engine");
        };
        let multipv = options
            .iter()
            .filter(|option| option.name == "MultiPV")
            .collect::<Vec<_>>();
        assert_eq!(multipv.len(), 1);
        assert_eq!(multipv[0].value, "1");
        assert!(options
            .iter()
            .any(|option| { option.name == "UCI_Chess960" && option.value == "true" }));
    }

    #[test]
    fn lc0_depth_is_normalized_to_a_safe_node_budget() {
        let mut player = PlayerConfig::Engine {
            name: "Lc0 v0.32".to_string(),
            path: "C:/engines/lc0.exe".to_string(),
            version: String::new(),
            preset_category: PlayerPresetCategory::Custom,
            target_elo: None,
            seed: None,
            args: Vec::new(),
            options: Vec::new(),
            opening_repertoire: None,
            human_timing: None,
            go: Some(GoMode::Depth(18)),
            tablebase_defense: None,
            bot_play: None,
        };

        normalize_lc0_go_mode(&mut player);

        let PlayerConfig::Engine { go, .. } = player else {
            panic!("player must remain an engine");
        };
        assert_eq!(go, Some(GoMode::Nodes(2_000)));
    }

    fn think_context(source: GameMoveSource) -> ThinkContext {
        ThinkContext {
            source,
            legal_move_count: 20,
            in_check: false,
            ply: 20,
            remaining_time_ms: None,
            increment_ms: 0,
            initial_time_ms: None,
            out_of_book: false,
            critical: false,
            recapture: false,
        }
    }

    /// Average think time over many samples, to compare situations without the jitter.
    fn average_think_time(timing: &HumanTimingConfig, context: ThinkContext) -> u64 {
        let mut rng = StdRng::seed_from_u64(9);
        (0..400)
            .map(|_| calculate_human_think_time(timing, context, &mut rng))
            .sum::<u64>()
            / 400
    }

    fn deliberate_timing() -> HumanTimingConfig {
        HumanTimingConfig {
            min_think_time_ms: 1400,
            average_think_time_ms: 4500,
            max_think_time_ms: 13_500,
            repertoire_time_percent: 34,
            fixed_rhythm: false,
        }
    }

    #[test]
    fn profile_repertoire_moves_are_faster_than_maia_moves() {
        let timing = HumanTimingConfig {
            min_think_time_ms: 0,
            average_think_time_ms: 2000,
            max_think_time_ms: 10_000,
            repertoire_time_percent: 35,
            fixed_rhythm: false,
        };
        let mut repertoire_rng = StdRng::seed_from_u64(9);
        let mut engine_rng = StdRng::seed_from_u64(9);

        let repertoire_time = calculate_human_think_time(
            &timing,
            think_context(GameMoveSource::ProfileRepertoire),
            &mut repertoire_rng,
        );
        let engine_time = calculate_human_think_time(
            &timing,
            think_context(GameMoveSource::Engine),
            &mut engine_rng,
        );

        assert!(repertoire_time < engine_time);
    }

    #[test]
    fn human_think_time_preserves_a_clock_reserve() {
        let timing = HumanTimingConfig {
            min_think_time_ms: 500,
            average_think_time_ms: 10_000,
            max_think_time_ms: 20_000,
            repertoire_time_percent: 100,
            fixed_rhythm: false,
        };
        let mut rng = StdRng::seed_from_u64(9);

        let target = calculate_human_think_time(
            &timing,
            ThinkContext {
                legal_move_count: 30,
                ply: 0,
                remaining_time_ms: Some(1000),
                ..think_context(GameMoveSource::Engine)
            },
            &mut rng,
        );

        assert!(target < 500);
        assert!(target <= 850);
    }

    #[test]
    fn a_measured_rhythm_is_not_scaled() {
        let mut timing = deliberate_timing();
        let classical = ThinkContext {
            initial_time_ms: Some(1_800_000),
            ..think_context(GameMoveSource::Engine)
        };
        let scaled = average_think_time(&timing, classical);
        timing.fixed_rhythm = true;
        let fixed = average_think_time(&timing, classical);
        assert!(scaled > fixed * 2, "{scaled} against {fixed}");
    }

    #[test]
    fn slower_rhythms_think_longer() {
        assert_eq!(rhythm_factor(None, 0), 1.0);
        assert_eq!(rhythm_factor(Some(60_000), 0), 0.6);
        assert_eq!(rhythm_factor(Some(180_000), 2_000), 1.0);
        assert_eq!(rhythm_factor(Some(600_000), 5_000), 1.6);
        assert_eq!(rhythm_factor(Some(1_800_000), 30_000), 2.5);

        let timing = deliberate_timing();
        let at = |initial: u64, increment: u64| {
            average_think_time(
                &timing,
                ThinkContext {
                    initial_time_ms: Some(initial),
                    increment_ms: increment,
                    remaining_time_ms: Some(initial),
                    ..think_context(GameMoveSource::Engine)
                },
            )
        };
        let blitz = at(180_000, 2_000);
        let rapid = at(600_000, 5_000);
        let classical = at(1_800_000, 30_000);
        assert!(blitz < rapid && rapid < classical);
        // A slight increase, not a full use of the clock: about 2.5 times blitz.
        assert!(
            classical < blitz * 3,
            "{blitz} ms in blitz, {classical} ms in classical"
        );
    }

    #[test]
    fn leaving_the_book_and_critical_moves_take_longer_and_recaptures_less() {
        let timing = deliberate_timing();
        let normal = average_think_time(&timing, think_context(GameMoveSource::Engine));
        let with = |change: fn(&mut ThinkContext)| {
            let mut context = think_context(GameMoveSource::Engine);
            change(&mut context);
            average_think_time(&timing, context)
        };
        let out_of_book = with(|context| context.out_of_book = true);
        let critical = with(|context| context.critical = true);
        let recapture = with(|context| context.recapture = true);
        assert!(out_of_book > critical && critical > normal && normal > recapture);
    }

    #[test]
    fn uci_clock_conversion_saturates_instead_of_wrapping() {
        assert_eq!(clock_millis_to_uci(180_000), 180_000);
        assert_eq!(clock_millis_to_uci(u32::MAX as u64), u32::MAX);
        assert_eq!(clock_millis_to_uci(u32::MAX as u64 + 1), u32::MAX);
        assert_eq!(clock_millis_to_uci(u64::MAX), u32::MAX);
    }

    #[test]
    fn repertoire_uses_only_matching_legal_continuations() {
        let mut position = initial_position();
        let first_move = UciMove::from_ascii(b"e2e4")
            .expect("valid UCI")
            .to_move(&position)
            .expect("legal move");
        position.play_unchecked(&first_move);

        let repertoire = OpeningRepertoireConfig {
            id: "test".to_string(),
            version: 1,
            mode: OpeningRepertoireMode::Weighted,
            max_ply: 8,
            lines: vec![
                opening_line(&["d2d4", "d7d5"], 100),
                opening_line(&["e2e4", "e2e5"], 100),
                opening_line(&["e2e4", "e7e5"], 1),
            ],
        };
        let mut rng = StdRng::seed_from_u64(7);

        assert_eq!(
            select_repertoire_move(&repertoire, &["e2e4".to_string()], &position, &mut rng,),
            Some("e7e5".to_string())
        );
    }

    #[test]
    fn repertoire_matches_a_castle_written_as_king_takes_rook() {
        let moves = ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "e1g1"];
        let mut position = initial_position();
        for uci in moves {
            let movement = UciMove::from_ascii(uci.as_bytes())
                .expect("valid UCI")
                .to_move(&position)
                .expect("legal move");
            position.play_unchecked(&movement);
        }
        let repertoire = OpeningRepertoireConfig {
            id: "twin".to_string(),
            version: 1,
            mode: OpeningRepertoireMode::Weighted,
            max_ply: 12,
            lines: vec![opening_line(
                &[
                    "e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "e1g1", "g8f6",
                ],
                1,
            )],
        };
        // The board sends the castle as the king taking its rook.
        let played: Vec<String> = moves
            .iter()
            .map(|uci| if *uci == "e1g1" { "e1h1" } else { uci }.to_string())
            .collect();
        let mut rng = StdRng::seed_from_u64(7);
        assert_eq!(
            select_repertoire_move(&repertoire, &played, &position, &mut rng),
            Some("g8f6".to_string())
        );
    }

    #[test]
    fn repertoire_respects_max_ply() {
        let repertoire = OpeningRepertoireConfig {
            id: "test".to_string(),
            version: 1,
            mode: OpeningRepertoireMode::Weighted,
            max_ply: 0,
            lines: vec![opening_line(&["e2e4"], 1)],
        };
        let mut rng = StdRng::seed_from_u64(7);

        assert_eq!(
            select_repertoire_move(&repertoire, &[], &initial_position(), &mut rng),
            None
        );
    }

    #[test]
    fn repertoire_weights_control_candidate_selection() {
        let repertoire = OpeningRepertoireConfig {
            id: "test".to_string(),
            version: 1,
            mode: OpeningRepertoireMode::Weighted,
            max_ply: 8,
            lines: vec![opening_line(&["e2e4"], 0), opening_line(&["d2d4"], 5)],
        };
        let mut rng = StdRng::seed_from_u64(7);

        assert_eq!(
            select_repertoire_move(&repertoire, &[], &initial_position(), &mut rng),
            Some("d2d4".to_string())
        );
    }

    #[test]
    fn repertoire_respects_side_and_none_mode() {
        let mut position = initial_position();
        let repertoire = OpeningRepertoireConfig {
            id: "sides".to_string(),
            version: 2,
            mode: OpeningRepertoireMode::Weighted,
            max_ply: 8,
            lines: vec![
                WeightedOpeningLine {
                    moves: vec!["e2e4".to_string(), "e7e5".to_string()],
                    weight: 1,
                    side: OpeningLineSide::White,
                },
                WeightedOpeningLine {
                    moves: vec!["e2e4".to_string(), "c7c5".to_string()],
                    weight: 1,
                    side: OpeningLineSide::Black,
                },
            ],
        };
        let mut rng = StdRng::seed_from_u64(7);

        assert_eq!(
            select_repertoire_move(&repertoire, &[], &position, &mut rng),
            Some("e2e4".to_string())
        );
        let first_move = UciMove::from_ascii(b"e2e4")
            .expect("valid UCI")
            .to_move(&position)
            .expect("legal move");
        position.play_unchecked(&first_move);
        assert_eq!(
            select_repertoire_move(&repertoire, &["e2e4".to_string()], &position, &mut rng),
            Some("c7c5".to_string())
        );

        let no_repertoire = OpeningRepertoireConfig {
            id: "none".to_string(),
            version: 2,
            mode: OpeningRepertoireMode::None,
            max_ply: 0,
            lines: Vec::new(),
        };
        assert_eq!(
            select_repertoire_move(&no_repertoire, &[], &initial_position(), &mut rng),
            None
        );
    }
}
