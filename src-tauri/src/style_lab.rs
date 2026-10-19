//! Style laboratory (Phase 9.1, I-47): each play style against a neutral Maia of the same Elo, in
//! short lots whose results add up. A lot can be stopped and run again: finished games are kept
//! and skipped.
//!
//! Run a lot with real engines (`--ignored --nocapture`):
//!
//! - `ONYX_MAIA_PATH`, `ONYX_MAIA_ARGS` (separated by `|`) and `ONYX_STOCKFISH_PATH`;
//! - `ONYX_LAB_OUT` (results folder), `ONYX_LAB_ELO` (1500), `ONYX_LAB_LOT` (0),
//!   `ONYX_LAB_GAMES` (games per style, 10) and `ONYX_LAB_WORKERS` (2);
//! - `cargo test style_lab::run_lot -- --ignored --nocapture`.
//!
//! `cargo test style_lab::summarize -- --ignored --nocapture` (with `ONYX_LAB_OUT`) writes
//! `summary.md` and a blind set of games, `blind.pgn` with its key in `blind-key.md`.

use std::{
    collections::{BTreeMap, HashMap, HashSet, VecDeque},
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
    sync::Arc,
    time::Instant,
};

use rand::{rngs::StdRng, seq::SliceRandom, SeedableRng};
use serde::{Deserialize, Serialize};
use shakmaty::{
    san::SanPlus, uci::UciMove, zobrist::Zobrist64, zobrist::ZobristHash, Chess, Color,
    EnPassantMode, Outcome, Position, Role,
};
use tokio::sync::Mutex;

use crate::{
    bot_candidates::{policy_launch, score_to_cp},
    bot_strength::strength_plan,
    bot_style::{choose_bot_move, BotPlayConfig, StyleWeights, PLAY_STYLES},
    engine::{BaseEngine, GoMode},
};

const START_FEN: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MAX_PLIES: usize = 300;

#[derive(Debug, Clone)]
struct Job {
    lot: u32,
    elo: u32,
    style: &'static str,
    weights: StyleWeights,
    /// The other side: its rating and whether it is plain Maia (an anchor) or a full bot.
    opponent_elo: u32,
    opponent_pure: bool,
    game: u32,
    seed: u64,
    styled_white: bool,
}

/// Strength calibration (I-48): the tested bot, its opponent, whether the opponent is plain Maia,
/// and the expected rating difference.
const STRENGTH_MATCHUPS: [(&str, u32, u32, bool, i32); 4] = [
    ("fuerza-2500-vs-maia-2400", 2500, 2400, true, 100),
    ("fuerza-2600-vs-maia-2400", 2600, 2400, true, 200),
    ("fuerza-2700-vs-maia-2400", 2700, 2400, true, 300),
    ("fuerza-2800-vs-maia-2400", 2800, 2400, true, 400),
];

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct SideStats {
    moves: u32,
    checks: u32,
    captures: u32,
    trades: u32,
    castled_ply: Option<u32>,
    /// Sum of Maia's probability of the moves played.
    maia_probability_sum: f32,
    /// Moves that were not Maia's most likely one.
    not_top_moves: u32,
    verified_moves: u32,
    /// Moves where the strength filter applied.
    #[serde(default)]
    filtered_moves: u32,
    /// Centipawns below the best verified candidate, over the verified moves played.
    cp_loss_sum: i64,
    /// Pieces under attack after the side's moves, summed.
    tension_sum: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GameRecord {
    lot: u32,
    elo: u32,
    style: String,
    game: u32,
    seed: u64,
    styled_white: bool,
    result: String,
    styled_score: f32,
    #[serde(default)]
    opponent_elo: u32,
    reason: String,
    plies: u32,
    /// Average material on the board (pawn 1, minor 3, rook 5, queen 9), both colors.
    material_avg: f32,
    styled: SideStats,
    neutral: SideStats,
    duration_ms: u64,
    pgn: String,
}

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("{name} is not set"))
}

fn env_or(name: &str, default: u32) -> u32 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

/// Temperature and top-p of the catalog bots at that strength (`balanced` and `focused`).
fn sampling(elo: u32) -> (f32, f32) {
    if elo >= 1900 {
        (0.82, 0.88)
    } else {
        (1.0, 0.94)
    }
}

fn material(position: &Chess) -> u32 {
    let board = position.board();
    [
        (Role::Pawn, 1),
        (Role::Knight, 3),
        (Role::Bishop, 3),
        (Role::Rook, 5),
        (Role::Queen, 9),
    ]
    .into_iter()
    .map(|(role, value)| board.by_role(role).count() as u32 * value)
    .sum()
}

fn attacked_pieces(position: &Chess) -> i64 {
    let board = position.board();
    let occupied = board.occupied();
    occupied
        .into_iter()
        .filter(|&square| {
            board.color_at(square).is_some_and(|color| {
                board.role_at(square) != Some(Role::King)
                    && board.attacks_to(square, !color, occupied).any()
            })
        })
        .count() as i64
}

async fn start_engines(elo: u32) -> (BaseEngine, BaseEngine) {
    let maia_path = PathBuf::from(env("ONYX_MAIA_PATH"));
    let maia_args: Vec<String> = env("ONYX_MAIA_ARGS")
        .split('|')
        .map(str::to_string)
        .collect();
    let scripts = std::env::temp_dir().join("onyx-style-lab");
    let (program, args) = policy_launch(&maia_path, &maia_args, &scripts)
        .unwrap()
        .expect("the Maia launcher has its Python next to it");
    let mut maia = BaseEngine::spawn(program, &args).await.unwrap();
    maia.init_uci().await.unwrap();
    // Both bots have the same strength, so one Maia answers for both.
    for name in ["Elo", "SelfElo", "OppoElo"] {
        maia.set_option_if_supported(name, elo).await.unwrap();
    }
    let mut stockfish = BaseEngine::spawn(PathBuf::from(env("ONYX_STOCKFISH_PATH")), &[])
        .await
        .unwrap();
    stockfish.init_uci().await.unwrap();
    stockfish.set_option("Threads", 1).await.unwrap();
    stockfish.set_option("Hash", 32).await.unwrap();
    (maia, stockfish)
}

async fn play_game(maia: &mut BaseEngine, stockfish: &mut BaseEngine, job: &Job) -> GameRecord {
    let started = Instant::now();
    let mut rng = StdRng::seed_from_u64(job.seed);
    let side_config = |elo: u32| {
        let (temperature, top_p) = sampling(elo);
        BotPlayConfig {
            aggression: 0.0,
            simplification: 0.0,
            elo,
            temperature,
            top_p,
            verifier_path: None,
            verifier_args: Vec::new(),
        }
    };
    let tested_maia_elo = strength_plan(job.elo).maia_elo;
    let opponent_maia_elo = if job.opponent_pure {
        job.opponent_elo
    } else {
        strength_plan(job.opponent_elo).maia_elo
    };
    let mut position = Chess::default();
    let mut moves: Vec<String> = Vec::new();
    let mut sans: Vec<String> = Vec::new();
    let mut repetitions: HashMap<u64, u32> = HashMap::new();
    let mut styled = SideStats::default();
    let mut neutral = SideStats::default();
    let mut material_sum = 0u64;
    let hash = |position: &Chess| position.zobrist_hash::<Zobrist64>(EnPassantMode::Legal).0;
    repetitions.insert(hash(&position), 1);

    let (result, reason) = loop {
        if let Some(outcome) = position.outcome() {
            break match outcome {
                Outcome::Decisive {
                    winner: Color::White,
                } => ("1-0", "checkmate"),
                Outcome::Decisive {
                    winner: Color::Black,
                } => ("0-1", "checkmate"),
                Outcome::Draw if position.is_stalemate() => ("1/2-1/2", "stalemate"),
                Outcome::Draw => ("1/2-1/2", "insufficient-material"),
            };
        }
        if position.halfmoves() >= 100 {
            break ("1/2-1/2", "fifty-moves");
        }
        if repetitions.get(&hash(&position)).copied().unwrap_or(0) >= 3 {
            break ("1/2-1/2", "repetition");
        }
        if moves.len() >= MAX_PLIES {
            break ("1/2-1/2", "ply-limit");
        }

        let styled_turn = (position.turn() == Color::White) == job.styled_white;
        let config = if styled_turn {
            BotPlayConfig {
                aggression: job.weights.aggression,
                simplification: job.weights.simplification,
                ..side_config(job.elo)
            }
        } else {
            side_config(job.opponent_elo)
        };
        let (self_elo, oppo_elo) = if styled_turn {
            (tested_maia_elo, opponent_maia_elo)
        } else {
            (opponent_maia_elo, tested_maia_elo)
        };
        maia.set_option("SelfElo", self_elo).await.unwrap();
        maia.set_option("OppoElo", oppo_elo).await.unwrap();
        maia.set_position(START_FEN, &moves).await.unwrap();
        // The tested side is always verified, also without style, for its centipawn loss; a plain
        // Maia opponent never is.
        let verified_side = styled_turn || !job.opponent_pure;
        let choice = choose_bot_move(
            maia,
            verified_side.then_some(&mut *stockfish),
            &config,
            &position,
            START_FEN,
            &moves,
            &GoMode::Nodes(1),
            &mut rng,
        )
        .await
        .unwrap();
        let traits = choice.traits.expect("the wrapper prints the policy");
        let m = choice
            .uci
            .parse::<UciMove>()
            .unwrap()
            .to_move(&position)
            .unwrap();

        let stats = if styled_turn {
            &mut styled
        } else {
            &mut neutral
        };
        stats.moves += 1;
        stats.checks += u32::from(traits.check);
        stats.captures += u32::from(traits.capture);
        stats.trades += u32::from(traits.trade);
        stats.maia_probability_sum += choice.maia_probability.unwrap_or(0.0);
        stats.not_top_moves += u32::from(!choice.maia_top);
        stats.filtered_moves += u32::from(choice.filtered);
        if m.is_castle() && stats.castled_ply.is_none() {
            stats.castled_ply = Some(moves.len() as u32);
        }
        if let (Some(best), Some(chosen)) = (
            choice.verified.iter().map(|v| score_to_cp(&v.score)).max(),
            choice.score(),
        ) {
            stats.verified_moves += 1;
            stats.cp_loss_sum += i64::from((best - score_to_cp(&chosen)).min(1000));
        }

        let san = SanPlus::from_move_and_play_unchecked(&mut position, &m);
        stats.tension_sum += attacked_pieces(&position);
        material_sum += u64::from(material(&position));
        sans.push(san.to_string());
        moves.push(choice.uci);
        *repetitions.entry(hash(&position)).or_insert(0) += 1;
    };

    let styled_score = match (result, job.styled_white) {
        ("1-0", true) | ("0-1", false) => 1.0,
        ("1/2-1/2", _) => 0.5,
        _ => 0.0,
    };
    let style_name = format!("{} {}", job.style, job.elo);
    let neutral_name = if job.opponent_pure {
        format!("maia {}", job.opponent_elo)
    } else {
        format!("bot {}", job.opponent_elo)
    };
    let (white, black) = if job.styled_white {
        (style_name, neutral_name)
    } else {
        (neutral_name, style_name)
    };
    let mut movetext = String::new();
    for (ply, san) in sans.iter().enumerate() {
        if ply % 2 == 0 {
            movetext.push_str(&format!("{}. ", ply / 2 + 1));
        }
        movetext.push_str(san);
        movetext.push(' ');
    }
    movetext.push_str(result);
    let pgn = format!(
        "[Event \"Onyx style lab\"]\n[Round \"{}.{}\"]\n[White \"{white}\"]\n[Black \"{black}\"]\n\
         [Result \"{result}\"]\n[Termination \"{reason}\"]\n[LabSeed \"{}\"]\n\n{movetext}\n",
        job.lot, job.game, job.seed
    );

    GameRecord {
        lot: job.lot,
        elo: job.elo,
        style: job.style.to_string(),
        game: job.game,
        seed: job.seed,
        styled_white: job.styled_white,
        result: result.to_string(),
        styled_score,
        opponent_elo: job.opponent_elo,
        reason: reason.to_string(),
        plies: moves.len() as u32,
        material_avg: material_sum as f32 / moves.len().max(1) as f32,
        styled,
        neutral,
        duration_ms: started.elapsed().as_millis() as u64,
        pgn,
    }
}

fn read_records(dir: &Path) -> Vec<GameRecord> {
    let mut records = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return records;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "jsonl") {
            let text = std::fs::read_to_string(&path).unwrap();
            records.extend(
                text.lines()
                    .filter(|line| !line.trim().is_empty())
                    .map(|line| serde_json::from_str::<GameRecord>(line).unwrap()),
            );
        }
    }
    records
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore]
async fn run_lot() {
    let out = PathBuf::from(env("ONYX_LAB_OUT"));
    let elo = env_or("ONYX_LAB_ELO", 1500);
    let lot = env_or("ONYX_LAB_LOT", 0);
    let games = env_or("ONYX_LAB_GAMES", 10);
    let workers = env_or("ONYX_LAB_WORKERS", 2).max(1);
    std::fs::create_dir_all(&out).unwrap();

    let done: HashSet<(u32, u32, String, u32)> = read_records(&out)
        .into_iter()
        .map(|record| (record.elo, record.lot, record.style, record.game))
        .collect();
    let strength = std::env::var("ONYX_LAB_MODE").is_ok_and(|mode| mode == "strength");
    let mut jobs = VecDeque::new();
    // Interleaved, so a lot stopped halfway still has every style or matchup.
    for game in 0..games {
        if strength {
            for (index, (name, tested, opponent, pure, _)) in STRENGTH_MATCHUPS.iter().enumerate() {
                if done.contains(&(*tested, lot, name.to_string(), game)) {
                    continue;
                }
                jobs.push_back(Job {
                    lot,
                    elo: *tested,
                    style: name,
                    weights: StyleWeights::NEUTRAL,
                    opponent_elo: *opponent,
                    opponent_pure: *pure,
                    game,
                    seed: 9_000_000_000
                        + u64::from(lot) * 10_000
                        + index as u64 * 1_000
                        + u64::from(game),
                    styled_white: (game + lot).is_multiple_of(2),
                });
            }
            continue;
        }
        for (index, (style, weights)) in PLAY_STYLES.iter().enumerate() {
            if done.contains(&(elo, lot, style.to_string(), game)) {
                continue;
            }
            jobs.push_back(Job {
                lot,
                elo,
                style,
                weights: *weights,
                opponent_elo: elo,
                opponent_pure: true,
                game,
                seed: u64::from(elo) * 1_000_000
                    + u64::from(lot) * 10_000
                    + index as u64 * 1_000
                    + u64::from(game),
                styled_white: (game + lot).is_multiple_of(2),
            });
        }
    }
    let total = jobs.len();
    let label = if strength {
        "strength".to_string()
    } else {
        elo.to_string()
    };
    println!("lot {lot} at {label}: {total} games to play with {workers} workers");
    let jobs = Arc::new(Mutex::new(jobs));
    let file = Arc::new(Mutex::new(
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(out.join(format!("lot-{label}-{lot}.jsonl")))
            .unwrap(),
    ));
    let started = Instant::now();
    let finished = Arc::new(Mutex::new(0usize));

    let mut tasks = Vec::new();
    for _ in 0..workers {
        let jobs = jobs.clone();
        let file = file.clone();
        let finished = finished.clone();
        tasks.push(tokio::spawn(async move {
            let (mut maia, mut stockfish) = start_engines(elo).await;
            loop {
                let Some(job) = jobs.lock().await.pop_front() else {
                    break;
                };
                maia.new_game().await.unwrap();
                stockfish.new_game().await.unwrap();
                let record = play_game(&mut maia, &mut stockfish, &job).await;
                let line = serde_json::to_string(&record).unwrap();
                writeln!(file.lock().await, "{line}").unwrap();
                let mut count = finished.lock().await;
                *count += 1;
                println!(
                    "[{:>3}/{total}] {} {} game {}: {} ({}, {} plies, {:.1} s) — {:.0} s elapsed",
                    *count,
                    record.style,
                    if record.styled_white {
                        "white"
                    } else {
                        "black"
                    },
                    record.game,
                    record.result,
                    record.reason,
                    record.plies,
                    record.duration_ms as f64 / 1000.0,
                    started.elapsed().as_secs_f64()
                );
            }
            maia.kill_sync();
            stockfish.kill_sync();
        }));
    }
    for task in tasks {
        task.await.unwrap();
    }
    println!("lot finished in {:.0} s", started.elapsed().as_secs_f64());
}

/// Mean and half-width of the 95 % interval.
fn mean_ci(values: &[f64]) -> (f64, f64) {
    let n = values.len() as f64;
    if n == 0.0 {
        return (f64::NAN, f64::NAN);
    }
    let mean = values.iter().sum::<f64>() / n;
    if n < 2.0 {
        return (mean, f64::NAN);
    }
    let variance = values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / (n - 1.0);
    (mean, 1.96 * (variance / n).sqrt())
}

fn elo_from_score(score: f64) -> f64 {
    let score = score.clamp(0.01, 0.99);
    400.0 * (score / (1.0 - score)).log10()
}

fn rate(count: u32, moves: u32) -> f64 {
    f64::from(count) / f64::from(moves.max(1))
}

fn strength_summary(records: &[GameRecord]) -> String {
    let mut md = String::from(
        "# Calibración de fuerza — resultados\n\n\
         | Enfrentamiento | n | Puntuación | Elo medido (95 %) | Esperado | Jugadas filtradas | \
         Pérdida cp | Medias jugadas | s/partida |\n|---|---|---|---|---|---|---|---|---|\n",
    );
    for (name, _, _, _, expected) in STRENGTH_MATCHUPS {
        let games: Vec<&GameRecord> = records.iter().filter(|r| r.style == name).collect();
        if games.is_empty() {
            continue;
        }
        let scores: Vec<f64> = games.iter().map(|g| f64::from(g.styled_score)).collect();
        let (mean, ci) = mean_ci(&scores);
        let moves: u32 = games.iter().map(|g| g.styled.moves).sum();
        let filtered: u32 = games.iter().map(|g| g.styled.filtered_moves).sum();
        let verified: u32 = games.iter().map(|g| g.styled.verified_moves).sum();
        let loss: i64 = games.iter().map(|g| g.styled.cp_loss_sum).sum();
        let plies: f64 = games.iter().map(|g| f64::from(g.plies)).sum::<f64>() / games.len() as f64;
        let seconds: f64 =
            games.iter().map(|g| g.duration_ms as f64).sum::<f64>() / games.len() as f64 / 1000.0;
        md.push_str(&format!(
            "| {name} | {} | {:.0} % | {:+.0} ({:+.0} a {:+.0}) | {expected:+} | {:.0} % | {:.1} | {plies:.0} | {seconds:.1} |\n",
            games.len(),
            100.0 * mean,
            elo_from_score(mean),
            elo_from_score(mean - ci),
            elo_from_score(mean + ci),
            100.0 * f64::from(filtered) / f64::from(moves.max(1)),
            loss as f64 / f64::from(verified.max(1)),
        ));
    }
    md
}

#[test]
#[ignore]
fn summarize() {
    let out = PathBuf::from(env("ONYX_LAB_OUT"));
    let all_records = read_records(&out);
    assert!(!all_records.is_empty(), "no results in {}", out.display());
    let (strength_records, records): (Vec<GameRecord>, Vec<GameRecord>) = all_records
        .into_iter()
        .partition(|record| record.style.starts_with("fuerza-"));
    if !strength_records.is_empty() {
        let md = strength_summary(&strength_records);
        std::fs::write(out.join("strength-summary.md"), &md).unwrap();
        println!("{md}");
    }
    if records.is_empty() {
        return;
    }

    type Metric = (&'static str, fn(&GameRecord) -> f64, u32);
    let metrics: [Metric; 10] = [
        (
            "Jaques/jugada (%)",
            |r| 100.0 * rate(r.styled.checks, r.styled.moves),
            1,
        ),
        (
            "Capturas/jugada (%)",
            |r| 100.0 * rate(r.styled.captures, r.styled.moves),
            1,
        ),
        (
            "Cambios/jugada (%)",
            |r| 100.0 * rate(r.styled.trades, r.styled.moves),
            1,
        ),
        (
            "Piezas atacadas tras su jugada",
            |r| r.styled.tension_sum as f64 / f64::from(r.styled.moves.max(1)),
            2,
        ),
        (
            "Material medio en el tablero",
            |r| f64::from(r.material_avg),
            1,
        ),
        ("Medias jugadas", |r| f64::from(r.plies), 0),
        (
            "Enroque (media jugada; 0 si no enroca)",
            |r| f64::from(r.styled.castled_ply.unwrap_or(0)),
            1,
        ),
        (
            "Prob. Maia de su jugada (%)",
            |r| 100.0 * f64::from(r.styled.maia_probability_sum) / f64::from(r.styled.moves.max(1)),
            1,
        ),
        (
            "Pérdida cp por jugada verificada",
            |r| r.styled.cp_loss_sum as f64 / f64::from(r.styled.verified_moves.max(1)),
            1,
        ),
        (
            "Puntuación contra el neutro (%)",
            |r| 100.0 * f64::from(r.styled_score),
            0,
        ),
    ];

    let mut groups: BTreeMap<u32, BTreeMap<String, Vec<&GameRecord>>> = BTreeMap::new();
    for record in &records {
        groups
            .entry(record.elo)
            .or_default()
            .entry(record.style.clone())
            .or_default()
            .push(record);
    }
    let order: Vec<&str> = PLAY_STYLES.iter().map(|(style, _)| *style).collect();
    let mut md = String::from("# Laboratorio de estilos — resultados\n\n");
    md.push_str(
        "Cada celda: media ± mitad del intervalo de confianza del 95 %, sobre las partidas.\n",
    );
    md.push_str(
        "Las métricas son del bot con estilo; `equilibrista` es la referencia sin estilo.\n\n",
    );
    for (elo, styles) in &groups {
        md.push_str(&format!("## Elo {elo}\n\n| Métrica |"));
        for style in &order {
            let n = styles.get(*style).map_or(0, Vec::len);
            md.push_str(&format!(" {style} (n={n}) |"));
        }
        md.push_str("\n|---|");
        md.push_str(&"---|".repeat(order.len()));
        md.push('\n');
        for (name, metric, decimals) in &metrics {
            md.push_str(&format!("| {name} |"));
            for style in &order {
                let values: Vec<f64> = styles
                    .get(*style)
                    .map(|games| games.iter().map(|game| metric(game)).collect())
                    .unwrap_or_default();
                let (mean, ci) = mean_ci(&values);
                let d = *decimals as usize;
                md.push_str(&format!(" {mean:.d$} ± {ci:.d$} |"));
            }
            md.push('\n');
        }
        md.push_str("| Elo frente al neutro |");
        for style in &order {
            let scores: Vec<f64> = styles
                .get(*style)
                .map(|games| games.iter().map(|g| f64::from(g.styled_score)).collect())
                .unwrap_or_default();
            let (mean, ci) = mean_ci(&scores);
            md.push_str(&format!(
                " {:+.0} ({:+.0} a {:+.0}) |",
                elo_from_score(mean),
                elo_from_score(mean - ci),
                elo_from_score(mean + ci)
            ));
        }
        md.push_str("\n\n");
        let durations: Vec<f64> = styles
            .values()
            .flatten()
            .map(|g| g.duration_ms as f64 / 1000.0)
            .collect();
        let (mean, _) = mean_ci(&durations);
        md.push_str(&format!(
            "{} partidas, {mean:.1} s de media por partida (sin contar el paralelismo).\n\n",
            durations.len()
        ));
    }
    std::fs::write(out.join("summary.md"), &md).unwrap();
    println!("{md}");

    // Blind set: two games per style and Elo, shuffled, with the names hidden.
    let mut rng = StdRng::seed_from_u64(20261017);
    let mut picked: Vec<&GameRecord> = Vec::new();
    for styles in groups.values() {
        for style in &order {
            if let Some(games) = styles.get(*style) {
                let mut games = games.clone();
                games.shuffle(&mut rng);
                picked.extend(games.into_iter().take(2));
            }
        }
    }
    picked.shuffle(&mut rng);
    let mut blind = String::new();
    let mut key = String::from(
        "# Clave de la prueba a ciegas\n\n| Partida | Estilo | Color del estilo |\n|---|---|---|\n",
    );
    for (index, record) in picked.iter().enumerate() {
        let label = format!("Partida {}", index + 1);
        let (white, black) = if record.styled_white {
            ("Bot X", "Rival")
        } else {
            ("Rival", "Bot X")
        };
        let movetext = record.pgn.split("\n\n").nth(1).unwrap_or("");
        blind.push_str(&format!(
            "[Event \"{label}\"]\n[White \"{white} {}\"]\n[Black \"{black} {}\"]\n[Result \"{}\"]\n\n{movetext}\n",
            record.elo, record.elo, record.result
        ));
        key.push_str(&format!(
            "| {} | {} | {} |\n",
            index + 1,
            record.style,
            if record.styled_white {
                "blancas"
            } else {
                "negras"
            }
        ));
    }
    std::fs::write(out.join("blind.pgn"), blind).unwrap();
    std::fs::write(out.join("blind-key.md"), key).unwrap();
}
