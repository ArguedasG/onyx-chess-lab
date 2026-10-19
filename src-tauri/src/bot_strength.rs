//! Strength of the human bots above Maia's range (I-48).
//!
//! Up to 2400 a bot is pure Maia at its rating: Maia's ladder is consistent within itself (a 1900
//! beats an 1800 about as often as a human would), human blunders included, and slow rhythms are
//! handled by the rhythm discount of the displayed rating, not by the engine.
//!
//! Above 2400, where Maia stops getting stronger, a bot is Maia 2400 with a filter: only the
//! candidates Stockfish keeps within `margin_cp` of the best one may be played. They are still
//! Maia's moves, so the bot stays human; a narrower margin removes more errors. The margins are
//! calibrated against Maia 2400 with the bot laboratory (docs/bots-phase-9-1.es.md).

use crate::bot_candidates::{score_to_cp, MaiaCandidate, VerifiedCandidate};

/// Up to this rating the bot is pure Maia; above it, Maia at this rating with the filter.
pub const PURE_MAIA_MAX_ELO: u32 = 2400;
/// Filter margin (cp) at each level above Maia's range; linear in between. From the calibrations
/// of 2026-10-18 against Maia 2400 (30 games per margin): 400 cp ~+150, 200 cp ~+240, 150 cp
/// ~+380, 130 cp ~+460, 80 cp ~+585.
const MARGINS: [(u32, f32); 4] = [(2500, 400.0), (2600, 220.0), (2700, 175.0), (2800, 140.0)];
/// From this rating every move is filtered; between 2400 and here, only part of them.
const FULL_FILTER_ELO: u32 = 2600;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StrengthPlan {
    /// Rating requested from Maia for the bot itself (`SelfElo`).
    pub maia_elo: u32,
    /// Share of moves that are filtered, from 0 to 1.
    pub filter_probability: f32,
    /// How far below the best verified candidate a filtered move may be.
    pub margin_cp: i32,
    /// Stockfish time to verify the candidates of one move.
    pub verify_ms: u32,
    /// Multiplies the bot's sampling temperature: slightly more consistent at the top.
    pub temperature_scale: f32,
}

fn fraction(value: u32, from: u32, to: u32) -> f32 {
    ((value as f32 - from as f32) / (to as f32 - from as f32)).clamp(0.0, 1.0)
}

fn margin_at(elo: u32) -> f32 {
    let (first_elo, first_margin) = MARGINS[0];
    if elo <= first_elo {
        return first_margin;
    }
    for pair in MARGINS.windows(2) {
        let ((from, from_margin), (to, to_margin)) = (pair[0], pair[1]);
        if elo <= to {
            return from_margin + (to_margin - from_margin) * fraction(elo, from, to);
        }
    }
    MARGINS[MARGINS.len() - 1].1
}

pub fn strength_plan(elo: u32) -> StrengthPlan {
    if elo <= PURE_MAIA_MAX_ELO {
        return StrengthPlan {
            maia_elo: elo,
            filter_probability: 0.0,
            margin_cp: 0,
            verify_ms: 150,
            temperature_scale: 1.0,
        };
    }
    let top = fraction(elo, PURE_MAIA_MAX_ELO, 2800);
    StrengthPlan {
        maia_elo: PURE_MAIA_MAX_ELO,
        filter_probability: fraction(elo, PURE_MAIA_MAX_ELO, FULL_FILTER_ELO),
        margin_cp: margin_at(elo).round() as i32,
        verify_ms: (150.0 + 200.0 * top).round() as u32,
        temperature_scale: 1.0 - 0.15 * top,
    }
}

/// Keeps only the verified candidates within `margin_cp` of the best one, renormalized. Without a
/// verification, the probabilities are left as they are.
pub fn filtered_probabilities(
    policy: &[MaiaCandidate],
    probabilities: &[f32],
    verified: &[VerifiedCandidate],
    margin_cp: i32,
) -> Vec<f32> {
    let Some(best) = verified.iter().map(|v| score_to_cp(&v.score)).max() else {
        return probabilities.to_vec();
    };
    let kept: Vec<f32> = policy
        .iter()
        .zip(probabilities)
        .map(|(candidate, probability)| {
            let good = verified
                .iter()
                .find(|v| v.uci == candidate.uci)
                .is_some_and(|v| score_to_cp(&v.score) >= best - margin_cp);
            if good {
                *probability
            } else {
                0.0
            }
        })
        .collect();
    let total: f32 = kept.iter().sum();
    if total <= 0.0 {
        // The style can leave no weight on the good moves only through rounding; fall back to
        // Maia's own probabilities among them.
        let kept: Vec<f32> = policy
            .iter()
            .map(|candidate| {
                verified
                    .iter()
                    .find(|v| v.uci == candidate.uci)
                    .filter(|v| score_to_cp(&v.score) >= best - margin_cp)
                    .map_or(0.0, |_| candidate.probability)
            })
            .collect();
        let total: f32 = kept.iter().sum();
        return kept
            .into_iter()
            .map(|p| p / total.max(f32::MIN_POSITIVE))
            .collect();
    }
    kept.into_iter().map(|p| p / total).collect()
}

#[cfg(test)]
mod tests {
    use vampirc_uci::uci::ScoreValue;

    use super::*;

    #[test]
    fn pure_maia_up_to_2400_and_maia_2400_with_a_filter_above() {
        for elo in [800, 1500, 2000, 2400] {
            let plan = strength_plan(elo);
            assert_eq!(plan.maia_elo, elo);
            assert_eq!(plan.filter_probability, 0.0);
            assert_eq!(plan.temperature_scale, 1.0);
        }
        let margins: Vec<i32> = [2450, 2500, 2550, 2600, 2700, 2750, 2800, 2900]
            .into_iter()
            .map(|elo| {
                let plan = strength_plan(elo);
                assert_eq!(plan.maia_elo, 2400);
                plan.margin_cp
            })
            .collect();
        assert_eq!(margins, [400, 400, 310, 220, 175, 158, 140, 140]);
        assert!((strength_plan(2500).filter_probability - 0.5).abs() < 1e-6);
        assert_eq!(strength_plan(2600).filter_probability, 1.0);
        assert_eq!(strength_plan(2800).verify_ms, 350);
    }

    #[test]
    fn only_moves_within_the_margin_survive() {
        let policy = [
            MaiaCandidate {
                uci: "a2a3".into(),
                probability: 0.5,
            },
            MaiaCandidate {
                uci: "b2b3".into(),
                probability: 0.3,
            },
            MaiaCandidate {
                uci: "c2c3".into(),
                probability: 0.2,
            },
        ];
        let verified = [
            VerifiedCandidate {
                uci: "a2a3".into(),
                score: ScoreValue::Cp(-300),
                depth: 12,
            },
            VerifiedCandidate {
                uci: "b2b3".into(),
                score: ScoreValue::Cp(40),
                depth: 12,
            },
        ];
        // The likely a2a3 is a blunder and c2c3 was not verified: only b2b3 remains.
        let filtered = filtered_probabilities(&policy, &[0.5, 0.3, 0.2], &verified, 100);
        assert_eq!(filtered, vec![0.0, 1.0, 0.0]);
        // Without verification nothing changes.
        assert_eq!(
            filtered_probabilities(&policy, &[0.5, 0.3, 0.2], &[], 100),
            vec![0.5, 0.3, 0.2]
        );
    }
}
