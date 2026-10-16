//! Named pawn structures (8.6, I-31): the eight initial ones of the market study.
//!
//! Each rule looks only at the pawns and is written for the side that "owns" the structure (the
//! one with the isolated pawn, the hanging pawns, the Maróczy bind…), with ranks counted from that
//! side. The same rule is applied to both colours, so the reversed versions come for free. A game
//! has a structure when it holds for `MIN_RUN` consecutive plies inside the window after the
//! opening; the rules are approximate and are documented as such until validated with labelled
//! examples.

use serde::Serialize;
use shakmaty::{Bitboard, Board, Color, File, Rank, Square};
use specta::Type;

/// First and last ply looked at: from move 12 to move 25.
pub const WINDOW_START: u32 = 23;
pub const WINDOW_END: u32 = 50;
/// Plies in a row the structure must hold to count (three moves).
pub const MIN_RUN: u32 = 6;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum PawnStructure {
    /// Isolated queen's pawn: a d-pawn on the fourth rank without own c- or e-pawns.
    Iqp,
    /// The side with d4/e3 against c6/d5 (the minority-attack side).
    Carlsbad,
    /// c- and d-pawns side by side on the fourth rank without b- or e-pawns.
    HangingPawns,
    /// c6/e6 without a d-pawn against d4 (Caro-Kann: no white e-pawn; Slav: no white c-pawn).
    CaroSlav,
    /// The chain e6/d5 against d4/e5.
    French,
    /// c4/e4 without a d-pawn against a Sicilian set-up (d-pawn, no c-pawn).
    Maroczy,
    /// a6/b6/d6/e6 against c4/e4.
    Hedgehog,
    /// The chain d6/e5 against d5/e4.
    KingsIndian,
}

pub const ALL_STRUCTURES: [PawnStructure; 8] = [
    PawnStructure::Iqp,
    PawnStructure::Carlsbad,
    PawnStructure::HangingPawns,
    PawnStructure::CaroSlav,
    PawnStructure::French,
    PawnStructure::Maroczy,
    PawnStructure::Hedgehog,
    PawnStructure::KingsIndian,
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PawnStructureHit {
    pub structure: PawnStructure,
    /// The side that owns the structure is White.
    pub owner_white: bool,
    /// First ply of the run that made it count.
    pub ply: u32,
}

/// Pawns of one side seen from that side: rank 1 is its own back rank.
struct Side {
    pawns: Bitboard,
    color: Color,
}

impl Side {
    fn new(board: &Board, color: Color) -> Self {
        Self {
            pawns: board.by_color(color) & board.pawns(),
            color,
        }
    }

    fn square(&self, file: File, relative_rank: u32) -> Square {
        let rank = Rank::new(relative_rank - 1);
        let rank = if self.color == Color::White {
            rank
        } else {
            rank.flip_vertical()
        };
        Square::from_coords(file, rank)
    }

    /// A pawn on `file` at `relative_rank` (1–8 from this side).
    fn at(&self, file: File, relative_rank: u32) -> bool {
        self.pawns.contains(self.square(file, relative_rank))
    }

    fn on_file(&self, file: File) -> usize {
        (self.pawns & Bitboard::from_file(file)).count()
    }

    fn has_file(&self, file: File) -> bool {
        self.on_file(file) > 0
    }
}

fn matches(structure: PawnStructure, own: &Side, opp: &Side) -> bool {
    use File::*;
    match structure {
        PawnStructure::Iqp => {
            own.on_file(D) == 1
                && own.at(D, 4)
                && !own.has_file(C)
                && !own.has_file(E)
                && !opp.has_file(D)
        }
        PawnStructure::Carlsbad => {
            own.at(D, 4)
                && (own.at(E, 3) || own.at(E, 2))
                && !own.has_file(C)
                && opp.at(D, 4)
                && (opp.at(C, 3) || opp.at(C, 2))
                && !opp.has_file(E)
        }
        PawnStructure::HangingPawns => {
            own.on_file(C) == 1
                && own.on_file(D) == 1
                && own.at(C, 4)
                && own.at(D, 4)
                && !own.has_file(B)
                && !own.has_file(E)
                && !opp.has_file(C)
                && !opp.has_file(D)
        }
        PawnStructure::CaroSlav => {
            own.at(C, 3)
                && own.at(E, 3)
                && !own.has_file(D)
                && opp.at(D, 4)
                && (!opp.has_file(E) || !opp.has_file(C))
        }
        PawnStructure::French => own.at(E, 3) && own.at(D, 4) && opp.at(E, 5) && opp.at(D, 4),
        PawnStructure::Maroczy => {
            own.at(C, 4)
                && own.at(E, 4)
                && !own.has_file(D)
                && (opp.at(D, 3) || opp.at(D, 2))
                && !opp.has_file(C)
        }
        PawnStructure::Hedgehog => {
            own.at(A, 3)
                && own.at(B, 3)
                && own.at(D, 3)
                && own.at(E, 3)
                && opp.at(C, 4)
                && opp.at(E, 4)
        }
        PawnStructure::KingsIndian => own.at(D, 3) && own.at(E, 4) && opp.at(D, 5) && opp.at(E, 4),
    }
}

/// Bit `2 * index + (owner is Black)` of every structure on the board.
pub fn detect(board: &Board) -> u16 {
    let white = Side::new(board, Color::White);
    let black = Side::new(board, Color::Black);
    let mut mask = 0_u16;
    for (index, structure) in ALL_STRUCTURES.iter().enumerate() {
        if matches(*structure, &white, &black) {
            mask |= 1 << (2 * index);
        }
        if matches(*structure, &black, &white) {
            mask |= 1 << (2 * index + 1);
        }
    }
    mask
}

/// Follows the positions of a mainline (call `observe` after every ply) and records the
/// structures that hold long enough inside the window.
#[derive(Default)]
pub struct StructureTracker {
    runs: [u32; 16],
    pub hits: Vec<PawnStructureHit>,
}

impl StructureTracker {
    pub fn observe(&mut self, ply: u32, board: &Board) {
        if !(WINDOW_START..=WINDOW_END).contains(&ply) {
            return;
        }
        let mask = detect(board);
        for bit in 0..16 {
            if mask & (1 << bit) == 0 {
                self.runs[bit] = 0;
                continue;
            }
            self.runs[bit] += 1;
            if self.runs[bit] == MIN_RUN {
                let structure = ALL_STRUCTURES[bit / 2];
                let owner_white = bit % 2 == 0;
                if !self
                    .hits
                    .iter()
                    .any(|hit| hit.structure == structure && hit.owner_white == owner_white)
                {
                    self.hits.push(PawnStructureHit {
                        structure,
                        owner_white,
                        ply: ply + 1 - MIN_RUN,
                    });
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shakmaty::fen::Fen;

    fn board(fen: &str) -> Board {
        fen.parse::<Fen>().unwrap().into_setup().board
    }

    fn found(fen: &str) -> Vec<(PawnStructure, bool)> {
        let mask = detect(&board(fen));
        (0..16)
            .filter(|bit| mask & (1 << bit) != 0)
            .map(|bit| (ALL_STRUCTURES[bit / 2], bit % 2 == 0))
            .collect()
    }

    #[test]
    fn isolated_queen_pawn_for_white_and_black() {
        // Queen's Gambit Accepted / Panov-type IQP on d4.
        assert_eq!(
            found("r1bq1rk1/pp2bppp/2n1pn2/8/3P4/2NB1N2/PP3PPP/R1BQ1RK1 w - - 0 10"),
            vec![(PawnStructure::Iqp, true)]
        );
        // Tarrasch: Black's IQP on d5.
        assert_eq!(
            found("r1bq1rk1/pp2bppp/2n2n2/3p4/8/2N2NP1/PP2PPBP/R1BQ1RK1 w - - 0 10"),
            vec![(PawnStructure::Iqp, false)]
        );
    }

    #[test]
    fn carlsbad_belongs_to_the_side_with_d4_and_e3() {
        assert_eq!(
            found("r1bq1rk1/pp1nbppp/2p2n2/3p2B1/3P4/2NBPN2/PP3PPP/R2QK2R w KQ - 0 9"),
            vec![(PawnStructure::Carlsbad, true)]
        );
    }

    #[test]
    fn hanging_pawns() {
        assert_eq!(
            found("r2q1rk1/p3bppp/1p2pn2/8/2PP4/5N2/P3BPPP/R2Q1RK1 w - - 0 14"),
            vec![(PawnStructure::HangingPawns, true)]
        );
    }

    #[test]
    fn caro_kann_and_french_chain() {
        // Caro-Kann main line after ...dxe4: c6/e6 against d4, no white e-pawn.
        assert_eq!(
            found("r2qkb1r/pp1n1pp1/2p1pn1p/7P/3P4/3Q1NN1/PPPB1PP1/R3K2R b KQkq - 0 12"),
            vec![(PawnStructure::CaroSlav, false)]
        );
        // Advance French.
        assert_eq!(
            found("r1b1kbnr/pp3ppp/1qn1p3/3pP3/3P4/5N2/PP3PPP/RNBQKB1R w KQkq - 0 7"),
            vec![(PawnStructure::French, false)]
        );
    }

    #[test]
    fn maroczy_hedgehog_and_kings_indian() {
        assert_eq!(
            found("r1bq1rk1/pp2ppbp/2np1np1/8/2PNP3/2N1B3/PP2BPPP/R2QK2R w KQ - 0 9"),
            vec![(PawnStructure::Maroczy, true)]
        );
        let hedgehog = found("r2q1rk1/1b1nbppp/pp1ppn2/8/2P1P3/1PN2NP1/P2Q1PBP/R4RK1 w - - 0 12");
        assert!(hedgehog.contains(&(PawnStructure::Hedgehog, false)));
        assert_eq!(
            found("r1bq1rk1/pppnn1bp/3p2p1/3Ppp2/2P1P3/2N2P2/PP2B1PP/R1BQNRK1 w - - 0 11"),
            vec![(PawnStructure::KingsIndian, false)]
        );
    }

    #[test]
    fn the_start_position_has_no_structure() {
        assert!(found("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1").is_empty());
    }

    #[test]
    fn a_structure_counts_only_after_a_run_inside_the_window() {
        let iqp = board("r1bq1rk1/pp2bppp/2n1pn2/8/3P4/2NB1N2/PP3PPP/R1BQ1RK1 w - - 0 10");
        let mut tracker = StructureTracker::default();
        for ply in 1..=22 {
            tracker.observe(ply, &iqp);
        }
        assert!(tracker.hits.is_empty(), "outside the window");
        for ply in 23..=27 {
            tracker.observe(ply, &iqp);
        }
        assert!(tracker.hits.is_empty(), "five plies are not enough");
        tracker.observe(28, &iqp);
        assert_eq!(
            tracker.hits,
            vec![PawnStructureHit {
                structure: PawnStructure::Iqp,
                owner_white: true,
                ply: 23
            }]
        );
    }

    /// Keyword of a chapter or event name for each structure, to read labelled examples.
    fn label_of(text: &str) -> Option<PawnStructure> {
        let text = text.to_lowercase();
        let pairs = [
            (
                ["isolated", "iqp", "aislado"].as_slice(),
                PawnStructure::Iqp,
            ),
            (["carlsbad"].as_slice(), PawnStructure::Carlsbad),
            (
                ["hanging", "colgantes"].as_slice(),
                PawnStructure::HangingPawns,
            ),
            (
                ["caro", "slav", "eslava"].as_slice(),
                PawnStructure::CaroSlav,
            ),
            (["french", "francesa"].as_slice(), PawnStructure::French),
            (["maroczy", "maróczy"].as_slice(), PawnStructure::Maroczy),
            (["hedgehog", "erizo"].as_slice(), PawnStructure::Hedgehog),
            (
                ["king's indian", "kings indian", "india de rey"].as_slice(),
                PawnStructure::KingsIndian,
            ),
        ];
        pairs
            .iter()
            .find(|(words, _)| words.iter().any(|word| text.contains(word)))
            .map(|(_, structure)| *structure)
    }

    /// Validation against labelled examples (I-31): `ONYX_STRUCTURE_PGN` is a PGN whose
    /// `Structure`, `ChapterName` or `Event` header names the structure of each game (for example
    /// the games of Flores Rios's chapters). Prints, per label, how many games the rule finds and
    /// which other structures it marks. Run with
    /// `cargo test --release structure_validation -- --ignored --nocapture`.
    #[test]
    #[ignore = "needs a labelled PGN"]
    fn structure_validation() {
        use crate::db::{player_games::summarize_mainline, Importer, TempGame};
        use pgn_reader::BufferedReader;
        let path = std::env::var("ONYX_STRUCTURE_PGN").expect("ONYX_STRUCTURE_PGN");
        let pgn = std::fs::read_to_string(&path).unwrap();
        // The importer keeps the moves; the labels come from the raw headers of each game.
        let labels: Vec<Option<PawnStructure>> = pgn
            .split("[Event ")
            .skip(1)
            .map(|chunk| {
                let header = |name: &str| {
                    chunk
                        .lines()
                        .find(|line| line.starts_with(&format!("[{name} ")))
                        .map(|line| line.to_string())
                };
                header("Structure")
                    .or_else(|| header("ChapterName"))
                    .and_then(|line| label_of(&line))
                    .or_else(|| label_of(chunk.lines().next().unwrap_or_default()))
            })
            .collect();
        let mut importer = Importer::new(None);
        let games: Vec<TempGame> = BufferedReader::new(pgn.as_bytes())
            .into_iter(&mut importer)
            .flatten()
            .flatten()
            .collect();
        let mut stats: std::collections::BTreeMap<
            String,
            (u32, u32, std::collections::BTreeMap<String, u32>),
        > = Default::default();
        for (game, label) in games.iter().zip(labels) {
            let Some(label) = label else { continue };
            let start = game
                .fen
                .as_deref()
                .and_then(|fen| fen.parse::<Fen>().ok())
                .unwrap_or_default();
            let hits = summarize_mainline(&game.moves, &start)
                .map(|summary| summary.structures)
                .unwrap_or_default();
            let entry = stats.entry(format!("{label:?}")).or_default();
            entry.0 += 1;
            if hits.iter().any(|hit| hit.structure == label) {
                entry.1 += 1;
            }
            for hit in hits.iter().filter(|hit| hit.structure != label) {
                *entry.2.entry(format!("{:?}", hit.structure)).or_default() += 1;
            }
        }
        for (label, (games, found, others)) in stats {
            println!(
                "{label}: {found}/{games} found ({:.0}%), also marked: {others:?}",
                if games > 0 {
                    found as f64 * 100.0 / games as f64
                } else {
                    0.0
                }
            );
        }
    }

    /// Frequency of each structure in a sample of a real database (`ONYX_BENCH_DB`, opened read
    /// only), with example game ids to look at. Run with
    /// `cargo test --release structure_frequency -- --ignored --nocapture`.
    #[test]
    #[ignore = "needs a real database"]
    fn structure_frequency() {
        use crate::db::{player_games::summarize_mainline, schema::games};
        use diesel::prelude::*;
        let path = std::env::var("ONYX_BENCH_DB").expect("ONYX_BENCH_DB");
        let db = &mut SqliteConnection::establish(&format!("file:{path}?mode=ro")).unwrap();
        let sample: i64 = std::env::var("ONYX_BENCH_SAMPLE")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(20_000);
        let rows: Vec<(i32, Option<String>, Vec<u8>)> = games::table
            .filter(games::fen.is_null())
            .filter(games::white_elo.ge(2200))
            .select((games::id, games::fen, games::moves))
            .limit(sample)
            .load(db)
            .unwrap();
        let started = std::time::Instant::now();
        let mut counts: std::collections::BTreeMap<String, (u32, Vec<i32>)> = Default::default();
        let mut any = 0;
        for (id, _, moves) in &rows {
            let hits = summarize_mainline(moves, &Fen::default())
                .map(|summary| summary.structures)
                .unwrap_or_default();
            if !hits.is_empty() {
                any += 1;
            }
            for hit in hits {
                let entry = counts
                    .entry(format!(
                        "{:?}/{}",
                        hit.structure,
                        if hit.owner_white { "W" } else { "B" }
                    ))
                    .or_default();
                entry.0 += 1;
                if entry.1.len() < 3 {
                    entry.1.push(*id);
                }
            }
        }
        println!(
            "{} games in {} ms, {any} with a structure",
            rows.len(),
            started.elapsed().as_millis()
        );
        let by_id: std::collections::HashMap<i32, &Vec<u8>> =
            rows.iter().map(|(id, _, moves)| (*id, moves)).collect();
        for (key, (count, examples)) in counts {
            println!(
                "{key}: {count} ({:.1}%), e.g. {examples:?}",
                count as f64 * 100.0 / rows.len() as f64
            );
            // The board where the first example starts to count, to check the rule by eye.
            if let Some(moves) = examples.first().and_then(|id| by_id.get(id)) {
                let name = key.split('/').next().unwrap_or_default().to_string();
                let ply = summarize_mainline(moves, &Fen::default())
                    .and_then(|summary| {
                        summary
                            .structures
                            .into_iter()
                            .find(|hit| format!("{:?}", hit.structure) == name)
                    })
                    .map_or(0, |hit| hit.ply);
                let mut chess = shakmaty::Chess::default();
                for byte in crate::db::encoding::iter_mainline_move_bytes(moves).take(ply as usize)
                {
                    let Some(movement) = crate::db::encoding::decode_move(byte, &chess) else {
                        break;
                    };
                    shakmaty::Position::play_unchecked(&mut chess, &movement);
                }
                let setup = shakmaty::Position::into_setup(chess, shakmaty::EnPassantMode::Legal);
                println!("    {}", Fen::from_setup(setup));
            }
        }
    }
}
