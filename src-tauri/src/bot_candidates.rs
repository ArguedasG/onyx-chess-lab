//! Candidate moves of a human bot: Maia's probability for each legal move, and Stockfish's
//! evaluation of the ones worth playing.
//!
//! Maia's own UCI interface orders its candidates but does not print their probabilities. Onyx
//! launches Maia through `resources/maia/onyx_maia_policy.py`, which runs the same engine and adds
//! an `info string onyx-policy v1 <uci>:<p> ...` line before every `bestmove`. A Maia without the
//! wrapper still plays: its `bestmove` arrives with no policy and the caller falls back to it.
//!
//! The style (I-47) and strength (I-48) of the bots are built on these two primitives.

use std::path::{Path, PathBuf};

use vampirc_uci::{uci::ScoreValue, UciInfoAttribute, UciMessage};

use crate::{
    engine::{BaseEngine, GoMode},
    error::Error,
};

pub const POLICY_SCRIPT: &str = include_str!("../resources/maia/onyx_maia_policy.py");
const POLICY_SCRIPT_FILENAME: &str = "onyx_maia_policy.py";
const POLICY_PREFIX: &str = "info string onyx-policy v1";
/// Launchers the wrapper can stand in for (`maia3.presets._LAUNCHER_NAMES`).
const MAIA_LAUNCHERS: [&str; 4] = ["maia3-3m-ablation", "maia3-5m", "maia3-23m", "maia3-79m"];
/// Mate scores rank above any centipawn score, nearer mates first.
const MATE_CP: i32 = 100_000;

#[derive(Debug, Clone, PartialEq)]
pub struct MaiaCandidate {
    pub uci: String,
    pub probability: f32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct VerifiedCandidate {
    pub uci: String,
    /// From the side to move.
    pub score: ScoreValue,
    pub depth: u32,
}

/// How to start a Maia launcher (`.venv/Scripts/maia3-5m.exe`) through the policy wrapper: the
/// Python of the same environment running the script, written to `scripts_dir` if it changed.
/// `None` when the engine is not a Maia 3 launcher with its Python next to it.
pub fn policy_launch(
    engine_path: &Path,
    args: &[String],
    scripts_dir: &Path,
) -> Result<Option<(PathBuf, Vec<String>)>, Error> {
    let Some(launcher) = maia_launcher_name(engine_path) else {
        return Ok(None);
    };
    let Some(python) = engine_path
        .parent()
        .map(|dir| {
            dir.join(if cfg!(windows) {
                "python.exe"
            } else {
                "python"
            })
        })
        .filter(|python| python.is_file())
    else {
        return Ok(None);
    };
    let script = scripts_dir.join(POLICY_SCRIPT_FILENAME);
    if std::fs::read_to_string(&script).ok().as_deref() != Some(POLICY_SCRIPT) {
        // Written aside and renamed, so a Maia starting at the same time never reads half a file.
        std::fs::create_dir_all(scripts_dir)?;
        let pending = tempfile::NamedTempFile::new_in(scripts_dir)?;
        std::fs::write(pending.path(), POLICY_SCRIPT)?;
        if let Err(error) = pending.persist(&script) {
            // Another launch replaced it first; that copy is just as good.
            if std::fs::read_to_string(&script).ok().as_deref() != Some(POLICY_SCRIPT) {
                return Err(error.error.into());
            }
        }
    }
    let mut launch_args = vec![
        "-I".to_string(),
        script.display().to_string(),
        "--onyx-preset".to_string(),
        launcher.to_string(),
    ];
    launch_args.extend(args.iter().cloned());
    Ok(Some((python, launch_args)))
}

fn maia_launcher_name(engine_path: &Path) -> Option<&'static str> {
    let stem = engine_path.file_stem()?.to_str()?.to_lowercase();
    MAIA_LAUNCHERS
        .into_iter()
        .find(|launcher| *launcher == stem)
}

/// The moves of an `onyx-policy` line, most likely first.
pub fn parse_policy_line(line: &str) -> Option<Vec<MaiaCandidate>> {
    let entries = line.strip_prefix(POLICY_PREFIX)?;
    let mut candidates: Vec<MaiaCandidate> = entries
        .split_whitespace()
        .filter_map(|entry| {
            let (uci, probability) = entry.split_once(':')?;
            let probability: f32 = probability.parse().ok()?;
            (probability.is_finite() && probability >= 0.0).then(|| MaiaCandidate {
                uci: uci.to_string(),
                probability,
            })
        })
        .collect();
    candidates.sort_by(|left, right| right.probability.total_cmp(&left.probability));
    Some(candidates)
}

/// Waits for Maia's `bestmove` after a `go`, with the policy when the wrapper printed one.
pub async fn wait_for_maia_move(
    engine: &mut BaseEngine,
) -> Result<(String, Option<Vec<MaiaCandidate>>), Error> {
    let mut policy = None;
    loop {
        let line = engine
            .reader_mut()
            .ok_or(Error::EngineDisconnected)?
            .next_line()
            .await?
            .ok_or(Error::EngineDisconnected)?;
        engine.log_engine(&line);
        if let Some(candidates) = parse_policy_line(&line) {
            policy = Some(candidates);
        } else if let UciMessage::BestMove { best_move, .. } = vampirc_uci::parse_one(&line) {
            return Ok((best_move.to_string(), policy));
        }
    }
}

/// The most likely moves until `mass` of the probability is covered, at most `max`.
pub fn top_candidates(candidates: &[MaiaCandidate], mass: f32, max: usize) -> Vec<MaiaCandidate> {
    let mut covered = 0.0;
    let mut result = Vec::new();
    for candidate in candidates.iter().take(max) {
        if covered >= mass && !result.is_empty() {
            break;
        }
        covered += candidate.probability;
        result.push(candidate.clone());
    }
    result
}

/// Evaluates only `candidates` with one Stockfish search (`MultiPV` = their number,
/// `searchmoves`), best first. `limit` must not be `Infinite`. Leaves `MultiPV` at the number of
/// candidates: callers that share the process set it again.
pub async fn verify_candidates(
    engine: &mut BaseEngine,
    fen: &str,
    moves: &[String],
    candidates: &[String],
    limit: &GoMode,
) -> Result<Vec<VerifiedCandidate>, Error> {
    if candidates.is_empty() {
        return Ok(Vec::new());
    }
    if matches!(limit, GoMode::Infinite) {
        return Err(Error::InvalidRequest(
            "Candidate verification needs a finite limit".to_string(),
        ));
    }
    engine.set_option("MultiPV", candidates.len()).await?;
    engine.set_position(fen, moves).await?;
    // `searchmoves` consumes every token after it, so it goes last.
    engine
        .send(&format!(
            "{} searchmoves {}",
            limit.to_uci_string(),
            candidates.join(" ")
        ))
        .await?;

    let mut lines: Vec<VerifiedCandidate> = Vec::new();
    loop {
        let line = engine
            .reader_mut()
            .ok_or(Error::EngineDisconnected)?
            .next_line()
            .await?
            .ok_or(Error::EngineDisconnected)?;
        engine.log_engine(&line);
        match vampirc_uci::parse_one(&line) {
            UciMessage::Info(attrs) => {
                if let Some(verified) = verified_line(&attrs) {
                    match lines.iter_mut().find(|known| known.uci == verified.uci) {
                        Some(known) if known.depth <= verified.depth => *known = verified,
                        Some(_) => {}
                        None => lines.push(verified),
                    }
                }
            }
            UciMessage::BestMove { .. } => break,
            _ => {}
        }
    }
    lines.sort_by_key(|line| std::cmp::Reverse(score_to_cp(&line.score)));
    Ok(lines)
}

/// First move, exact score and depth of an `info` line; bounds and lines without a pv are ignored.
fn verified_line(attrs: &[UciInfoAttribute]) -> Option<VerifiedCandidate> {
    let mut uci = None;
    let mut score = None;
    let mut depth = 0;
    for attr in attrs {
        match attr {
            UciInfoAttribute::Pv(pv) => uci = pv.first().map(|first| first.to_string()),
            UciInfoAttribute::Score(value)
                if value.lower_bound != Some(true) && value.upper_bound != Some(true) =>
            {
                score = Some(value.value.clone());
            }
            UciInfoAttribute::Depth(value) => depth = *value,
            _ => {}
        }
    }
    Some(VerifiedCandidate {
        uci: uci?,
        score: score?,
        depth,
    })
}

/// A score as comparable centipawns from the side to move.
pub fn score_to_cp(score: &ScoreValue) -> i32 {
    match score {
        ScoreValue::Cp(cp) => *cp,
        ScoreValue::Mate(moves) if *moves > 0 => MATE_CP - *moves,
        ScoreValue::Mate(moves) => -MATE_CP - *moves,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn policy_line_is_parsed_most_likely_first() {
        let candidates =
            parse_policy_line("info string onyx-policy v1 e2e4:0.20000 d2d4:0.50000 bad g1f3:x")
                .unwrap();
        assert_eq!(
            candidates,
            vec![
                MaiaCandidate {
                    uci: "d2d4".into(),
                    probability: 0.5
                },
                MaiaCandidate {
                    uci: "e2e4".into(),
                    probability: 0.2
                },
            ]
        );
        assert!(parse_policy_line("info depth 1 multipv 1 score cp 20 pv e2e4").is_none());
    }

    #[test]
    fn top_candidates_stop_at_the_requested_mass_or_count() {
        let candidates =
            parse_policy_line("info string onyx-policy v1 a2a3:0.6 b2b3:0.25 c2c3:0.1 d2d3:0.05")
                .unwrap();
        let moves = |list: Vec<MaiaCandidate>| list.into_iter().map(|c| c.uci).collect::<Vec<_>>();
        assert_eq!(
            moves(top_candidates(&candidates, 0.8, 10)),
            ["a2a3", "b2b3"]
        );
        assert_eq!(
            moves(top_candidates(&candidates, 0.99, 3)),
            ["a2a3", "b2b3", "c2c3"]
        );
        assert_eq!(moves(top_candidates(&candidates, 0.1, 10)), ["a2a3"]);
    }

    #[test]
    fn mates_rank_above_centipawns_and_nearer_mates_first() {
        let mut scores = [
            ScoreValue::Cp(900),
            ScoreValue::Mate(3),
            ScoreValue::Mate(-2),
            ScoreValue::Mate(1),
            ScoreValue::Cp(-50),
            ScoreValue::Mate(-5),
        ];
        scores.sort_by_key(|score| std::cmp::Reverse(score_to_cp(score)));
        assert_eq!(
            scores,
            [
                ScoreValue::Mate(1),
                ScoreValue::Mate(3),
                ScoreValue::Cp(900),
                ScoreValue::Cp(-50),
                ScoreValue::Mate(-5),
                ScoreValue::Mate(-2),
            ]
        );
    }

    #[test]
    fn only_maia_launchers_with_their_python_use_the_wrapper() {
        let dir = tempfile::tempdir().unwrap();
        let scripts = dir.path().join("scripts");
        let launcher = dir.path().join(if cfg!(windows) {
            "maia3-5m.exe"
        } else {
            "maia3-5m"
        });
        std::fs::write(&launcher, "").unwrap();
        let args = vec!["--seed".to_string(), "1".to_string()];

        // No Python next to the launcher.
        assert!(policy_launch(&launcher, &args, &scripts).unwrap().is_none());

        let python = dir.path().join(if cfg!(windows) {
            "python.exe"
        } else {
            "python"
        });
        std::fs::write(&python, "").unwrap();
        let (program, launch_args) = policy_launch(&launcher, &args, &scripts).unwrap().unwrap();
        assert_eq!(program, python);
        assert_eq!(launch_args[0], "-I");
        assert_eq!(
            launch_args[2..],
            ["--onyx-preset", "maia3-5m", "--seed", "1"]
        );
        assert_eq!(
            std::fs::read_to_string(scripts.join(POLICY_SCRIPT_FILENAME)).unwrap(),
            POLICY_SCRIPT
        );

        let stockfish = dir.path().join("stockfish.exe");
        assert!(policy_launch(&stockfish, &args, &scripts)
            .unwrap()
            .is_none());
    }

    /// Real engines, for latency: set `ONYX_MAIA_PATH` (a `maia3-5m` launcher), `ONYX_MAIA_ARGS`
    /// (its arguments separated by `|`) and `ONYX_STOCKFISH_PATH`, then run with `--ignored
    /// --nocapture`.
    #[tokio::test]
    #[ignore]
    async fn real_engines_report_and_verify_candidates() {
        let maia_path = PathBuf::from(std::env::var("ONYX_MAIA_PATH").unwrap());
        let maia_args: Vec<String> = std::env::var("ONYX_MAIA_ARGS")
            .unwrap()
            .split('|')
            .map(str::to_string)
            .collect();
        let stockfish_path = PathBuf::from(std::env::var("ONYX_STOCKFISH_PATH").unwrap());
        let scripts = tempfile::tempdir().unwrap();

        let (program, args) = policy_launch(&maia_path, &maia_args, scripts.path())
            .unwrap()
            .expect("the Maia launcher has its Python next to it");
        let mut maia = BaseEngine::spawn(program, &args).await.unwrap();
        maia.init_uci().await.unwrap();
        maia.set_option("Elo", 1800).await.unwrap();
        let mut stockfish = BaseEngine::spawn(stockfish_path, &[]).await.unwrap();
        stockfish.init_uci().await.unwrap();
        stockfish.set_option("Threads", 1).await.unwrap();
        stockfish.set_option("Hash", 32).await.unwrap();

        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let line: Vec<String> = "e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 d2d3 f8c5 c2c3 d7d6 e1g1 e8g8"
            .split(' ')
            .map(str::to_string)
            .collect();
        for limit in [GoMode::Time(100), GoMode::Time(250), GoMode::Depth(14)] {
            let mut maia_ms = Vec::new();
            let mut stockfish_ms = Vec::new();
            for ply in 1..=line.len() {
                let moves = &line[..ply];
                let started = std::time::Instant::now();
                maia.set_position(fen, moves).await.unwrap();
                maia.go(&GoMode::Nodes(1)).await.unwrap();
                let (_, policy) = wait_for_maia_move(&mut maia).await.unwrap();
                maia_ms.push(started.elapsed().as_millis());
                let policy = policy.expect("the wrapper prints the policy");
                let total: f32 = policy.iter().map(|c| c.probability).sum();
                assert!((total - 1.0).abs() < 0.01, "probabilities sum to {total}");

                let top: Vec<String> = top_candidates(&policy, 0.9, 6)
                    .into_iter()
                    .map(|c| c.uci)
                    .collect();
                let started = std::time::Instant::now();
                let verified = verify_candidates(&mut stockfish, fen, moves, &top, &limit)
                    .await
                    .unwrap();
                stockfish_ms.push(started.elapsed().as_millis());
                assert_eq!(verified.len(), top.len());
                if ply == line.len() {
                    println!("{limit:?}: candidates {top:?} -> {verified:?}");
                }
            }
            maia_ms.sort();
            stockfish_ms.sort();
            println!(
                "{limit:?}: Maia median {} ms, Stockfish median {} ms, max {} ms",
                maia_ms[maia_ms.len() / 2],
                stockfish_ms[stockfish_ms.len() / 2],
                stockfish_ms[stockfish_ms.len() - 1]
            );
        }
        maia.kill_sync();
        stockfish.kill_sync();
    }
}
