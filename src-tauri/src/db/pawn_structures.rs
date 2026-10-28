//! Named pawn structures (I-31): the eight of 8.6 and the ones of Flores Rios's *Chess Structures*
//! added in 9.3, 28 in all.
//!
//! Each rule looks only at the pawns and is written for the side that "owns" the structure, the one
//! whose formation gives it its name (the isolated pawn, the Maróczy bind, the King's Indian
//! chain…), with ranks counted from that side. The same rule is applied to both colours, so the
//! reversed versions come for free. A game has a structure when it holds for `MIN_RUN`
//! consecutive plies inside the window after the opening.
//!
//! The rules of one family exclude each other where the book separates them (the King's Indian
//! types by the c-pawns, the French types by the e- and f-pawns…); every skeleton of the book is
//! recognised as its own structure and as no other (see the tests).

use serde::{Deserialize, Serialize};
use shakmaty::{fen::Fen, Bitboard, Board, Color, File, Rank, Square};
use specta::Type;

use crate::error::Error;

/// First and last ply looked at: from move 12 to move 25.
pub const WINDOW_START: u32 = 23;
pub const WINDOW_END: u32 = 50;
/// Plies in a row the structure must hold to count (three moves).
pub const MIN_RUN: u32 = 6;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum PawnStructure {
    /// Isolated queen's pawn: a d-pawn on the fourth rank without own c- or e-pawns.
    Iqp,
    /// c- and d-pawns side by side on the fourth rank without b- or e-pawns.
    HangingPawns,
    /// c6/e6 without a d-pawn against d4, the opponent without an e-pawn.
    CaroKann,
    /// c6/e6 without a d-pawn against d4 and e-pawn, the opponent without a c-pawn.
    Slav,
    /// d5/e6/f5 against d4 (not e5).
    Stonewall,
    /// The d4/e4 centre against no d-pawn and a c-pawn on c5 or gone (Grünfeld exchange).
    Grunfeld,
    /// The side with d4/e3 against c6/d5 (the minority-attack side).
    Carlsbad,
    /// d6/e5 without a c-pawn against a d5-pawn and no e-pawn (exd5 in the Sicilian).
    NajdorfI,
    /// d6/e5 without a c-pawn against e4 and no d-pawn.
    NajdorfII,
    /// a6/b6/d6/e6 against c4/e4.
    Hedgehog,
    /// c4/e4 without a d-pawn against a Sicilian set-up (d-pawn, no c-pawn).
    Maroczy,
    /// c5/d6 without an e-pawn against d5/e4 without a c-pawn.
    AsymmetricBenoni,
    /// c5/d6 against c4/d5, neither side with an e-pawn.
    SymmetricBenoni,
    /// d6/e5 against d5/e4, no c-pawns.
    KingsIndianI,
    /// c5/d6/e5 against c4/d5/e4.
    KingsIndianII,
    /// c7 (or c6)/d6/e5 against c4/d5/e4.
    KingsIndianIII,
    /// d6 and a c-pawn at home, no e-pawn, against c4/e4 without a d-pawn (…exd4).
    OpenKingsIndian,
    /// d6/e5 and a c-pawn at home against c4/d4/e4, or e5 against c4/e4 after the d-pawns left.
    KingsIndianComplex,
    /// e6/d5 without f5 against d4 and no e-pawn (after …f6 and exf6), c-pawns alike.
    FrenchI,
    /// e6/d5 without a c-pawn against e5 and no d-pawn (…cxd4).
    FrenchII,
    /// The chain e6/d5 against d4/e5.
    FrenchIII,
    /// Three pawns on each wing and no d- or e-pawn against two on the queenside and four on
    /// the kingside: the owner has the queenside majority and the opponent the kingside one.
    ThreeVsFour,
    /// c5/d4 without an e-pawn against d5 without a c-pawn, the e-pawn at home.
    Panov,
    /// d6/e7/g6 without a c-pawn against e4 without a d-pawn.
    Dragon,
    /// d6/e6 without a c-pawn against e4 without a d-pawn.
    Scheveningen,
    /// c5/d6 with the e-pawn at home and no a- or b-pawns against d5.
    Benko,
    /// c3/d5/e4 against c4/d6/e5.
    ClosedRuyLopez,
    /// c3/d4/e4 against d6/e5 with the c-pawn on c5, c6 or c7.
    LopezFormation,
}

pub const ALL_STRUCTURES: [PawnStructure; 28] = [
    PawnStructure::Iqp,
    PawnStructure::HangingPawns,
    PawnStructure::CaroKann,
    PawnStructure::Slav,
    PawnStructure::Stonewall,
    PawnStructure::Grunfeld,
    PawnStructure::Carlsbad,
    PawnStructure::NajdorfI,
    PawnStructure::NajdorfII,
    PawnStructure::Hedgehog,
    PawnStructure::Maroczy,
    PawnStructure::AsymmetricBenoni,
    PawnStructure::SymmetricBenoni,
    PawnStructure::KingsIndianI,
    PawnStructure::KingsIndianII,
    PawnStructure::KingsIndianIII,
    PawnStructure::OpenKingsIndian,
    PawnStructure::KingsIndianComplex,
    PawnStructure::FrenchI,
    PawnStructure::FrenchII,
    PawnStructure::FrenchIII,
    PawnStructure::ThreeVsFour,
    PawnStructure::Panov,
    PawnStructure::Dragon,
    PawnStructure::Scheveningen,
    PawnStructure::Benko,
    PawnStructure::ClosedRuyLopez,
    PawnStructure::LopezFormation,
];

/// Bits of a detection mask: two per structure (owner White, owner Black).
const MASK_BITS: usize = 2 * ALL_STRUCTURES.len();

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

    /// The pawn of `file` is still at home or one step ahead.
    fn home(&self, file: File) -> bool {
        self.at(file, 2) || self.at(file, 3)
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
        PawnStructure::CaroKann => {
            own.at(C, 3) && own.at(E, 3) && !own.has_file(D) && opp.at(D, 4) && !opp.has_file(E)
        }
        PawnStructure::Slav => {
            own.at(C, 3)
                && own.at(E, 3)
                && !own.has_file(D)
                && opp.at(D, 4)
                && opp.has_file(E)
                && !opp.has_file(C)
        }
        // With the opponent's pawn on e5 it is a French chain with …f5, not a Stonewall.
        PawnStructure::Stonewall => {
            own.at(D, 4) && own.at(E, 3) && own.at(F, 4) && opp.at(D, 4) && !opp.at(E, 5)
        }
        PawnStructure::Grunfeld => {
            own.at(D, 4)
                && own.at(E, 4)
                && (own.at(C, 3) || !own.has_file(C))
                && !opp.has_file(D)
                && opp.home(E)
                && (opp.at(C, 4) || !opp.has_file(C))
        }
        PawnStructure::Carlsbad => {
            own.at(D, 4)
                && (own.at(E, 3) || own.at(E, 2))
                && !own.has_file(C)
                && opp.at(D, 4)
                && opp.home(C)
                && !opp.has_file(E)
        }
        PawnStructure::NajdorfI => {
            own.at(D, 3)
                && own.at(E, 4)
                && !own.has_file(C)
                && opp.at(D, 5)
                && !opp.has_file(E)
                && !opp.at(C, 4)
        }
        PawnStructure::NajdorfII => {
            own.at(D, 3) && own.at(E, 4) && !own.has_file(C) && opp.at(E, 4) && !opp.has_file(D)
        }
        PawnStructure::Hedgehog => {
            own.at(A, 3)
                && own.at(B, 3)
                && own.at(D, 3)
                && own.at(E, 3)
                && opp.at(C, 4)
                && opp.at(E, 4)
        }
        PawnStructure::Maroczy => {
            own.at(C, 4) && own.at(E, 4) && !own.has_file(D) && opp.home(D) && !opp.has_file(C)
        }
        PawnStructure::AsymmetricBenoni => {
            own.at(C, 4)
                && own.at(D, 3)
                && !own.has_file(E)
                && opp.at(D, 5)
                && opp.at(E, 4)
                && !opp.has_file(C)
        }
        PawnStructure::SymmetricBenoni => {
            own.at(C, 4)
                && own.at(D, 3)
                && !own.has_file(E)
                && opp.at(C, 4)
                && opp.at(D, 5)
                && !opp.has_file(E)
        }
        PawnStructure::KingsIndianI => {
            own.at(D, 3)
                && own.at(E, 4)
                && !own.has_file(C)
                && opp.at(D, 5)
                && opp.at(E, 4)
                && !opp.has_file(C)
        }
        PawnStructure::KingsIndianII => {
            own.at(C, 4)
                && own.at(D, 3)
                && own.at(E, 4)
                && opp.at(C, 4)
                && opp.at(D, 5)
                && opp.at(E, 4)
        }
        PawnStructure::KingsIndianIII => {
            own.home(C)
                && own.at(D, 3)
                && own.at(E, 4)
                && opp.at(C, 4)
                && opp.at(D, 5)
                && opp.at(E, 4)
        }
        PawnStructure::OpenKingsIndian => {
            own.home(C)
                && own.at(D, 3)
                && !own.has_file(E)
                && opp.at(C, 4)
                && opp.at(E, 4)
                && !opp.has_file(D)
        }
        PawnStructure::KingsIndianComplex => {
            let chain = own.at(D, 3) && opp.at(D, 4);
            let exchanged = !own.has_file(D) && !opp.has_file(D);
            own.home(C) && own.at(E, 4) && opp.at(C, 4) && opp.at(E, 4) && (chain || exchanged)
        }
        // Both c-pawns on the board or both gone (…cxd4 cxd4): with only the opponent's c-pawn
        // it is a Carlsbad seen from the other side.
        PawnStructure::FrenchI => {
            own.at(E, 3)
                && own.at(D, 4)
                && !own.at(F, 4)
                && opp.at(D, 4)
                && !opp.has_file(E)
                && own.has_file(C) == opp.has_file(C)
        }
        PawnStructure::FrenchII => {
            own.at(E, 3) && own.at(D, 4) && !own.has_file(C) && opp.at(E, 5) && !opp.has_file(D)
        }
        PawnStructure::FrenchIII => own.at(E, 3) && own.at(D, 4) && opp.at(E, 5) && opp.at(D, 4),
        PawnStructure::ThreeVsFour => {
            let queenside = |side: &Side| side.on_file(A) + side.on_file(B) + side.on_file(C);
            let kingside = |side: &Side| side.on_file(F) + side.on_file(G) + side.on_file(H);
            !own.has_file(D)
                && !own.has_file(E)
                && own.has_file(C)
                && !opp.has_file(C)
                && !opp.has_file(D)
                && opp.has_file(E)
                && queenside(own) == queenside(opp) + 1
                && kingside(own) + 1 == kingside(opp) + opp.on_file(E)
        }
        PawnStructure::Panov => {
            own.at(C, 5)
                && own.at(D, 4)
                && !own.has_file(E)
                && opp.at(D, 4)
                && !opp.has_file(C)
                && opp.home(E)
        }
        PawnStructure::Dragon => {
            own.at(D, 3)
                && own.at(E, 2)
                && own.at(G, 3)
                && !own.has_file(C)
                && opp.at(E, 4)
                && !opp.has_file(D)
                && !opp.at(C, 4)
        }
        PawnStructure::Scheveningen => {
            own.at(D, 3)
                && own.at(E, 3)
                && !own.has_file(C)
                && opp.at(E, 4)
                && !opp.has_file(D)
                && !opp.at(C, 4)
        }
        PawnStructure::Benko => {
            own.at(C, 4)
                && own.at(D, 3)
                && own.home(E)
                && !own.has_file(A)
                && !own.has_file(B)
                && opp.at(D, 5)
                && !opp.has_file(C)
        }
        PawnStructure::ClosedRuyLopez => {
            own.at(C, 3)
                && own.at(D, 5)
                && own.at(E, 4)
                && opp.at(C, 5)
                && opp.at(D, 3)
                && opp.at(E, 4)
        }
        PawnStructure::LopezFormation => {
            own.at(C, 3)
                && own.at(D, 4)
                && own.at(E, 4)
                && (opp.at(C, 4) || opp.home(C))
                && opp.at(D, 3)
                && opp.at(E, 4)
        }
    }
}

/// Bit `2 * index + (owner is Black)` of every structure on the board.
pub fn detect(board: &Board) -> u64 {
    let white = Side::new(board, Color::White);
    let black = Side::new(board, Color::Black);
    let mut mask = 0_u64;
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

/// A structure on a board and who owns it, without the ply of a game.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PawnStructureOnBoard {
    pub structure: PawnStructure,
    pub owner_white: bool,
}

fn structures_on_board(board: &Board) -> Vec<PawnStructureOnBoard> {
    let mask = detect(board);
    (0..MASK_BITS)
        .filter(|bit| mask & (1 << bit) != 0)
        .map(|bit| PawnStructureOnBoard {
            structure: ALL_STRUCTURES[bit / 2],
            owner_white: bit % 2 == 0,
        })
        .collect()
}

/// The named structures of a position, for the board and the position report (9.3). It is the
/// rule alone: a game needs the structure to hold for a few moves to count it.
#[tauri::command]
#[specta::specta]
pub fn detect_pawn_structures(fen: String) -> Result<Vec<PawnStructureOnBoard>, Error> {
    let fen: Fen = fen.parse()?;
    Ok(structures_on_board(&fen.into_setup().board))
}

/// Follows the positions of a mainline (call `observe` after every ply) and records the
/// structures that hold long enough inside the window.
pub struct StructureTracker {
    runs: [u32; MASK_BITS],
    pub hits: Vec<PawnStructureHit>,
}

impl Default for StructureTracker {
    fn default() -> Self {
        Self {
            runs: [0; MASK_BITS],
            hits: Vec::new(),
        }
    }
}

impl StructureTracker {
    pub fn observe(&mut self, ply: u32, board: &Board) {
        if !(WINDOW_START..=WINDOW_END).contains(&ply) {
            return;
        }
        let mask = detect(board);
        for bit in 0..MASK_BITS {
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
        (0..MASK_BITS)
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
            vec![(PawnStructure::CaroKann, false)]
        );
        // Advance French.
        assert_eq!(
            found("r1b1kbnr/pp3ppp/1qn1p3/3pP3/3P4/5N2/PP3PPP/RNBQKB1R w KQkq - 0 7"),
            vec![(PawnStructure::FrenchIII, false)]
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
            vec![(PawnStructure::KingsIndianIII, false)]
        );
    }

    /// The skeletons of Flores Rios's chapters (only the pawns and the kings), each with the
    /// structure it names and the side that owns it: every one is found as that structure and as
    /// no other, so the rules of a family do not overlap.
    const BOOK_SKELETONS: [(&str, PawnStructure, bool); 20] = [
        (
            "4k3/ppp3pp/4p3/3p1p2/3P4/8/PPP1PPPP/4K3 w - - 0 1",
            PawnStructure::Stonewall,
            false,
        ),
        (
            "4k3/pp2pppp/8/2p5/3PP3/2P5/P4PPP/4K3 w - - 0 1",
            PawnStructure::Grunfeld,
            true,
        ),
        (
            "4k3/pp3ppp/3p4/3Pp3/8/8/PPP2PPP/4K3 w - - 0 1",
            PawnStructure::NajdorfI,
            false,
        ),
        (
            "4k3/pp3ppp/3p4/4p3/4P3/8/PPP2PPP/4K3 w - - 0 1",
            PawnStructure::NajdorfII,
            false,
        ),
        (
            "4k3/pp3ppp/3p4/2pP4/4P3/8/PP3PPP/4K3 w - - 0 1",
            PawnStructure::AsymmetricBenoni,
            false,
        ),
        (
            "4k3/pp3ppp/3p4/2pP4/2P5/8/PP3PPP/4K3 w - - 0 1",
            PawnStructure::SymmetricBenoni,
            false,
        ),
        (
            "4k3/pp3ppp/3p4/3Pp3/4P3/8/PP3PPP/4K3 w - - 0 1",
            PawnStructure::KingsIndianI,
            false,
        ),
        (
            "4k3/pp3ppp/3p4/2pPp3/2P1P3/8/PP3PPP/4K3 w - - 0 1",
            PawnStructure::KingsIndianII,
            false,
        ),
        (
            "4k3/ppp2ppp/3p4/3Pp3/2P1P3/8/PP3PPP/4K3 w - - 0 1",
            PawnStructure::KingsIndianIII,
            false,
        ),
        (
            "4k3/ppp2ppp/3p4/8/2P1P3/8/PP3PPP/4K3 w - - 0 1",
            PawnStructure::OpenKingsIndian,
            false,
        ),
        (
            "4k3/pp3ppp/2pp4/4p3/2PPP3/8/PP3PPP/4K3 w - - 0 1",
            PawnStructure::KingsIndianComplex,
            false,
        ),
        (
            "4k3/ppp3pp/4p3/3p4/3P4/8/PPP2PPP/4K3 w - - 0 1",
            PawnStructure::FrenchI,
            false,
        ),
        (
            "4k3/pp3ppp/4p3/3pP3/8/2P5/PP3PPP/4K3 w - - 0 1",
            PawnStructure::FrenchII,
            false,
        ),
        (
            "4k3/pp3ppp/4p3/8/8/2P5/PP3PPP/4K3 w - - 0 1",
            PawnStructure::ThreeVsFour,
            true,
        ),
        (
            "4k3/pp2pppp/8/2Pp4/3P4/8/PP3PPP/4K3 w - - 0 1",
            PawnStructure::Panov,
            true,
        ),
        (
            "4k3/pp2pp1p/3p2p1/8/4P3/8/PPP2PPP/4K3 w - - 0 1",
            PawnStructure::Dragon,
            false,
        ),
        (
            "4k3/pp3ppp/3pp3/8/4P3/8/PPP2PPP/4K3 w - - 0 1",
            PawnStructure::Scheveningen,
            false,
        ),
        (
            "4k3/4pp1p/3p2p1/2pP4/4P3/8/PP3PPP/4K3 w - - 0 1",
            PawnStructure::Benko,
            false,
        ),
        (
            "4k3/p4ppp/3p4/1p1Pp3/2p1P3/2P5/PP3PPP/4K3 w - - 0 1",
            PawnStructure::ClosedRuyLopez,
            true,
        ),
        (
            "4k3/pp3ppp/3p4/2p1p3/3PP3/2P5/PP3PPP/4K3 w - - 0 1",
            PawnStructure::LopezFormation,
            true,
        ),
    ];

    /// Swaps the colours of a position (pawns mirrored rank by rank), to check the reversed rule.
    fn mirrored(fen: &str) -> String {
        let placement = fen.split(' ').next().unwrap();
        let ranks: Vec<String> = placement
            .split('/')
            .rev()
            .map(|rank| {
                rank.chars()
                    .map(|c| {
                        if c.is_ascii_uppercase() {
                            c.to_ascii_lowercase()
                        } else {
                            c.to_ascii_uppercase()
                        }
                    })
                    .collect()
            })
            .collect();
        format!("{} w - - 0 1", ranks.join("/"))
    }

    #[test]
    fn every_book_skeleton_is_its_own_structure_and_no_other() {
        for (fen, structure, owner_white) in BOOK_SKELETONS {
            assert_eq!(
                found(fen),
                vec![(structure, owner_white)],
                "{structure:?}: {fen}"
            );
            assert_eq!(
                found(&mirrored(fen)),
                vec![(structure, !owner_white)],
                "{structure:?} reversed"
            );
        }
    }

    /// The skeletons the interface shows for the structures of 8.6 (`utils/structures/catalog.ts`).
    const ONYX_SKELETONS: [(&str, PawnStructure, bool); 7] = [
        (
            "4k3/pp3ppp/4p3/8/3P4/8/PP3PPP/4K3 w - - 0 1",
            PawnStructure::Iqp,
            true,
        ),
        (
            "4k3/p4ppp/1p2p3/8/2PP4/8/P4PPP/4K3 w - - 0 1",
            PawnStructure::HangingPawns,
            true,
        ),
        (
            "4k3/pp3ppp/2p1p3/8/3P4/8/PPP2PPP/4K3 w - - 0 1",
            PawnStructure::CaroKann,
            false,
        ),
        (
            "4k3/pp3ppp/2p1p3/8/3P4/4P3/PP3PPP/4K3 w - - 0 1",
            PawnStructure::Slav,
            false,
        ),
        (
            "4k3/pp3ppp/2p5/3p4/3P4/4P3/PP3PPP/4K3 w - - 0 1",
            PawnStructure::Carlsbad,
            true,
        ),
        (
            "4k3/pp2pp1p/3p2p1/8/2P1P3/8/PP3PPP/4K3 w - - 0 1",
            PawnStructure::Maroczy,
            true,
        ),
        (
            "4k3/pp3ppp/4p3/3pP3/3P4/8/PP3PPP/4K3 w - - 0 1",
            PawnStructure::FrenchIII,
            false,
        ),
    ];

    #[test]
    fn the_interface_skeletons_are_their_own_structure() {
        for (fen, structure, owner_white) in ONYX_SKELETONS {
            assert_eq!(found(fen), vec![(structure, owner_white)], "{structure:?}");
        }
        // The hedgehog is also a Maróczy bind seen from White.
        assert_eq!(
            found("4k3/5ppp/pp1pp3/8/2P1P3/8/PP3PPP/4K3 w - - 0 1"),
            vec![
                (PawnStructure::Hedgehog, false),
                (PawnStructure::Maroczy, true)
            ]
        );
    }

    #[test]
    fn caro_kann_and_slav_differ_by_the_missing_white_pawn() {
        // Slav after ...dxc4 and Bxc4: White keeps the e-pawn and lost the c-pawn.
        assert_eq!(
            found("rn1qkb1r/pp3ppp/2p1pn2/5b2/P1BP4/2N1PN2/1P3PPP/R1BQK2R b KQkq - 0 7"),
            vec![(PawnStructure::Slav, false)]
        );
    }

    #[test]
    fn the_exchange_kings_indian_is_part_of_the_complex() {
        // dxe5 dxe5: c4/e4 against c6/e5 without d-pawns.
        assert_eq!(
            found("r1bq1rk1/pp1n1pbp/2p2np1/4p3/2P1P3/2N2N2/PP2BPPP/R1BQ1RK1 w - - 0 10"),
            vec![(PawnStructure::KingsIndianComplex, false)]
        );
    }

    #[test]
    fn a_dragon_with_the_c_pawn_at_home() {
        assert_eq!(
            found("r1bq1rk1/pp2ppbp/2np1np1/8/3NP3/2N1B3/PPP1BPPP/R2QK2R w KQ - 0 9"),
            vec![(PawnStructure::Dragon, false)]
        );
    }

    #[test]
    fn detect_command_reads_a_fen() {
        let found = detect_pawn_structures(BOOK_SKELETONS[0].0.to_string()).unwrap();
        assert_eq!(
            found,
            vec![PawnStructureOnBoard {
                structure: PawnStructure::Stonewall,
                owner_white: false
            }]
        );
        assert!(detect_pawn_structures("not a fen".to_string()).is_err());
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
        use PawnStructure::*;
        let text = text.to_lowercase();
        let kid = ["kid", "king's indian", "kings indian", "india de rey"]
            .iter()
            .any(|word| text.contains(word));
        let type_of = || {
            [
                "type iii", "tipo iii", "type ii", "tipo ii", "type i", "tipo i",
            ]
            .iter()
            .position(|word| text.contains(word))
            .map(|index| 3 - index / 2)
        };
        if kid {
            return Some(if text.contains("open") || text.contains("abierta") {
                OpenKingsIndian
            } else if text.contains("complex") || text.contains("complejo") {
                KingsIndianComplex
            } else {
                match type_of() {
                    Some(1) => KingsIndianI,
                    Some(2) => KingsIndianII,
                    _ => KingsIndianIII,
                }
            });
        }
        if text.contains("french") || text.contains("francesa") {
            return Some(match type_of() {
                Some(1) => FrenchI,
                Some(2) => FrenchII,
                _ => FrenchIII,
            });
        }
        if text.contains("najdorf") {
            return Some(if type_of() == Some(2) {
                NajdorfII
            } else {
                NajdorfI
            });
        }
        if text.contains("benoni") {
            return Some(
                if text.contains("symmetric") && !text.contains("asymmetric")
                    || text.contains("simétrica") && !text.contains("asimétrica")
                {
                    SymmetricBenoni
                } else {
                    AsymmetricBenoni
                },
            );
        }
        let pairs = [
            (["isolated", "iqp", "aislado"].as_slice(), Iqp),
            (["carlsbad"].as_slice(), Carlsbad),
            (["hanging", "colgantes"].as_slice(), HangingPawns),
            (["caro"].as_slice(), CaroKann),
            (["slav", "eslava"].as_slice(), Slav),
            (["stonewall"].as_slice(), Stonewall),
            (["grünfeld", "grunfeld"].as_slice(), Grunfeld),
            (["maroczy", "maróczy"].as_slice(), Maroczy),
            (["hedgehog", "erizo"].as_slice(), Hedgehog),
            (["3-3", "4-2"].as_slice(), ThreeVsFour),
            (["panov"].as_slice(), Panov),
            (["dragon", "dragón"].as_slice(), Dragon),
            (["scheveningen"].as_slice(), Scheveningen),
            (["benko"].as_slice(), Benko),
            (
                ["closed ruy", "ruy lópez cerrada", "ruy lopez cerrada"].as_slice(),
                ClosedRuyLopez,
            ),
            (
                ["lopez formation", "formación lópez"].as_slice(),
                LopezFormation,
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
