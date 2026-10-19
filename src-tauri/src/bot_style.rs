//! Playing styles of the human bots (I-47).
//!
//! A style does not invent moves: it re-weights Maia's own candidates. Each move gets two traits
//! measured on the board, aggression (checks, pressure on the enemy king, pieces approaching it,
//! pawn storms; defending the own king, retreats and castling count against it) and
//! simplification (trades, a queen offered for exchange, less tension; more tension counts
//! against it). The style moves probability among the candidates that Stockfish keeps within a
//! margin of the best one, without changing their total, so it neither adds nor removes the
//! human errors of Maia.

use rand::Rng;
use serde::{Deserialize, Serialize};
use shakmaty::{attacks, uci::UciMove, Bitboard, Chess, Color, Move, Position, Rank, Role, Square};
use specta::Type;
use vampirc_uci::uci::ScoreValue;

use crate::{
    bot_candidates::{
        score_to_cp, top_candidates, verify_candidates, wait_for_maia_move, MaiaCandidate,
        VerifiedCandidate,
    },
    bot_strength::{filtered_probabilities, strength_plan},
    engine::{BaseEngine, GoMode},
    error::Error,
};

/// How a styled human bot plays: its style and the sampling it applies to Maia's candidates. Maia
/// must run through the policy wrapper; the verifier is a Stockfish process.
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BotPlayConfig {
    /// From -1 (defensive) to 1 (aggressive).
    pub aggression: f32,
    /// From -1 (complicates) to 1 (simplifies).
    pub simplification: f32,
    pub elo: u32,
    pub temperature: f32,
    pub top_p: f32,
    /// Engine that checks the candidates; without it the style is not applied.
    pub verifier_path: Option<String>,
    #[serde(default)]
    pub verifier_args: Vec<String>,
}

impl BotPlayConfig {
    pub fn weights(&self) -> StyleWeights {
        StyleWeights {
            aggression: self.aggression.clamp(-1.0, 1.0),
            simplification: self.simplification.clamp(-1.0, 1.0),
        }
    }
}

/// Candidates checked: the likely ones up to this probability mass and count, plus extra ones the
/// style favours.
const LIKELY_MASS: f32 = 0.9;
const LIKELY_MAX: usize = 6;
const STYLE_EXTRA: usize = 3;

/// The move a bot chose and how (the details feed the style lab).
#[derive(Debug, Clone)]
#[cfg_attr(not(test), allow(dead_code))]
pub struct BotChoice {
    pub uci: String,
    /// Maia's probability of the move, before the style; `None` without a policy.
    pub maia_probability: Option<f32>,
    /// Whether it was Maia's most likely move.
    pub maia_top: bool,
    pub traits: Option<MoveTraits>,
    pub verified: Vec<VerifiedCandidate>,
    /// Whether the strength filter (I-48) applied to this move.
    pub filtered: bool,
}

impl BotChoice {
    /// Whether the position asked for one precise move: the best verified candidate is at least
    /// 1.5 pawns better than the second, in a game still undecided.
    pub fn is_critical(&self) -> bool {
        let mut scores: Vec<i32> = self
            .verified
            .iter()
            .map(|v| score_to_cp(&v.score))
            .collect();
        scores.sort_unstable_by(|left, right| right.cmp(left));
        match scores.as_slice() {
            [best, second, ..] => best - second >= 150 && best.abs() < 500,
            _ => false,
        }
    }

    /// The verified score of the chosen move, from the side to move.
    pub fn score(&self) -> Option<ScoreValue> {
        self.verified
            .iter()
            .find(|candidate| candidate.uci == self.uci)
            .map(|candidate| candidate.score.clone())
    }
}

/// Asks Maia (after `position` has been sent) for its candidates and picks one with the bot's style
/// and sampling. With a verifier the style is applied; without a policy (a Maia without the
/// wrapper) Maia's own move is played.
#[allow(clippy::too_many_arguments)]
pub async fn choose_bot_move(
    maia: &mut BaseEngine,
    verifier: Option<&mut BaseEngine>,
    config: &BotPlayConfig,
    position: &Chess,
    fen: &str,
    moves: &[String],
    go: &GoMode,
    rng: &mut impl Rng,
) -> Result<BotChoice, Error> {
    maia.go(go).await?;
    let (best_move, policy) = wait_for_maia_move(maia).await?;
    let entries: Vec<(MaiaCandidate, MoveTraits, Move)> = policy
        .unwrap_or_default()
        .into_iter()
        .filter_map(|candidate| {
            let m = candidate
                .uci
                .parse::<UciMove>()
                .ok()?
                .to_move(position)
                .ok()?;
            let traits = move_traits(position, &m);
            Some((candidate, traits, m))
        })
        .collect();
    if entries.is_empty() {
        return Ok(BotChoice {
            uci: best_move,
            maia_probability: None,
            maia_top: false,
            traits: None,
            verified: Vec::new(),
            filtered: false,
        });
    }

    let pairs: Vec<(MaiaCandidate, MoveTraits)> = entries
        .iter()
        .map(|(candidate, traits, _)| (candidate.clone(), *traits))
        .collect();
    let weights = config.weights().for_position(position);
    let plan = strength_plan(config.elo);
    let mut verified = Vec::new();
    let mut filtered = false;
    let probabilities = match verifier {
        Some(verifier) => {
            let raw: Vec<MaiaCandidate> = pairs.iter().map(|(c, _)| c.clone()).collect();
            let likely = top_candidates(&raw, LIKELY_MASS, LIKELY_MAX);
            let to_verify = candidates_to_verify(&pairs, &likely, weights, STYLE_EXTRA);
            verified = verify_candidates(
                verifier,
                fen,
                moves,
                &to_verify,
                &GoMode::Time(plan.verify_ms),
            )
            .await?;
            let styled =
                styled_probabilities(&pairs, &verified, weights, style_margin_cp(config.elo));
            filtered = rng.gen::<f32>() < plan.filter_probability;
            if filtered {
                filtered_probabilities(&raw, &styled, &verified, plan.margin_cp)
            } else {
                styled
            }
        }
        None => pairs.iter().map(|(c, _)| c.probability).collect(),
    };
    let temperature = config.temperature * plan.temperature_scale;
    let index = sample_index(&probabilities, temperature, config.top_p, rng);
    let (candidate, traits, _) = &entries[index];
    Ok(BotChoice {
        uci: candidate.uci.clone(),
        maia_probability: Some(candidate.probability),
        maia_top: index == 0,
        traits: Some(*traits),
        verified,
        filtered,
    })
}

/// Weights of the two axes, each from -1 to 1: aggressive (1) or defensive (-1), simplifying (1)
/// or complicating (-1).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StyleWeights {
    pub aggression: f32,
    pub simplification: f32,
}

impl StyleWeights {
    #[cfg_attr(not(test), allow(dead_code))]
    pub const NEUTRAL: StyleWeights = StyleWeights {
        aggression: 0.0,
        simplification: 0.0,
    };

    /// The weights for `position`: full while there are pieces to attack and exchange, fading
    /// to 30 % in endgames, where technique (bringing the king, a natural plan) matters more
    /// than style.
    pub fn for_position(self, position: &Chess) -> StyleWeights {
        let factor = style_phase_factor(position);
        StyleWeights {
            aggression: self.aggression * factor,
            simplification: self.simplification * factor,
        }
    }
}

/// Pieces other than pawns and kings, both colors (62 at the start): 30 or more is a middlegame
/// (factor 1), 10 or fewer an endgame (factor 0.3), linear in between.
pub fn style_phase_factor(position: &Chess) -> f32 {
    let board = position.board();
    let pieces = (board.knights() | board.bishops()).count() * 3
        + board.rooks().count() * 5
        + board.queens().count() * 9;
    (0.3 + 0.7 * (pieces as f32 - 10.0) / 20.0).clamp(0.3, 1.0)
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct MoveTraits {
    pub aggression: f32,
    pub simplification: f32,
    pub check: bool,
    pub capture: bool,
    /// A capture of a piece of about the same value (pawn for pawn, minor for minor...).
    pub trade: bool,
}

impl MoveTraits {
    pub fn style_score(&self, weights: StyleWeights) -> f32 {
        weights.aggression * self.aggression + weights.simplification * self.simplification
    }
}

/// The five play personalities: id and weights.
#[cfg_attr(not(test), allow(dead_code))]
pub const PLAY_STYLES: [(&str, StyleWeights); 5] = [
    (
        "rematador",
        StyleWeights {
            aggression: 1.0,
            simplification: 1.0,
        },
    ),
    (
        "salvaje",
        StyleWeights {
            aggression: 1.0,
            simplification: -1.0,
        },
    ),
    (
        "guardian",
        StyleWeights {
            aggression: -1.0,
            simplification: 1.0,
        },
    ),
    (
        "acechador",
        StyleWeights {
            aggression: -1.0,
            simplification: -1.0,
        },
    ),
    ("equilibrista", StyleWeights::NEUTRAL),
];

/// How much a style changes the probabilities: `exp(STYLE_STRENGTH)` for a score of 1.
pub const STYLE_STRENGTH: f32 = 2.0;

fn value(role: Role) -> i32 {
    match role {
        Role::Pawn => 1,
        Role::Knight | Role::Bishop => 3,
        Role::Rook => 5,
        Role::Queen => 9,
        Role::King => 0,
    }
}

/// Attacks of `attacker` on the squares around (and on) the king of `king_color`.
fn king_zone_attacks(position: &Chess, king_color: Color, attacker: Color) -> i32 {
    let board = position.board();
    let Some(king) = board.king_of(king_color) else {
        return 0;
    };
    let occupied = board.occupied();
    (attacks::king_attacks(king) | Bitboard::from(king))
        .into_iter()
        .map(|square| board.attacks_to(square, attacker, occupied).count() as i32)
        .sum()
}

/// Pieces of both colors attacked by the other color: how many exchanges are pending.
fn tension(position: &Chess) -> i32 {
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
        .count() as i32
}

fn back_rank_distance(square: Square, color: Color) -> u32 {
    square.rank().distance(match color {
        Color::White => Rank::First,
        Color::Black => Rank::Eighth,
    })
}

/// Traits of `m` (legal) in `position`.
pub fn move_traits(position: &Chess, m: &Move) -> MoveTraits {
    let us = position.turn();
    let them = !us;
    let mut after = position.clone();
    after.play_unchecked(m);

    let check = after.is_check();
    let capture = m.is_capture();
    let mover = m.role();
    let captured = m.capture();
    let trade = captured.is_some_and(|role| (value(role) - value(mover)).abs() <= 1);

    let mut aggression = 0.0;
    if check {
        aggression += 1.0;
    }
    let pressure = king_zone_attacks(&after, them, us) - king_zone_attacks(position, them, us);
    aggression += 0.25 * pressure.clamp(-4, 4) as f32;
    // A king move shifts its own zone, so its defenders are not comparable.
    if mover != Role::King {
        let defense = king_zone_attacks(&after, us, us) - king_zone_attacks(position, us, us);
        aggression -= 0.15 * defense.clamp(-4, 4) as f32;
    }
    if let (Some(from), Some(their_king)) = (m.from(), position.board().king_of(them)) {
        if matches!(
            mover,
            Role::Knight | Role::Bishop | Role::Rook | Role::Queen
        ) {
            let approach = from.distance(their_king) as i32 - m.to().distance(their_king) as i32;
            aggression += 0.15 * approach.clamp(-3, 3) as f32;
            if back_rank_distance(m.to(), us) < back_rank_distance(from, us) && !capture {
                aggression -= 0.3;
            }
        }
        if mover == Role::Pawn
            && !capture
            && m.to().file().distance(their_king.file()) <= 1
            && back_rank_distance(m.to(), us) >= 3
        {
            aggression += 0.4;
        }
    }
    if m.is_castle() {
        aggression -= 0.4;
    }

    let mut simplification = 0.0;
    if trade {
        simplification += 1.5;
    } else if captured.is_some_and(|role| role != Role::Pawn) {
        simplification += 0.5;
    }
    if mover == Role::Queen && !capture {
        let board = after.board();
        let occupied = board.occupied();
        let offered = (board.attacks_to(m.to(), them, occupied) & board.queens()).any()
            && board.attacks_to(m.to(), us, occupied).any();
        if offered {
            simplification += 0.6;
        }
    }
    let tension_change = tension(&after) - tension(position);
    simplification -= 0.25 * tension_change.clamp(-6, 6) as f32;

    MoveTraits {
        aggression,
        simplification,
        check,
        capture,
        trade,
    }
}

/// How far below the best verified candidate a move may be and still get the style's boost.
/// Narrower for stronger bots; never under 30 cp, the noise of a short verification.
pub fn style_margin_cp(elo: u32) -> i32 {
    (120 - (elo as i32) * 4 / 100).clamp(30, 80)
}

/// Candidates worth verifying for a style: the likely ones and up to `extra` less likely moves
/// (at least 1 %) the style favours, which would otherwise never be played.
pub fn candidates_to_verify(
    policy: &[(MaiaCandidate, MoveTraits)],
    likely: &[MaiaCandidate],
    weights: StyleWeights,
    extra: usize,
) -> Vec<String> {
    let mut result: Vec<String> = likely.iter().map(|c| c.uci.clone()).collect();
    let mut favoured: Vec<&(MaiaCandidate, MoveTraits)> = policy
        .iter()
        .filter(|(candidate, traits)| {
            candidate.probability >= 0.01
                && traits.style_score(weights) > 0.0
                && !result.contains(&candidate.uci)
        })
        .collect();
    favoured.sort_by(|left, right| {
        right
            .1
            .style_score(weights)
            .total_cmp(&left.1.style_score(weights))
    });
    result.extend(
        favoured
            .into_iter()
            .take(extra)
            .map(|(candidate, _)| candidate.uci.clone()),
    );
    result
}

/// Maia's probabilities with the style applied among the verified candidates within `margin_cp` of
/// the best one. The style only moves probability inside that group, whose total stays the same:
/// the chance of the moves outside it (Maia's human errors) does not change, so a style neither
/// adds nor removes errors. Sums to 1.
pub fn styled_probabilities(
    policy: &[(MaiaCandidate, MoveTraits)],
    verified: &[VerifiedCandidate],
    weights: StyleWeights,
    margin_cp: i32,
) -> Vec<f32> {
    let best = verified.iter().map(|v| score_to_cp(&v.score)).max();
    let eligible: Vec<bool> = policy
        .iter()
        .map(|(candidate, _)| {
            best.is_some_and(|best| {
                verified
                    .iter()
                    .find(|v| v.uci == candidate.uci)
                    .is_some_and(|v| score_to_cp(&v.score) >= best - margin_cp)
            })
        })
        .collect();
    let mut result: Vec<f32> = policy
        .iter()
        .map(|(candidate, _)| candidate.probability)
        .collect();
    let group_mass: f32 = (0..policy.len())
        .filter(|&i| eligible[i])
        .map(|i| result[i])
        .sum();
    let boosted: Vec<f32> = policy
        .iter()
        .map(|(candidate, traits)| {
            candidate.probability * (STYLE_STRENGTH * traits.style_score(weights)).exp()
        })
        .collect();
    let boosted_mass: f32 = (0..policy.len())
        .filter(|&i| eligible[i])
        .map(|i| boosted[i])
        .sum();
    if group_mass > 0.0 && boosted_mass > 0.0 {
        for i in (0..policy.len()).filter(|&i| eligible[i]) {
            result[i] = boosted[i] * group_mass / boosted_mass;
        }
    }
    normalized(result)
}

fn normalized(values: Vec<f32>) -> Vec<f32> {
    let total: f32 = values.iter().sum();
    if total <= 0.0 {
        let uniform = 1.0 / values.len().max(1) as f32;
        return vec![uniform; values.len()];
    }
    values.into_iter().map(|value| value / total).collect()
}

/// Samples an index with the bot's temperature and top-p, as Maia does with its own policy.
pub fn sample_index(
    probabilities: &[f32],
    temperature: f32,
    top_p: f32,
    rng: &mut impl Rng,
) -> usize {
    if probabilities.is_empty() {
        return 0;
    }
    if temperature <= 0.0 {
        return argmax(probabilities);
    }
    let tempered = normalized(
        probabilities
            .iter()
            .map(|p| {
                if *p > 0.0 {
                    p.powf(1.0 / temperature)
                } else {
                    0.0
                }
            })
            .collect(),
    );
    let mut order: Vec<usize> = (0..tempered.len()).collect();
    order.sort_by(|&left, &right| tempered[right].total_cmp(&tempered[left]));
    let mut kept = Vec::new();
    let mut covered = 0.0;
    for index in order {
        // As Maia: keep moves while the cumulative probability stays within top-p, always one.
        if !kept.is_empty() && covered + tempered[index] > top_p {
            break;
        }
        covered += tempered[index];
        kept.push(index);
    }
    let mut ticket = rng.gen::<f32>() * covered;
    for &index in &kept {
        ticket -= tempered[index];
        if ticket <= 0.0 {
            return index;
        }
    }
    *kept.last().unwrap()
}

fn argmax(values: &[f32]) -> usize {
    values
        .iter()
        .enumerate()
        .max_by(|left, right| left.1.total_cmp(right.1))
        .map(|(index, _)| index)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use rand::{rngs::StdRng, SeedableRng};
    use shakmaty::{fen::Fen, uci::UciMove, CastlingMode};
    use vampirc_uci::uci::ScoreValue;

    use super::*;

    fn position(fen: &str) -> Chess {
        fen.parse::<Fen>()
            .unwrap()
            .into_position(CastlingMode::Standard)
            .unwrap()
    }

    fn traits(fen: &str, uci: &str) -> MoveTraits {
        let position = position(fen);
        let m = uci.parse::<UciMove>().unwrap().to_move(&position).unwrap();
        move_traits(&position, &m)
    }

    #[test]
    fn checks_and_attacks_on_the_king_are_aggressive_and_castling_is_not() {
        // Italian: Bxf7+ is a check next to the king; O-O is defensive.
        let fen = "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5";
        let sacrifice = traits(fen, "c4f7");
        assert!(sacrifice.check);
        assert!(sacrifice.aggression > 1.0);
        let castle = traits(fen, "e1g1");
        assert!(castle.aggression < 0.0, "{castle:?}");
        assert!(sacrifice.aggression > castle.aggression);
    }

    #[test]
    fn equal_trades_simplify_and_new_tension_complicates() {
        // Exchange on d5 (pawn for pawn) versus keeping the tension with Nc3.
        let fen = "rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3";
        let exchange = traits(fen, "c4d5");
        assert!(exchange.trade);
        assert!(exchange.simplification > 0.5);
        let develop = traits(fen, "b1c3");
        assert!(develop.simplification < exchange.simplification);
    }

    #[test]
    fn a_queen_offered_for_exchange_simplifies() {
        // Qe2-d2 faces the black queen on d8 and is defended by the rook and the king.
        let fen = "3qk3/4p3/8/8/8/8/4Q3/3RK3 w - - 0 1";
        let offer = traits(fen, "e2d2");
        assert!(offer.simplification > 0.4, "{offer:?}");
    }

    fn candidate(uci: &str, probability: f32) -> MaiaCandidate {
        MaiaCandidate {
            uci: uci.into(),
            probability,
        }
    }

    fn verified(uci: &str, cp: i32) -> VerifiedCandidate {
        VerifiedCandidate {
            uci: uci.into(),
            score: ScoreValue::Cp(cp),
            depth: 12,
        }
    }

    #[test]
    fn the_style_only_boosts_moves_within_the_margin() {
        let aggressive = MoveTraits {
            aggression: 1.0,
            ..MoveTraits::default()
        };
        let quiet = MoveTraits::default();
        let policy = vec![
            (candidate("a2a3", 0.5), quiet),
            (candidate("b2b3", 0.25), aggressive),
            (candidate("c2c3", 0.25), aggressive),
        ];
        let checked = [
            verified("a2a3", 30),
            verified("b2b3", 10),
            verified("c2c3", -200),
        ];
        let weights = StyleWeights {
            aggression: 1.0,
            simplification: 0.0,
        };
        let styled = styled_probabilities(&policy, &checked, weights, 50);
        let ratio = |styled: &[f32], index: usize| styled[index] / policy[index].0.probability;
        // b2b3 gains at the expense of a2a3; c2c3 loses too much and keeps its probability.
        assert!(ratio(&styled, 1) > ratio(&styled, 0) * 3.0);
        assert!((styled[2] - 0.25).abs() < 1e-5);
        assert!((styled.iter().sum::<f32>() - 1.0).abs() < 1e-5);

        // A defensive style moves probability to a2a3, never to the bad c2c3.
        let defensive = StyleWeights {
            aggression: -1.0,
            simplification: 0.0,
        };
        let styled = styled_probabilities(&policy, &checked, defensive, 50);
        assert!(styled[0] > 0.5 && styled[1] < 0.25);
        assert!((styled[2] - 0.25).abs() < 1e-5);

        // The neutral style changes nothing.
        let neutral = styled_probabilities(&policy, &checked, StyleWeights::NEUTRAL, 50);
        assert!((neutral[0] - 0.5).abs() < 1e-6);
    }

    #[test]
    fn favoured_unlikely_moves_are_added_for_verification() {
        let aggressive = MoveTraits {
            aggression: 1.0,
            ..MoveTraits::default()
        };
        let policy = vec![
            (candidate("a2a3", 0.9), MoveTraits::default()),
            (candidate("h2h4", 0.05), aggressive),
            (candidate("g2g4", 0.005), aggressive),
        ];
        let likely = vec![candidate("a2a3", 0.9)];
        let weights = StyleWeights {
            aggression: 1.0,
            simplification: 0.0,
        };
        // g2g4 is under 1 %.
        assert_eq!(
            candidates_to_verify(&policy, &likely, weights, 3),
            ["a2a3", "h2h4"]
        );
        assert_eq!(
            candidates_to_verify(&policy, &likely, StyleWeights::NEUTRAL, 3),
            ["a2a3"]
        );
    }

    #[test]
    fn sampling_respects_temperature_zero_and_top_p() {
        let mut rng = StdRng::seed_from_u64(7);
        let probabilities = [0.1, 0.6, 0.3];
        assert_eq!(sample_index(&probabilities, 0.0, 1.0, &mut rng), 1);
        // With top-p 0.5 only the most likely move remains.
        for _ in 0..50 {
            assert_eq!(sample_index(&probabilities, 1.0, 0.5, &mut rng), 1);
        }
        let mut counts = [0; 3];
        for _ in 0..3000 {
            counts[sample_index(&probabilities, 1.0, 1.0, &mut rng)] += 1;
        }
        assert!(
            counts[0] > 200 && counts[2] > 700 && counts[1] > 1500,
            "{counts:?}"
        );
    }

    #[test]
    fn the_style_fades_in_endgames() {
        let full = StyleWeights {
            aggression: 1.0,
            simplification: -1.0,
        };
        assert_eq!(full.for_position(&Chess::default()), full);
        // Rook and pawns each: 10 points of pieces, the minimum.
        let endgame = position("4k3/pp3r2/8/8/8/8/PP3R2/4K3 w - - 0 1");
        let faded = full.for_position(&endgame);
        assert!((faded.aggression - 0.3).abs() < 1e-6);
        assert!((faded.simplification + 0.3).abs() < 1e-6);
    }

    #[test]
    fn margins_narrow_with_strength() {
        assert_eq!(style_margin_cp(800), 80);
        assert_eq!(style_margin_cp(1500), 60);
        assert_eq!(style_margin_cp(2000), 40);
        assert_eq!(style_margin_cp(2800), 30);
    }
}
