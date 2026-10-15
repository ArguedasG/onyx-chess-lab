//! Reproducible benchmark of game analysis (phase 8.2, idea I-14): time and agreement of the
//! classification of mistakes between search limits, parallel processes and the cache.
//!
//! It is an ignored test that needs a real engine and a PGN:
//!
//! ```text
//! ONYX_BENCH_ENGINE=<stockfish.exe> ONYX_BENCH_PGN=<games.pgn> ONYX_BENCH_GAMES=10 \
//!   cargo test --release analysis_benchmark -- --ignored --nocapture
//! ```
//!
//! Every configuration analyzes the same games. Moves are classified like the game report
//! (loss of winning chances of more than 5, 10 and 20 points: ?!, ?, ??) and compared with the
//! reference configuration. The reference is also run twice, because a timed search is not
//! deterministic: the agreement between those two runs is the noise floor any other
//! configuration has to be judged against.

use std::{
    path::{Path, PathBuf},
    sync::atomic::AtomicBool,
    time::Instant,
};

use shakmaty::{fen::Fen, san::San, uci::UciMove, CastlingMode, Chess, EnPassantMode, Position};

use crate::{
    analysis_cache::AnalysisCache,
    chess::{analyze_positions, refine_positions, refinement_targets, AnalysisRun, MoveAnalysis},
    engine::{DepthTime, EngineOption, GoMode},
};

const START_FEN: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const CP_CEILING: f64 = 1000.0;

/// Main-line UCI moves of each game of a PGN without a custom start position.
pub fn pgn_games(pgn: &str, wanted: usize, min_plies: usize, max_plies: usize) -> Vec<Vec<String>> {
    let mut games = Vec::new();
    for record in pgn.split("\n[Event ").skip(1) {
        if record.contains("[SetUp \"1\"]") || record.contains("[FEN ") {
            continue;
        }
        let Some(body) = record.split("\n\n").nth(1) else {
            continue;
        };
        // Comments ({...}) never nest in exported games; variations are not expected.
        let mut text = String::new();
        let mut depth = 0;
        for ch in body.chars() {
            match ch {
                '{' | '(' => depth += 1,
                '}' | ')' => depth -= 1,
                _ if depth == 0 => text.push(ch),
                _ => {}
            }
        }
        let mut position = Chess::default();
        let mut moves = Vec::new();
        for token in text.split_whitespace() {
            let token = token.trim_start_matches(|ch: char| ch.is_ascii_digit() || ch == '.');
            if token.is_empty() || ["1-0", "0-1", "1/2-1/2", "*"].contains(&token) {
                continue;
            }
            let Ok(san) = token.parse::<San>() else {
                break;
            };
            let Ok(chess_move) = san.to_move(&position) else {
                break;
            };
            moves.push(UciMove::from_move(&chess_move, CastlingMode::Standard).to_string());
            position.play_unchecked(&chess_move);
        }
        if (min_plies..=max_plies).contains(&moves.len()) {
            games.push(moves);
            if games.len() == wanted {
                break;
            }
        }
    }
    games
}

/// Positions analyzed for a game, as `analyze_game` builds them (finished positions are left out).
fn game_positions(moves: &[String]) -> Vec<(Fen, Vec<String>)> {
    let mut position = Chess::default();
    let mut positions = vec![(
        Fen::from_position(position.clone(), EnPassantMode::Legal),
        vec![],
    )];
    for (index, uci) in moves.iter().enumerate() {
        let chess_move = uci.parse::<UciMove>().unwrap().to_move(&position).unwrap();
        position.play_unchecked(&chess_move);
        if !position.is_game_over() {
            positions.push((
                Fen::from_position(position.clone(), EnPassantMode::Legal),
                moves[..=index].to_vec(),
            ));
        }
    }
    positions
}

fn win_chance(cp: f64) -> f64 {
    50.0 + 50.0 * (2.0 / (1.0 + (-0.003_682_08 * cp).exp()) - 1.0)
}

/// White's evaluation in centipawns, mates at the ceiling, like the frontend.
fn white_cp(analysis: &MoveAnalysis) -> Option<f64> {
    let line = analysis.best.first()?;
    let (mate, value) = line.score_value();
    Some(if mate {
        CP_CEILING * (value as f64).signum()
    } else {
        (value as f64).clamp(-CP_CEILING, CP_CEILING)
    })
}

/// 0 = fine, 1 = ?!, 2 = ?, 3 = ?? for each move whose positions before and after were analyzed.
pub fn classify(analysis: &[MoveAnalysis]) -> Vec<Option<u8>> {
    (0..analysis.len().saturating_sub(1))
        .map(|ply| {
            let before = white_cp(&analysis[ply])?;
            let after = white_cp(&analysis[ply + 1])?;
            let sign = if ply % 2 == 0 { 1.0 } else { -1.0 };
            let loss = win_chance(sign * before) - win_chance(sign * after);
            Some(match loss {
                loss if loss > 20.0 => 3,
                loss if loss > 10.0 => 2,
                loss if loss > 5.0 => 1,
                _ => 0,
            })
        })
        .collect()
}

#[derive(Debug, Default)]
pub struct Agreement {
    /// Mistakes and blunders (?, ??) of the reference.
    pub reference_errors: usize,
    pub candidate_errors: usize,
    /// Mistakes and blunders found by both.
    pub shared_errors: usize,
    pub blunders_reference: usize,
    pub blunders_shared: usize,
    /// Moves with the very same class.
    pub same_class: usize,
    pub moves: usize,
}

impl Agreement {
    pub fn recall(&self) -> f64 {
        self.shared_errors as f64 / self.reference_errors.max(1) as f64
    }
    pub fn precision(&self) -> f64 {
        self.shared_errors as f64 / self.candidate_errors.max(1) as f64
    }
}

pub fn agreement(reference: &[Vec<Option<u8>>], candidate: &[Vec<Option<u8>>]) -> Agreement {
    let mut result = Agreement::default();
    for (a, b) in reference.iter().zip(candidate) {
        for (a, b) in a.iter().zip(b) {
            let (Some(a), Some(b)) = (a, b) else {
                continue;
            };
            result.moves += 1;
            result.same_class += usize::from(a == b);
            result.reference_errors += usize::from(*a >= 2);
            result.candidate_errors += usize::from(*b >= 2);
            result.shared_errors += usize::from(*a >= 2 && *b >= 2);
            result.blunders_reference += usize::from(*a == 3);
            result.blunders_shared += usize::from(*a == 3 && *b >= 2);
        }
    }
    result
}

struct Config {
    name: &'static str,
    go_mode: GoMode,
    threads: u32,
    processes: usize,
    cache: bool,
    /// Second pass on the doubtful moves, as `AnalysisOptions::refine`.
    refine: Option<GoMode>,
}

async fn run_config(
    engine: &Path,
    games: &[Vec<String>],
    config: &Config,
    cache_path: Option<&Path>,
) -> (f64, Vec<Vec<Option<u8>>>, usize) {
    let started = Instant::now();
    let options = vec![
        EngineOption {
            name: "Threads".to_string(),
            value: config.threads.to_string(),
        },
        EngineOption {
            name: "Hash".to_string(),
            value: "64".to_string(),
        },
        EngineOption {
            name: "MultiPV".to_string(),
            value: "2".to_string(),
        },
    ];
    let mut classes = vec![Vec::new(); games.len()];
    let mut hits = 0;
    let chunks: Vec<Vec<usize>> = (0..config.processes)
        .map(|worker| (worker..games.len()).step_by(config.processes).collect())
        .collect();
    let mut tasks = tokio::task::JoinSet::new();
    for chunk in chunks {
        let engine = engine.to_path_buf();
        let go_mode = config.go_mode.clone();
        let refine = config.refine.clone();
        let options = options.clone();
        let games: Vec<(usize, Vec<String>)> = chunk
            .iter()
            .map(|&index| (index, games[index].clone()))
            .collect();
        let cache_path: Option<PathBuf> = cache_path.map(Path::to_path_buf);
        tasks.spawn(async move {
            let cache = cache_path.map(|path| AnalysisCache::open(&path).unwrap());
            let mut results = Vec::new();
            let mut hits = 0;
            for (index, moves) in games {
                let positions = game_positions(&moves);
                let run = AnalysisRun {
                    engine: &engine,
                    engine_args: &[],
                    go_mode: &go_mode,
                    uci_options: &options,
                    start_fen: START_FEN,
                    cache: cache.as_ref(),
                };
                let (mut analysis, stats) =
                    analyze_positions(&run, &positions, &AtomicBool::new(false), &mut |_| {})
                        .await
                        .unwrap();
                hits += stats.cache_hits;
                if let Some(refine) = refine.as_ref() {
                    let white_to_move: Vec<bool> = positions
                        .iter()
                        .map(|(fen, _)| fen.as_setup().turn == shakmaty::Color::White)
                        .collect();
                    let targets = refinement_targets(&analysis, &white_to_move);
                    refine_positions(
                        &run,
                        refine,
                        &positions,
                        &mut analysis,
                        &targets,
                        &AtomicBool::new(false),
                        &mut |_| {},
                    )
                    .await
                    .unwrap();
                }
                results.push((index, classify(&analysis)));
            }
            (results, hits)
        });
    }
    while let Some(result) = tasks.join_next().await {
        let (results, worker_hits) = result.unwrap();
        hits += worker_hits;
        for (index, class) in results {
            classes[index] = class;
        }
    }
    (started.elapsed().as_secs_f64(), classes, hits)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "needs ONYX_BENCH_ENGINE and ONYX_BENCH_PGN"]
async fn analysis_benchmark() {
    let (Ok(engine), Ok(pgn)) = (
        std::env::var("ONYX_BENCH_ENGINE"),
        std::env::var("ONYX_BENCH_PGN"),
    ) else {
        eprintln!("ONYX_BENCH_ENGINE / ONYX_BENCH_PGN not set; skipping");
        return;
    };
    let wanted = std::env::var("ONYX_BENCH_GAMES")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(10);
    let pgn = std::fs::read_to_string(pgn).unwrap();
    let games = pgn_games(&pgn, wanted, 40, 120);
    let plies: usize = games.iter().map(Vec::len).sum();
    println!("games: {} · plies: {plies}", games.len());
    let engine = PathBuf::from(engine);
    let budget = crate::engine_budget::budget_for(
        std::thread::available_parallelism()
            .map(|n| n.get() as u32)
            .unwrap_or(2),
        4,
        16_000,
    );

    // `ONYX_BENCH_SUITE=refine` compares the default and the second pass with a much stronger
    // reference (2 s per move) instead of with the default itself.
    let refine_suite = std::env::var("ONYX_BENCH_SUITE").is_ok_and(|suite| suite == "refine");
    let deep = || {
        Some(GoMode::DepthTime(DepthTime {
            depth: 22,
            time: 1500,
        }))
    };
    let refine_configs = [
        Config {
            name: "strong reference: time 2000 ms",
            go_mode: GoMode::Time(2000),
            threads: 2,
            processes: 1,
            cache: false,
            refine: None,
        },
        Config {
            name: "report default: time 500 ms",
            go_mode: GoMode::Time(500),
            threads: 2,
            processes: 1,
            cache: false,
            refine: None,
        },
        Config {
            name: "time 500 ms + second pass",
            go_mode: GoMode::Time(500),
            threads: 2,
            processes: 1,
            cache: false,
            refine: deep(),
        },
        Config {
            name: "Player Analysis default: time 250 ms",
            go_mode: GoMode::Time(250),
            threads: 2,
            processes: 1,
            cache: false,
            refine: None,
        },
        Config {
            name: "time 250 ms + second pass",
            go_mode: GoMode::Time(250),
            threads: 2,
            processes: 1,
            cache: false,
            refine: deep(),
        },
    ];
    let configs = [
        Config {
            name: "reference: time 500 ms, 2 threads",
            go_mode: GoMode::Time(500),
            threads: 2,
            processes: 1,
            cache: false,
            refine: None,
        },
        Config {
            name: "reference again (noise floor)",
            go_mode: GoMode::Time(500),
            threads: 2,
            processes: 1,
            cache: false,
            refine: None,
        },
        Config {
            name: "Player Analysis default: time 250 ms",
            go_mode: GoMode::Time(250),
            threads: 2,
            processes: 1,
            cache: false,
            refine: None,
        },
        Config {
            name: "depth 16, cap 500 ms",
            go_mode: GoMode::DepthTime(DepthTime {
                depth: 16,
                time: 500,
            }),
            threads: 2,
            processes: 1,
            cache: false,
            refine: None,
        },
        Config {
            name: "depth 18, cap 1000 ms",
            go_mode: GoMode::DepthTime(DepthTime {
                depth: 18,
                time: 1000,
            }),
            threads: 2,
            processes: 1,
            cache: false,
            refine: None,
        },
        Config {
            name: "time 500 ms, budget processes in parallel",
            go_mode: GoMode::Time(500),
            threads: budget.threads_per_process,
            processes: budget.batch_processes as usize,
            cache: false,
            refine: None,
        },
        Config {
            name: "time 500 ms, 2 processes x 2 threads",
            go_mode: GoMode::Time(500),
            threads: 2,
            processes: 2,
            cache: false,
            refine: None,
        },
        Config {
            name: "time 500 ms, cache (cold, then warm)",
            go_mode: GoMode::Time(500),
            threads: 2,
            processes: 1,
            cache: true,
            refine: None,
        },
    ];

    let cache_dir = tempfile::tempdir().unwrap();
    let cache_path = cache_dir.path().join("bench-cache.sqlite");
    // `ONYX_BENCH_ONLY=parallel,processes` runs the reference plus the configurations whose name
    // contains one of the words.
    let only: Vec<String> = std::env::var("ONYX_BENCH_ONLY")
        .map(|value| value.split(',').map(str::to_string).collect())
        .unwrap_or_default();
    let mut reference: Option<Vec<Vec<Option<u8>>>> = None;
    let configs: &[Config] = if refine_suite {
        &refine_configs
    } else {
        &configs
    };
    for (index, config) in configs.iter().enumerate() {
        if index > 0
            && !only.is_empty()
            && !only.iter().any(|word| config.name.contains(word.as_str()))
        {
            continue;
        }
        let cache = config.cache.then_some(cache_path.as_path());
        let (seconds, classes, hits) = run_config(&engine, &games, config, cache).await;
        let line = |label: &str, seconds: f64, classes: &[Vec<Option<u8>>], hits: usize| {
            let summary = reference
                .as_ref()
                .map(|reference| agreement(reference, classes))
                .map(|a| {
                    format!(
                        "errors recall {:.1}% precision {:.1}% · blunders kept {}/{} · same class {:.1}%",
                        a.recall() * 100.0,
                        a.precision() * 100.0,
                        a.blunders_shared,
                        a.blunders_reference,
                        a.same_class as f64 / a.moves.max(1) as f64 * 100.0
                    )
                })
                .unwrap_or_else(|| {
                    let errors: usize =
                        classes.iter().flatten().flatten().filter(|c| **c >= 2).count();
                    format!("reference: {errors} mistakes and blunders")
                });
            println!(
                "{label:<46} {seconds:>7.1} s · {:>5.1} ms/ply · cache hits {hits:>4} · {summary}",
                seconds * 1000.0 / plies.max(1) as f64
            );
        };
        line(config.name, seconds, &classes, hits);
        if config.cache {
            let (seconds, classes, hits) = run_config(&engine, &games, config, cache).await;
            line("  … same games again, warm cache", seconds, &classes, hits);
        }
        if reference.is_none() {
            reference = Some(classes);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_main_lines_and_skips_custom_starts() {
        let pgn = "\n[Event \"a\"]\n[Result \"1-0\"]\n\n1. e4 {[%clk 0:01:00]} 1... e5 2. Nf3 Nc6 1-0\n\
                   \n[Event \"b\"]\n[SetUp \"1\"]\n[FEN \"8/8/8/8/8/8/8/K6k w - - 0 1\"]\n\n1. Ka2 *\n";
        let games = pgn_games(pgn, 5, 1, 100);
        assert_eq!(games, vec![vec!["e2e4", "e7e5", "g1f3", "b8c6"]]);
    }

    #[test]
    fn agreement_counts_shared_mistakes() {
        let reference = vec![vec![Some(0), Some(3), Some(2), None]];
        let candidate = vec![vec![Some(1), Some(2), Some(0), Some(3)]];
        let result = agreement(&reference, &candidate);
        assert_eq!(result.moves, 3);
        assert_eq!(result.reference_errors, 2);
        assert_eq!(result.shared_errors, 1);
        assert_eq!(result.blunders_shared, 1);
        assert!((result.recall() - 0.5).abs() < 1e-9);
    }
}
