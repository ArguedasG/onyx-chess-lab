//! The measured style of a player for their twin (I-43, 9.3).
//!
//! The twin plays like Maia at the player's rating; the question is whether the player's own moves
//! lean, compared with that, towards the two style axes the catalogue bots use (I-47): aggression
//! and simplification. For each move of theirs after the opening, Maia gives its probability for
//! every legal move at the player's rating and the traits of each move are measured on the board
//! (`bot_style::move_traits`). Two things come out:
//!
//! - **Deviations**: the average trait of the moves played minus the one Maia expected, with its
//!   standard error. They describe the player and need no model.
//! - **Weights**: the style weights that, applied to Maia's candidates as the bots apply them,
//!   make the moves played most likely in the older games, checked on the most recent ones, which
//!   were left out. The twin uses them only if they predict those games better than Maia alone.
//!
//! In play the style only moves probability among the candidates Stockfish keeps within a margin;
//! here, without Stockfish, the likely candidates stand for that group. It is an approximation of
//! the bot, stated as such.

use std::{
    path::PathBuf,
    sync::{atomic::AtomicBool, atomic::Ordering, Arc},
    time::Instant,
};

use diesel::prelude::*;
use log::info;
use serde::{Deserialize, Serialize};
use shakmaty::{uci::UciMove, Chess, Move, Position, Square};
use specta::Type;

use super::{
    encoding::{decode_move, iter_mainline_move_bytes},
    get_db_or_create,
    schema::games,
    ConnectionOptions,
};
use crate::{
    bot_candidates::{policy_launch, top_candidates, wait_for_maia_move, MaiaCandidate},
    bot_style::{move_traits, style_phase_factor, MoveTraits, StyleWeights, STYLE_STRENGTH},
    engine::{BaseEngine, GoMode},
    error::Error,
    progress::update_progress,
    AppState,
};

/// Moves of the player looked at in a game: from move 11 to move 40.
const FIRST_PLY: usize = 20;
const LAST_PLY: usize = 80;
/// Positions taken from one game at most, spread over it.
const PER_GAME: usize = 10;
/// The likely candidates stand for the group the style may reweigh in play.
const LIKELY_MASS: f32 = 0.9;
const LIKELY_MAX: usize = 6;
/// Probability given to a move Maia did not list (it lists every legal move with the wrapper).
const MISSING_PROBABILITY: f32 = 1e-4;
/// Grid of weights tried for each axis.
const GRID: [f32; 9] = [-1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0];
const START_FEN: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
/// Log-likelihood per move the style must gain on the held-out games to be used.
const MIN_GAIN: f64 = 0.002;

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StyleGameRef {
    /// Database of the game: a player's games can come from several (Lichess, Chess.com…).
    pub file: PathBuf,
    pub id: i32,
    pub player_white: bool,
    pub opponent_elo: Option<i32>,
    /// One of the most recent games, left out to check the weights.
    pub test: bool,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlayerStyleRequest {
    /// Progress and cancellation id (`cancel_analysis`).
    pub id: String,
    pub games: Vec<StyleGameRef>,
    pub maia_path: String,
    pub maia_args: Vec<String>,
    /// Maia's rating for the player (already within Maia's range).
    pub elo: u32,
    pub max_positions: u32,
}

#[derive(Debug, Clone, Default, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TraitDeviation {
    /// Average trait of the moves played and of Maia's expectation, per move.
    pub played: f32,
    pub expected: f32,
    pub delta: f32,
    pub std_error: f32,
}

#[derive(Debug, Clone, Default, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StyleFit {
    /// Average log-probability of the move played.
    pub log_likelihood: f64,
    /// Share of moves where the most likely move was the one played.
    pub top: f32,
}

#[derive(Debug, Clone, Default, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlayerStyleMeasurement {
    pub train_positions: u32,
    pub test_positions: u32,
    pub aggression: TraitDeviation,
    pub simplification: TraitDeviation,
    /// Best weights on the older games (from -1 to 1 each).
    pub weights_aggression: f32,
    pub weights_simplification: f32,
    /// Held-out games: Maia alone and Maia with the weights.
    pub maia: StyleFit,
    pub styled: StyleFit,
    /// The weights predict the held-out games better than Maia alone.
    pub improves: bool,
    pub cancelled: bool,
}

/// One move of the player with Maia's candidates.
struct Sample {
    probabilities: Vec<f32>,
    traits: Vec<MoveTraits>,
    likely: Vec<bool>,
    played: usize,
    phase: f32,
    test: bool,
}

/// A position of the player to measure: the moves from the start and the move played.
struct PositionToMeasure {
    moves: Vec<String>,
    played: String,
    opponent_elo: Option<i32>,
    test: bool,
}

fn positions_of_game(bytes: &[u8], game: &StyleGameRef) -> Vec<PositionToMeasure> {
    let mut chess = Chess::default();
    let mut moves: Vec<String> = Vec::new();
    let mut candidates = Vec::new();
    for (ply, byte) in iter_mainline_move_bytes(bytes).enumerate() {
        let Some(movement) = decode_move(byte, &chess) else {
            break;
        };
        let player_turn = (chess.turn() == shakmaty::Color::White) == game.player_white;
        if player_turn
            && (FIRST_PLY..LAST_PLY).contains(&ply)
            && !chess.is_check()
            && chess.legal_moves().len() > 1
        {
            candidates.push(PositionToMeasure {
                moves: moves.clone(),
                played: movement
                    .to_uci(shakmaty::CastlingMode::Standard)
                    .to_string(),
                opponent_elo: game.opponent_elo,
                test: game.test,
            });
        }
        moves.push(
            movement
                .to_uci(shakmaty::CastlingMode::Standard)
                .to_string(),
        );
        chess.play_unchecked(&movement);
    }
    // Spread over the game when there are more than `PER_GAME`.
    if candidates.len() > PER_GAME {
        let step = candidates.len() as f32 / PER_GAME as f32;
        let picked: Vec<usize> = (0..PER_GAME).map(|i| (i as f32 * step) as usize).collect();
        candidates = candidates
            .into_iter()
            .enumerate()
            .filter(|(index, _)| picked.contains(index))
            .map(|(_, position)| position)
            .collect();
    }
    candidates
}

/// The position after `moves` and where the last move captured.
fn replay(moves: &[String]) -> Option<(Chess, Option<Square>)> {
    let mut chess = Chess::default();
    let mut last: Option<Move> = None;
    for uci in moves {
        let movement = uci.parse::<UciMove>().ok()?.to_move(&chess).ok()?;
        chess.play_unchecked(&movement);
        last = Some(movement);
    }
    let recapture_on = last.filter(|m| m.is_capture()).map(|m| m.to());
    Some((chess, recapture_on))
}

fn sample_of(
    chess: &Chess,
    recapture_on: Option<Square>,
    policy: &[MaiaCandidate],
    played: &str,
    test: bool,
) -> Option<Sample> {
    let mut entries: Vec<(MaiaCandidate, MoveTraits)> = policy
        .iter()
        .filter_map(|candidate| {
            let m = candidate.uci.parse::<UciMove>().ok()?.to_move(chess).ok()?;
            Some((candidate.clone(), move_traits(chess, &m, recapture_on)))
        })
        .collect();
    let played_move = played.parse::<UciMove>().ok()?.to_move(chess).ok()?;
    let played_uci = played_move
        .to_uci(shakmaty::CastlingMode::Standard)
        .to_string();
    // Maia may write castling as the king taking the rook; compare as moves.
    let position = entries.iter().position(|(candidate, _)| {
        candidate
            .uci
            .parse::<UciMove>()
            .ok()
            .and_then(|uci| uci.to_move(chess).ok())
            .is_some_and(|m| m == played_move)
    });
    let played = match position {
        Some(index) => index,
        None => {
            entries.push((
                MaiaCandidate {
                    uci: played_uci,
                    probability: MISSING_PROBABILITY,
                },
                move_traits(chess, &played_move, recapture_on),
            ));
            entries.len() - 1
        }
    };
    let raw: Vec<MaiaCandidate> = entries.iter().map(|(c, _)| c.clone()).collect();
    let likely_moves = top_candidates(&raw, LIKELY_MASS, LIKELY_MAX);
    Some(Sample {
        likely: raw
            .iter()
            .map(|c| likely_moves.iter().any(|l| l.uci == c.uci))
            .collect(),
        probabilities: raw
            .iter()
            .map(|c| c.probability.max(MISSING_PROBABILITY))
            .collect(),
        traits: entries.iter().map(|(_, traits)| *traits).collect(),
        played,
        phase: style_phase_factor(chess),
        test,
    })
}

/// Probabilities of a sample with the style: the likely group keeps its mass and is reweighted
/// inside, as `bot_style::styled_probabilities` does with the verified group.
fn styled(sample: &Sample, weights: StyleWeights) -> Vec<f32> {
    let weights = StyleWeights {
        aggression: weights.aggression * sample.phase,
        simplification: weights.simplification * sample.phase,
    };
    let mut result = sample.probabilities.clone();
    let group: f32 = (0..result.len())
        .filter(|&i| sample.likely[i])
        .map(|i| result[i])
        .sum();
    let boosted: Vec<f32> = (0..result.len())
        .map(|i| {
            sample.probabilities[i] * (STYLE_STRENGTH * sample.traits[i].style_score(weights)).exp()
        })
        .collect();
    let boosted_group: f32 = (0..result.len())
        .filter(|&i| sample.likely[i])
        .map(|i| boosted[i])
        .sum();
    if group > 0.0 && boosted_group > 0.0 {
        for i in (0..result.len()).filter(|&i| sample.likely[i]) {
            result[i] = boosted[i] * group / boosted_group;
        }
    }
    let total: f32 = result.iter().sum();
    result.iter().map(|p| p / total).collect()
}

fn fit(samples: &[&Sample], weights: StyleWeights) -> StyleFit {
    if samples.is_empty() {
        return StyleFit::default();
    }
    let mut log_likelihood = 0.0_f64;
    let mut top = 0;
    for sample in samples {
        let probabilities = styled(sample, weights);
        log_likelihood += f64::from(probabilities[sample.played].max(1e-9)).ln();
        let best = probabilities
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.total_cmp(b.1))
            .map(|(index, _)| index);
        if best == Some(sample.played) {
            top += 1;
        }
    }
    StyleFit {
        log_likelihood: log_likelihood / samples.len() as f64,
        top: top as f32 / samples.len() as f32,
    }
}

fn deviation(samples: &[&Sample], trait_of: impl Fn(&MoveTraits) -> f32) -> TraitDeviation {
    if samples.is_empty() {
        return TraitDeviation::default();
    }
    let deltas: Vec<(f32, f32)> = samples
        .iter()
        .map(|sample| {
            let total: f32 = sample.probabilities.iter().sum();
            let expected: f32 = sample
                .probabilities
                .iter()
                .zip(&sample.traits)
                .map(|(p, traits)| p / total * trait_of(traits))
                .sum();
            (trait_of(&sample.traits[sample.played]), expected)
        })
        .collect();
    let n = deltas.len() as f32;
    let played = deltas.iter().map(|(p, _)| p).sum::<f32>() / n;
    let expected = deltas.iter().map(|(_, e)| e).sum::<f32>() / n;
    let delta = played - expected;
    let variance = deltas
        .iter()
        .map(|(p, e)| (p - e - delta).powi(2))
        .sum::<f32>()
        / (n - 1.0).max(1.0);
    TraitDeviation {
        played,
        expected,
        delta,
        std_error: (variance / n).sqrt(),
    }
}

/// Deviations, best weights on the training samples and their check on the test ones.
fn summarize(samples: &[Sample], cancelled: bool) -> PlayerStyleMeasurement {
    let (test, train): (Vec<&Sample>, Vec<&Sample>) =
        samples.iter().partition(|sample| sample.test);
    let all: Vec<&Sample> = samples.iter().collect();
    let mut best = (StyleWeights::NEUTRAL, f64::NEG_INFINITY);
    for aggression in GRID {
        for simplification in GRID {
            let weights = StyleWeights {
                aggression,
                simplification,
            };
            let score = fit(&train, weights).log_likelihood;
            if score > best.1 + 1e-9 {
                best = (weights, score);
            }
        }
    }
    let weights = best.0;
    let maia = fit(&test, StyleWeights::NEUTRAL);
    let styled_fit = fit(&test, weights);
    PlayerStyleMeasurement {
        train_positions: train.len() as u32,
        test_positions: test.len() as u32,
        aggression: deviation(&all, |traits| traits.aggression),
        simplification: deviation(&all, |traits| traits.simplification),
        weights_aggression: weights.aggression,
        weights_simplification: weights.simplification,
        improves: weights != StyleWeights::NEUTRAL
            && !test.is_empty()
            && styled_fit.log_likelihood > maia.log_likelihood + MIN_GAIN,
        maia,
        styled: styled_fit,
        cancelled,
    }
}

#[tauri::command]
#[specta::specta]
pub async fn measure_player_style(
    request: PlayerStyleRequest,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<PlayerStyleMeasurement, Error> {
    use tauri::Manager;
    let timer = Instant::now();
    let cancel = Arc::new(AtomicBool::new(false));
    state
        .analysis_cancel_flags
        .insert(request.id.clone(), cancel.clone());

    // The positions, read from the database first (quick), then measured with Maia.
    let positions: Vec<PositionToMeasure> = {
        let mut files: Vec<&PathBuf> = request.games.iter().map(|game| &game.file).collect();
        files.sort();
        files.dedup();
        let mut moves_by_game: std::collections::HashMap<(PathBuf, i32), Vec<u8>> =
            Default::default();
        for file in files {
            let db = &mut get_db_or_create(
                &state,
                file.to_str().unwrap_or_default(),
                ConnectionOptions::default(),
            )?;
            let ids: Vec<i32> = request
                .games
                .iter()
                .filter(|game| &game.file == file)
                .map(|game| game.id)
                .collect();
            let rows: Vec<(i32, Vec<u8>)> = games::table
                .filter(games::id.eq_any(&ids))
                .filter(games::fen.is_null())
                .select((games::id, games::moves))
                .load(db)?;
            for (id, bytes) in rows {
                moves_by_game.insert((file.clone(), id), bytes);
            }
        }
        let mut positions = Vec::new();
        for game in &request.games {
            if let Some(bytes) = moves_by_game.get(&(game.file.clone(), game.id)) {
                positions.extend(positions_of_game(bytes, game));
            }
        }
        // Keep the test share while capping the total.
        let cap = request.max_positions as usize;
        let test_cap = (cap / 4).max(1).min(cap);
        let (test, train): (Vec<_>, Vec<_>) = positions.into_iter().partition(|p| p.test);
        let mut kept: Vec<PositionToMeasure> = train.into_iter().take(cap - test_cap).collect();
        kept.extend(test.into_iter().take(test_cap));
        kept
    };

    let scripts_dir = app.path().app_data_dir()?.join("scripts");
    let Some((program, args)) = policy_launch(
        std::path::Path::new(&request.maia_path),
        &request.maia_args,
        &scripts_dir,
    )?
    else {
        state.analysis_cancel_flags.remove(&request.id);
        return Err(Error::InvalidRequest(
            "the style needs Maia 3 with its Python environment (managed installation)".into(),
        ));
    };
    let mut maia = BaseEngine::spawn(program, &args).await?;
    maia.init_uci().await?;
    maia.set_option_if_supported("SelfElo", request.elo).await?;
    maia.set_option_if_supported("Elo", request.elo).await?;
    maia.set_option_if_supported("MultiPV", "1").await?;
    maia.new_game().await?;

    let total = positions.len();
    let mut samples: Vec<Sample> = Vec::with_capacity(total);
    let mut opponent: Option<i32> = None;
    let mut cancelled = false;
    let mut failure: Option<Error> = None;
    for (index, position) in positions.iter().enumerate() {
        if cancel.load(Ordering::SeqCst) {
            cancelled = true;
            break;
        }
        let Some((chess, recapture_on)) = replay(&position.moves) else {
            continue;
        };
        let opponent_elo = position.opponent_elo.map(|elo| elo.clamp(600, 2600));
        if opponent_elo != opponent {
            if let Some(elo) = opponent_elo {
                maia.set_option_if_supported("OppoElo", elo).await?;
            }
            opponent = opponent_elo;
        }
        let step = async {
            maia.set_position(START_FEN, &position.moves).await?;
            maia.go(&GoMode::Depth(1)).await?;
            wait_for_maia_move(&mut maia).await
        };
        match step.await {
            Ok((_, Some(policy))) => {
                if let Some(sample) = sample_of(
                    &chess,
                    recapture_on,
                    &policy,
                    &position.played,
                    position.test,
                ) {
                    samples.push(sample);
                }
            }
            Ok((_, None)) => {
                failure = Some(Error::InvalidRequest(
                    "Maia did not report its probabilities".into(),
                ));
                break;
            }
            Err(error) => {
                failure = Some(error);
                break;
            }
        }
        if index % 10 == 0 || index + 1 == total {
            let _ = update_progress(
                &state.progress_state,
                &app,
                request.id.clone(),
                (index + 1) as f32 * 100.0 / total.max(1) as f32,
                false,
            );
        }
    }
    let _ = maia.quit().await;
    let _ = update_progress(&state.progress_state, &app, request.id.clone(), 100.0, true);
    state.analysis_cancel_flags.remove(&request.id);
    if let Some(error) = failure {
        return Err(error);
    }

    let measurement = summarize(&samples, cancelled);
    info!(
        "player style: {} positions in {} ms, weights {:+.2}/{:+.2}, improves {}",
        samples.len(),
        timer.elapsed().as_millis(),
        measurement.weights_aggression,
        measurement.weights_simplification,
        measurement.improves
    );
    Ok(measurement)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn traits(aggression: f32, simplification: f32) -> MoveTraits {
        MoveTraits {
            aggression,
            simplification,
            ..MoveTraits::default()
        }
    }

    /// Three likely candidates of equal probability: quiet, aggressive and simplifying.
    fn sample(played: usize, test: bool) -> Sample {
        Sample {
            probabilities: vec![0.3, 0.3, 0.3, 0.1],
            traits: vec![
                traits(0.0, 0.0),
                traits(1.0, 0.0),
                traits(0.0, 1.0),
                traits(0.0, 0.0),
            ],
            likely: vec![true, true, true, false],
            played,
            phase: 1.0,
            test,
        }
    }

    #[test]
    fn an_aggressive_player_gets_an_aggressive_weight_that_predicts_better() {
        // Mostly the aggressive move, sometimes the others, as a real player would.
        let samples: Vec<Sample> = (0..200)
            .map(|index| sample(if index % 5 == 0 { 0 } else { 1 }, index % 4 == 0))
            .collect();
        let measurement = summarize(&samples, false);
        assert!(measurement.weights_aggression > 0.0);
        assert!(measurement.aggression.delta > 0.0);
        assert!(measurement.improves);
        assert!(measurement.styled.log_likelihood > measurement.maia.log_likelihood);
    }

    #[test]
    fn a_player_like_maia_keeps_no_style() {
        // Each likely move in turn, so the choices follow Maia's own probabilities.
        let samples: Vec<Sample> = (0..300)
            .map(|index| sample(index % 3, index % 4 == 0))
            .collect();
        let measurement = summarize(&samples, false);
        assert!(!measurement.improves);
        assert!(measurement.aggression.delta.abs() < 2.0 * measurement.aggression.std_error + 0.05);
    }

    #[test]
    fn the_style_keeps_the_mass_of_the_unlikely_moves() {
        let probabilities = styled(
            &sample(1, false),
            StyleWeights {
                aggression: 1.0,
                simplification: 0.0,
            },
        );
        assert!((probabilities[3] - 0.1).abs() < 1e-6);
        assert!(probabilities[1] > 0.3);
        assert!((probabilities.iter().sum::<f32>() - 1.0).abs() < 1e-5);
    }

    #[test]
    fn positions_are_the_players_middlegame_moves_spread_over_the_game() {
        use crate::db::encoding::encode_move;
        let mut chess = Chess::default();
        let mut bytes = Vec::new();
        let shuffle = ["g1f3", "g8f6", "f3g1", "f6g8"];
        for index in 0..100 {
            let movement = shuffle[index % 4]
                .parse::<UciMove>()
                .unwrap()
                .to_move(&chess)
                .unwrap();
            bytes.push(encode_move(&movement, &chess).unwrap());
            chess.play_unchecked(&movement);
        }
        let game = StyleGameRef {
            file: PathBuf::new(),
            id: 1,
            player_white: false,
            opponent_elo: Some(1500),
            test: false,
        };
        let positions = positions_of_game(&bytes, &game);
        assert_eq!(positions.len(), PER_GAME);
        // Black to move: an odd number of moves before, inside the window.
        assert!(positions
            .iter()
            .all(|p| p.moves.len() % 2 == 1 && (FIRST_PLY..LAST_PLY).contains(&p.moves.len())));
    }
}
