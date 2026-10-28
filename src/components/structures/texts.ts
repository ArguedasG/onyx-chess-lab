/**
 * Texts of the named pawn structures (I-31): name, rule, a short summary and the typical plans
 * of each colour. The plans are Onyx's own summaries of the ideas of Mauricio Flores Rios's
 * *Chess Structures* and of common chess knowledge, never the book's wording.
 *
 * Generated from one table so English and Spanish stay in step; edit them here and in the two
 * translation files together.
 */
import type { TFunction } from "i18next";
import type { PawnStructure } from "@/bindings";
import type { StructureFamily } from "@/utils/structures/catalog";

export function familyName(family: StructureFamily, t: TFunction): string {
    return {
        isolated: t("Structures.Family.Isolated", "Isolated and hanging pawns"),
        queensGambit: t("Structures.Family.QueensGambit", "Queen's Gambit, Caro-Kann and Slav"),
        dutchGrunfeld: t("Structures.Family.DutchGrunfeld", "Dutch and Grünfeld"),
        sicilian: t("Structures.Family.Sicilian", "Sicilian"),
        benoni: t("Structures.Family.Benoni", "Benoni"),
        kingsIndian: t("Structures.Family.KingsIndian", "King's Indian"),
        french: t("Structures.Family.French", "French"),
        ruyLopez: t("Structures.Family.RuyLopez", "Ruy Lopez"),
    }[family];
}

export function structureName(structure: PawnStructure, t: TFunction): string {
    return {
        iqp: t("Structures.Name.Iqp", "Isolated queen's pawn"),
        hangingPawns: t("Structures.Name.HangingPawns", "Hanging pawns"),
        caroKann: t("Structures.Name.CaroKann", "Caro-Kann"),
        slav: t("Structures.Name.Slav", "Slav"),
        stonewall: t("Structures.Name.Stonewall", "Stonewall"),
        grunfeld: t("Structures.Name.Grunfeld", "Grünfeld centre"),
        carlsbad: t("Structures.Name.Carlsbad", "Carlsbad"),
        najdorfI: t("Structures.Name.NajdorfI", "Najdorf type I"),
        najdorfII: t("Structures.Name.NajdorfII", "Najdorf type II"),
        hedgehog: t("Structures.Name.Hedgehog", "Hedgehog"),
        maroczy: t("Structures.Name.Maroczy", "Maróczy bind"),
        asymmetricBenoni: t("Structures.Name.AsymmetricBenoni", "Asymmetric Benoni"),
        symmetricBenoni: t("Structures.Name.SymmetricBenoni", "Symmetric Benoni"),
        kingsIndianI: t("Structures.Name.KingsIndianI", "King's Indian type I"),
        kingsIndianII: t("Structures.Name.KingsIndianII", "King's Indian type II"),
        kingsIndianIII: t("Structures.Name.KingsIndianIII", "King's Indian type III"),
        openKingsIndian: t("Structures.Name.OpenKingsIndian", "Open King's Indian"),
        kingsIndianComplex: t("Structures.Name.KingsIndianComplex", "King's Indian complex"),
        frenchI: t("Structures.Name.FrenchI", "French type I"),
        frenchII: t("Structures.Name.FrenchII", "French type II"),
        frenchIII: t("Structures.Name.FrenchIII", "French type III"),
        threeVsFour: t("Structures.Name.ThreeVsFour", "3-3 against 4-2"),
        panov: t("Structures.Name.Panov", "Panov"),
        dragon: t("Structures.Name.Dragon", "Dragon formation"),
        scheveningen: t("Structures.Name.Scheveningen", "Scheveningen"),
        benko: t("Structures.Name.Benko", "Benko"),
        closedRuyLopez: t("Structures.Name.ClosedRuyLopez", "Closed Ruy Lopez"),
        lopezFormation: t("Structures.Name.LopezFormation", "Lopez formation"),
    }[structure];
}

/** The rule as the interface explains it, from the side that owns the structure. */
export function structureRule(structure: PawnStructure, t: TFunction): string {
    return {
        iqp: t(
            "Structures.Rule.Iqp",
            "A lone d-pawn on the fourth rank with no own c- or e-pawns; the opponent has no d-pawn.",
        ),
        hangingPawns: t(
            "Structures.Rule.HangingPawns",
            "c- and d-pawns side by side on the fourth rank, no own b- or e-pawns, no enemy c- or d-pawns.",
        ),
        caroKann: t(
            "Structures.Rule.CaroKann",
            "c6 and e6 without a d-pawn against d4, White without an e-pawn.",
        ),
        slav: t(
            "Structures.Rule.Slav",
            "c6 and e6 without a d-pawn against d4 and an e-pawn, White without a c-pawn.",
        ),
        stonewall: t(
            "Structures.Rule.Stonewall",
            "d5, e6 and f5 against d4, without an enemy pawn on e5.",
        ),
        grunfeld: t(
            "Structures.Rule.Grunfeld",
            "d4 and e4 (c3 or no c-pawn) against no d-pawn, the e-pawn at home and c5 or no c-pawn.",
        ),
        carlsbad: t(
            "Structures.Rule.Carlsbad",
            "d4 and e3 (or e2) without a c-pawn against c6 (or c7) and d5 without an e-pawn: the minority-attack side owns it.",
        ),
        najdorfI: t(
            "Structures.Rule.NajdorfI",
            "d6 and e5 without a c-pawn against a pawn on d5 without an e-pawn (Nd5 and exd5).",
        ),
        najdorfII: t(
            "Structures.Rule.NajdorfII",
            "d6 and e5 without a c-pawn against e4 without a d-pawn.",
        ),
        hedgehog: t("Structures.Rule.Hedgehog", "a6, b6, d6 and e6 against c4 and e4."),
        maroczy: t(
            "Structures.Rule.Maroczy",
            "c4 and e4 without a d-pawn against a d-pawn and no c-pawn (a Sicilian set-up).",
        ),
        asymmetricBenoni: t(
            "Structures.Rule.AsymmetricBenoni",
            "c5 and d6 without an e-pawn against d5 and e4 without a c-pawn.",
        ),
        symmetricBenoni: t(
            "Structures.Rule.SymmetricBenoni",
            "c5 and d6 against c4 and d5, neither side with an e-pawn.",
        ),
        kingsIndianI: t(
            "Structures.Rule.KingsIndianI",
            "d6 and e5 against d5 and e4, with no c-pawns.",
        ),
        kingsIndianII: t("Structures.Rule.KingsIndianII", "c5, d6 and e5 against c4, d5 and e4."),
        kingsIndianIII: t(
            "Structures.Rule.KingsIndianIII",
            "d6 and e5 with the c-pawn at home against c4, d5 and e4.",
        ),
        openKingsIndian: t(
            "Structures.Rule.OpenKingsIndian",
            "d6 and the c-pawn at home without an e-pawn against c4 and e4 without a d-pawn (...exd4).",
        ),
        kingsIndianComplex: t(
            "Structures.Rule.KingsIndianComplex",
            "d6, e5 and the c-pawn at home against c4, d4 and e4; or, after dxe5 dxe5, e5 against c4 and e4.",
        ),
        frenchI: t(
            "Structures.Rule.FrenchI",
            "e6 and d5 without f5 against d4 without an e-pawn, both c-pawns present or both gone.",
        ),
        frenchII: t(
            "Structures.Rule.FrenchII",
            "e6 and d5 without a c-pawn against e5 without a d-pawn (...cxd4).",
        ),
        frenchIII: t("Structures.Rule.FrenchIII", "The chain e6/d5 against d4/e5."),
        threeVsFour: t(
            "Structures.Rule.ThreeVsFour",
            "No d- or e-pawns against no c- or d-pawns: the owner has the queenside majority, the opponent the kingside one.",
        ),
        panov: t(
            "Structures.Rule.Panov",
            "c5 and d4 without an e-pawn against d5 with the e-pawn at home and no c-pawn.",
        ),
        dragon: t(
            "Structures.Rule.Dragon",
            "d6, e7 and g6 without a c-pawn against e4 without a d-pawn (and no c4).",
        ),
        scheveningen: t(
            "Structures.Rule.Scheveningen",
            "d6 and e6 without a c-pawn against e4 without a d-pawn (and no c4).",
        ),
        benko: t(
            "Structures.Rule.Benko",
            "c5 and d6 with the e-pawn at home and no a- or b-pawns, against d5 without a c-pawn.",
        ),
        closedRuyLopez: t("Structures.Rule.ClosedRuyLopez", "c3, d5 and e4 against c4, d6 and e5."),
        lopezFormation: t(
            "Structures.Rule.LopezFormation",
            "c3, d4 and e4 against d6 and e5 with the c-pawn on c5, c6 or c7.",
        ),
    }[structure];
}

export function structureSummary(structure: PawnStructure, t: TFunction): string {
    return {
        iqp: t(
            "Structures.Summary.Iqp",
            "The owner usually has the better middlegame (attack, open lines), the opponent the better endgame. Keeping the light-squared bishop is often what decides whether the attack is real.",
        ),
        hangingPawns: t(
            "Structures.Summary.HangingPawns",
            "Two central pawns side by side: space and control while they stay abreast, weaknesses once one is forced forward.",
        ),
        caroKann: t(
            "Structures.Summary.CaroKann",
            "After ...dxe4 White has more space and central control, and is usually somewhat better; Black must change the structure, most often with ...c5.",
        ),
        slav: t(
            "Structures.Summary.Slav",
            "After ...dxc4 White has more space and central control; Black looks for a central break to change the structure, as in the Caro-Kann.",
        ),
        stonewall: t(
            "Structures.Summary.Stonewall",
            "A rock-solid centre and kingside chances for the owner, at the cost of a permanent hole on e5. Statistically it holds up far better than its reputation.",
        ),
        grunfeld: t(
            "Structures.Summary.Grunfeld",
            "After the trade on d4 White has a central majority and Black a queenside majority; the open c-file is essential.",
        ),
        carlsbad: t(
            "Structures.Summary.Carlsbad",
            "The Exchange Queen's Gambit structure. White has two plans, the minority attack and the central break e3-e4, and usually only one suits the position; Black plays on the kingside with pieces.",
        ),
        najdorfI: t(
            "Structures.Summary.NajdorfI",
            "After exd5 White has a queenside majority and Black a kingside one. Black's dark-squared bishop is good here; White's light-squared one is often poor.",
        ),
        najdorfII: t(
            "Structures.Summary.NajdorfII",
            "Every plan revolves around d5: White wants to occupy it, Black wants to free the position with ...d5.",
        ),
        hedgehog: t(
            "Structures.Summary.Hedgehog",
            "Black waits behind a compact, flexible line of pawns and breaks with ...d5 or ...b5 at the right moment; White has space and tries to open the queenside first.",
        ),
        maroczy: t(
            "Structures.Summary.Maroczy",
            "Typical of the Accelerated Dragon: White has space and a possible knight on d5; Black, with the bishop on g7 and the e-pawn at home, trades pieces and plays for the endgame.",
        ),
        asymmetricBenoni: t(
            "Structures.Summary.AsymmetricBenoni",
            "A race of majorities: White's in the centre, Black's on the queenside. Exchanges usually favour Black.",
        ),
        symmetricBenoni: t(
            "Structures.Summary.SymmetricBenoni",
            "White keeps a small, lasting space advantage; Black must find activity before being squeezed.",
        ),
        kingsIndianI: t(
            "Structures.Summary.KingsIndianI",
            "The closed centre with an open c-file: the c-file often decides whether Black's kingside play has time.",
        ),
        kingsIndianII: t(
            "Structures.Summary.KingsIndianII",
            "A fully blocked centre: White plays on the queenside with b4, Black on the kingside with ...f5.",
        ),
        kingsIndianIII: t(
            "Structures.Summary.KingsIndianIII",
            "Opposite-wing play: White hits the base of the chain with c4-c5, Black goes for the king with ...f5.",
        ),
        openKingsIndian: t(
            "Structures.Summary.OpenKingsIndian",
            "White has space and the d6 target; Black must stay active, trade a few pieces and use tactics.",
        ),
        kingsIndianComplex: t(
            "Structures.Summary.KingsIndianComplex",
            "A flexible centre that can turn into most King's Indian and Najdorf structures; its own line is the exchange dxe5 dxe5.",
        ),
        frenchI: t(
            "Structures.Summary.FrenchI",
            "After ...f6 and exf6, everything revolves around e5: White wants to control it, Black must create counterplay quickly.",
        ),
        frenchII: t(
            "Structures.Summary.FrenchII",
            "White holds d4 and has kingside space for an attack; Black undermines e5 and simplifies.",
        ),
        frenchIII: t(
            "Structures.Summary.FrenchIII",
            "A closed chain with play on opposite wings: White attacks the king thanks to e5, Black hits the base d4 with ...c5. Black's light-squared bishop is bad while it stays on c8.",
        ),
        threeVsFour: t(
            "Structures.Summary.ThreeVsFour",
            "An open, often simplified position: not as drawish as it looks. Both sides play on the queenside and the d-file; the bishop pair counts.",
        ),
        panov: t(
            "Structures.Summary.Panov",
            "After c4-c5 White's plan is a queenside passed pawn; Black hits the front or the base of the chain.",
        ),
        dragon: t(
            "Structures.Summary.Dragon",
            "The castling choice decides everything: opposite-wing races after long castling, positional play after short castling.",
        ),
        scheveningen: t(
            "Structures.Summary.Scheveningen",
            "The small centre of the Sicilian: White attacks on the kingside, Black waits for ...d5 or counterattacks on the queenside.",
        ),
        benko: t(
            "Structures.Summary.Benko",
            "A pawn down, Black gets long-term pressure on the a- and b-files against two White pawn islands.",
        ),
        closedRuyLopez: t(
            "Structures.Summary.ClosedRuyLopez",
            "Close to the King's Indian type II, but White has no queenside space, so kingside plans matter more.",
        ),
        lopezFormation: t(
            "Structures.Summary.LopezFormation",
            "A structure in transition: d4-d5, the exchanges on d4 or dxe5 turn it into a King's Indian, a Benoni or a closed Ruy Lopez.",
        ),
    }[structure];
}

/** Typical plans of each colour, with the structure as in its usual opening. */
export function structurePlans(
    structure: PawnStructure,
    t: TFunction,
): { white: string[]; black: string[] } {
    return {
        iqp: {
            white: [
                t(
                    "Structures.Plan.Iqp.W1",
                    "Attack on the kingside: a knight on e5, Bg5, the queen and bishop battery on the b1–h7 diagonal, a rook lift through the third rank.",
                ),
                t(
                    "Structures.Plan.Iqp.W2",
                    "Break with d4-d5 to open lines with the initiative, even as a pawn sacrifice.",
                ),
                t("Structures.Plan.Iqp.W3", "Avoid exchanges: every trade makes the pawn weaker."),
            ],
            black: [
                t(
                    "Structures.Plan.Iqp.B1",
                    "Exchange pieces, above all White's light-squared bishop, and head for the endgame.",
                ),
                t(
                    "Structures.Plan.Iqp.B2",
                    "Blockade on d5 with a knight: it stops d4-d5; in the endgame a rook, bishop or king is strong there too.",
                ),
                t(
                    "Structures.Plan.Iqp.B3",
                    "Pressure the pawn along the d-file and win it in the endgame.",
                ),
            ],
        },
        hangingPawns: {
            white: [
                t(
                    "Structures.Plan.HangingPawns.W1",
                    "Keep the pawns abreast and support them with pieces.",
                ),
                t(
                    "Structures.Plan.HangingPawns.W2",
                    "Advance d4-d5 or c4-c5 at the right moment to open lines or create a passed pawn.",
                ),
                t("Structures.Plan.HangingPawns.W3", "Use the space for a kingside attack."),
            ],
            black: [
                t(
                    "Structures.Plan.HangingPawns.B1",
                    "Attack the pawns with rooks on the c- and d-files and with minor pieces.",
                ),
                t(
                    "Structures.Plan.HangingPawns.B2",
                    "Provoke an advance with ...b6-b5 or ...e6-e5 and blockade the square in front of the pawn.",
                ),
                t(
                    "Structures.Plan.HangingPawns.B3",
                    "Exchange pieces: in the endgame the pawns become targets.",
                ),
            ],
        },
        caroKann: {
            white: [
                t(
                    "Structures.Plan.CaroKann.W1",
                    "Attack on the kingside: a knight on e5, queen and bishop against h7.",
                ),
                t("Structures.Plan.CaroKann.W2", "Gain space with c3-c4 and h2-h4."),
                t(
                    "Structures.Plan.CaroKann.W3",
                    "Play c4-c5 to stop ...c5 and take the d6-square.",
                ),
            ],
            black: [
                t(
                    "Structures.Plan.CaroKann.B1",
                    "Break with ...c6-c5, usually reaching a 4-2 against 3-3 with level chances.",
                ),
                t(
                    "Structures.Plan.CaroKann.B2",
                    "...e6-e5 is possible but hard: White controls e5 with many pieces.",
                ),
                t(
                    "Structures.Plan.CaroKann.B3",
                    "After c4, pressure d4 or play ...b7-b5 against d5.",
                ),
            ],
        },
        slav: {
            white: [
                t(
                    "Structures.Plan.Slav.W1",
                    "Knights on the e5 and c5 outposts; e3-e4 and e4-e5 to fix the centre and take d6.",
                ),
                t("Structures.Plan.Slav.W2", "Kingside attack with the h-pawn."),
                t(
                    "Structures.Plan.Slav.W3",
                    "Minority attack with a2-a4 and b2-b4-b5, or b2-b4 just to stop ...c5.",
                ),
            ],
            black: [
                t(
                    "Structures.Plan.Slav.B1",
                    "Break with ...e6-e5 (often towards a 4-2 against 3-3) or ...c6-c5.",
                ),
                t(
                    "Structures.Plan.Slav.B2",
                    "Disrupt the centre with ...f7-f5; pressure d4 after e3-e4.",
                ),
            ],
        },
        stonewall: {
            white: [
                t(
                    "Structures.Plan.Stonewall.W1",
                    "Take firm control of e5 and settle a knight there.",
                ),
                t(
                    "Structures.Plan.Stonewall.W2",
                    "Trade the dark-squared bishops to weaken the dark squares.",
                ),
                t("Structures.Plan.Stonewall.W3", "Play on the queenside and the c-file."),
            ],
            black: [
                t(
                    "Structures.Plan.Stonewall.B1",
                    "Attack on the kingside without giving up the fight for e5.",
                ),
                t(
                    "Structures.Plan.Stonewall.B2",
                    "Activate the light-squared bishop (...Bd7-e8-h5, or ...b6 and ...Ba6).",
                ),
                t(
                    "Structures.Plan.Stonewall.B3",
                    "Create central tension with ...b6 and ...c5, but not together with the kingside attack.",
                ),
            ],
        },
        grunfeld: {
            white: [
                t(
                    "Structures.Plan.Grunfeld.W1",
                    "Push d4-d5 to dominate the centre and create a passed pawn.",
                ),
                t(
                    "Structures.Plan.Grunfeld.W2",
                    "Attack on the kingside with h4-h5 and e4-e5 (the f6-square).",
                ),
                t("Structures.Plan.Grunfeld.W3", "Win the fight for the c-file."),
            ],
            black: [
                t(
                    "Structures.Plan.Grunfeld.B1",
                    "Create a queenside passed pawn, especially after exchanges.",
                ),
                t(
                    "Structures.Plan.Grunfeld.B2",
                    "Pressure the centre with a rook on the d-file and tactics against d4.",
                ),
                t(
                    "Structures.Plan.Grunfeld.B3",
                    "Control the c-file and steer towards a good endgame.",
                ),
            ],
        },
        carlsbad: {
            white: [
                t(
                    "Structures.Plan.Carlsbad.W1",
                    "Minority attack with b2-b4-b5 to leave Black a weak c-pawn.",
                ),
                t(
                    "Structures.Plan.Carlsbad.W2",
                    "Central break with f2-f3 and e3-e4 (or e3-e4 directly).",
                ),
                t(
                    "Structures.Plan.Carlsbad.W3",
                    "Develop the dark-squared bishop outside the chain (g5 rather than d2).",
                ),
            ],
            black: [
                t("Structures.Plan.Carlsbad.B1", "A knight on e4 and a kingside attack."),
                t(
                    "Structures.Plan.Carlsbad.B2",
                    "...b6 and ...c5 (hanging pawns) or ...c5 directly (isolated pawn after dxc5).",
                ),
                t(
                    "Structures.Plan.Carlsbad.B3",
                    "After b4, ...b5 for a knight on c4, at the cost of a backward c6-pawn.",
                ),
            ],
        },
        najdorfI: {
            white: [
                t(
                    "Structures.Plan.NajdorfI.W1",
                    "Advance the queenside majority with b2-b4 and c2-c4-c5.",
                ),
                t(
                    "Structures.Plan.NajdorfI.W2",
                    "After ...f5, sometimes g2-g4 to break Black's kingside.",
                ),
            ],
            black: [
                t(
                    "Structures.Plan.NajdorfI.B1",
                    "Expand on the kingside with ...f7-f5 and attack.",
                ),
                t("Structures.Plan.NajdorfI.B2", "Restrain White's queenside with ...b7-b5."),
            ],
        },
        najdorfII: {
            white: [
                t(
                    "Structures.Plan.NajdorfII.W1",
                    "Plant a knight on d5 and be able to recapture there with a piece.",
                ),
                t(
                    "Structures.Plan.NajdorfII.W2",
                    "Drive away the f6 knight with g4-g5, or exchange it with Bxf6.",
                ),
                t("Structures.Plan.NajdorfII.W3", "Play f4-f5 to keep Black's bishop off e6."),
            ],
            black: [
                t("Structures.Plan.NajdorfII.B1", "Break with ...d6-d5 and take the initiative."),
                t("Structures.Plan.NajdorfII.B2", "Pressure c2 along the c-file."),
                t("Structures.Plan.NajdorfII.B3", "Expel the c3 knight with ...b5-b4 before Nd5."),
            ],
        },
        hedgehog: {
            white: [
                t("Structures.Plan.Hedgehog.W1", "Open the queenside with c4-c5, b4-b5 or a4-a5."),
                t(
                    "Structures.Plan.Hedgehog.W2",
                    "Pressure d6, but only after some pieces have been exchanged.",
                ),
            ],
            black: [
                t(
                    "Structures.Plan.Hedgehog.B1",
                    "Break with ...d6-d5 (strongest with White's bishop on the f1–a6 diagonal) or ...b6-b5 (with the bishop on g2).",
                ),
                t(
                    "Structures.Plan.Hedgehog.B2",
                    "Kingside attack with ...Kh8, ...Rg8 and ...g5-g4 (not against g3 and Bg2).",
                ),
                t(
                    "Structures.Plan.Hedgehog.B3",
                    "Keep pieces and wait: without the right moment, preparing is better than breaking.",
                ),
            ],
        },
        maroczy: {
            white: [
                t(
                    "Structures.Plan.Maroczy.W1",
                    "Expand on the queenside, place a knight on d5, or expand with f2-f4.",
                ),
                t(
                    "Structures.Plan.Maroczy.W2",
                    "After f4, rooks to the centre and the break e4-e5 or f4-f5.",
                ),
                t(
                    "Structures.Plan.Maroczy.W3",
                    "If Black takes on d5, recapture with the pawn (exd5 or cxd5) to change the structure.",
                ),
            ],
            black: [
                t("Structures.Plan.Maroczy.B1", "Exchange pieces to ease the lack of space."),
                t(
                    "Structures.Plan.Maroczy.B2",
                    "Break with ...b5 (and pressure on the a-file) or ...f5 against the king.",
                ),
                t(
                    "Structures.Plan.Maroczy.B3",
                    "Hit the queenside with ...Qb6-b4 and, after b3, ...a5-a4.",
                ),
            ],
        },
        asymmetricBenoni: {
            white: [
                t(
                    "Structures.Plan.AsymmetricBenoni.W1",
                    "Break with e4-e5 for an attack or a central passed pawn.",
                ),
                t("Structures.Plan.AsymmetricBenoni.W2", "Play f4-f5 for a kingside attack."),
                t("Structures.Plan.AsymmetricBenoni.W3", "Stop the queenside majority with b2-b4."),
            ],
            black: [
                t(
                    "Structures.Plan.AsymmetricBenoni.B1",
                    "Advance the queenside majority (...b5, ...c4) and create a passed pawn.",
                ),
                t(
                    "Structures.Plan.AsymmetricBenoni.B2",
                    "Pressure along the e-file to hold back e4-e5.",
                ),
                t(
                    "Structures.Plan.AsymmetricBenoni.B3",
                    "Undermine d5 with ...f7-f5, especially after f4.",
                ),
            ],
        },
        symmetricBenoni: {
            white: [
                t(
                    "Structures.Plan.SymmetricBenoni.W1",
                    "Expand on the kingside with f2-f4 and g2-g4.",
                ),
                t(
                    "Structures.Plan.SymmetricBenoni.W2",
                    "Attack d6 with a bishop on the h2–b8 diagonal and a knight on e4.",
                ),
            ],
            black: [
                t("Structures.Plan.SymmetricBenoni.B1", "Control e4 and occupy it with a knight."),
                t(
                    "Structures.Plan.SymmetricBenoni.B2",
                    "Break with ...b7-b5, even as a pawn sacrifice.",
                ),
                t(
                    "Structures.Plan.SymmetricBenoni.B3",
                    "Exchange minor pieces; answer f4 with ...f5.",
                ),
            ],
        },
        kingsIndianI: {
            white: [
                t(
                    "Structures.Plan.KingsIndianI.W1",
                    "Cover the entry points on the c-file and fight for it.",
                ),
                t(
                    "Structures.Plan.KingsIndianI.W2",
                    "With the c-file, invade on the seventh rank.",
                ),
                t("Structures.Plan.KingsIndianI.W3", "Gain space with a2-a4-a5."),
            ],
            black: [
                t(
                    "Structures.Plan.KingsIndianI.B1",
                    "Double rooks on the c-file if there are entry points.",
                ),
                t(
                    "Structures.Plan.KingsIndianI.B2",
                    "Kingside counterplay with ...f5xe4 and the f-file.",
                ),
                t(
                    "Structures.Plan.KingsIndianI.B3",
                    "Reroute the dark-squared bishop to b6 via f6 and d8.",
                ),
            ],
        },
        kingsIndianII: {
            white: [
                t(
                    "Structures.Plan.KingsIndianII.W1",
                    "Prepare b2-b4 (a3, Rb1) to open the queenside.",
                ),
                t("Structures.Plan.KingsIndianII.W2", "Restrain ...f5 or meet it with f4 or g4."),
            ],
            black: [
                t(
                    "Structures.Plan.KingsIndianII.B1",
                    "Kingside attack with ...f5, ...f4 and ...g5.",
                ),
                t(
                    "Structures.Plan.KingsIndianII.B2",
                    "Hold the queenside with ...a6 and ...b6, or play ...b5.",
                ),
            ],
        },
        kingsIndianIII: {
            white: [
                t(
                    "Structures.Plan.KingsIndianIII.W1",
                    "Break with c4-c5 and invade along the c-file.",
                ),
                t(
                    "Structures.Plan.KingsIndianIII.W2",
                    "Close the kingside first with g2-g4 if needed.",
                ),
                t(
                    "Structures.Plan.KingsIndianIII.W3",
                    "Trade the light-squared bishops to blunt the attack.",
                ),
            ],
            black: [
                t("Structures.Plan.KingsIndianIII.B1", "Attack with ...f5-f4 and ...g5-g4."),
                t(
                    "Structures.Plan.KingsIndianIII.B2",
                    "Or ...f5xe4 and play on the f-file against e4.",
                ),
                t(
                    "Structures.Plan.KingsIndianIII.B3",
                    "...c6 or ...c5 change the structure to types I or II.",
                ),
            ],
        },
        openKingsIndian: {
            white: [
                t("Structures.Plan.OpenKingsIndian.W1", "Pressure d6 along the d-file."),
                t(
                    "Structures.Plan.OpenKingsIndian.W2",
                    "Expand with f4 (and g4), then break with e5 or f5.",
                ),
                t(
                    "Structures.Plan.OpenKingsIndian.W3",
                    "Avoid exchanges to keep the space advantage.",
                ),
            ],
            black: [
                t("Structures.Plan.OpenKingsIndian.B1", "Trade a couple of minor pieces."),
                t(
                    "Structures.Plan.OpenKingsIndian.B2",
                    "Knights on e5 and c5 with ...Qb6-b4 against c4.",
                ),
                t(
                    "Structures.Plan.OpenKingsIndian.B3",
                    "Breaks ...d6-d5, ...f5 or ...b5; sometimes ...g5 to control f4.",
                ),
            ],
        },
        kingsIndianComplex: {
            white: [
                t(
                    "Structures.Plan.KingsIndianComplex.W1",
                    "Choose the moment for d4-d5 (types I–III) or dxe5.",
                ),
                t("Structures.Plan.KingsIndianComplex.W2", "Blow up the centre with c4-c5."),
            ],
            black: [
                t(
                    "Structures.Plan.KingsIndianComplex.B1",
                    "Keep the tension; ...exd4 leads to the open King's Indian.",
                ),
                t(
                    "Structures.Plan.KingsIndianComplex.B2",
                    "After dxe5 dxe5, fight for d4 and the d-file.",
                ),
            ],
        },
        frenchI: {
            white: [
                t("Structures.Plan.FrenchI.W1", "Control e5 and use it as an outpost."),
                t("Structures.Plan.FrenchI.W2", "Double rooks against the backward e6-pawn."),
                t("Structures.Plan.FrenchI.W3", "With e5 secured, expand on the kingside."),
            ],
            black: [
                t("Structures.Plan.FrenchI.B1", "Pressure d4 with ...c5xd4, ...Nc6 and ...Qb6."),
                t("Structures.Plan.FrenchI.B2", "Bring the bishop out via ...Bd7-e8-h5."),
                t(
                    "Structures.Plan.FrenchI.B3",
                    "Rooks on the f-file, the ...Rxf3 sacrifice or the ...e6-e5 break.",
                ),
            ],
        },
        frenchII: {
            white: [
                t("Structures.Plan.FrenchII.W1", "A knight on d4 supported by c3, Be3 and Rd1."),
                t(
                    "Structures.Plan.FrenchII.W2",
                    "Hit e6 with f4-f5, or attack with f5-f6 and Qh5.",
                ),
                t("Structures.Plan.FrenchII.W3", "Castle long and storm with the g- and h-pawns."),
            ],
            black: [
                t("Structures.Plan.FrenchII.B1", "Undermine e5 with ...f7-f6 (or ...g5)."),
                t(
                    "Structures.Plan.FrenchII.B2",
                    "Trade the bad light-squared bishop and simplify.",
                ),
                t(
                    "Structures.Plan.FrenchII.B3",
                    "Minority attack ...b5-b4, especially against long castling.",
                ),
            ],
        },
        frenchIII: {
            white: [
                t("Structures.Plan.FrenchIII.W1", "Hit the base e6 with f2-f4-f5."),
                t(
                    "Structures.Plan.FrenchIII.W2",
                    "Kingside attack with f5-f6 or with pieces (rook lifts, bishop on b1–h7, queen on h5).",
                ),
                t(
                    "Structures.Plan.FrenchIII.W3",
                    "Hold d4 and the c2 entry square against Black's c-file play.",
                ),
            ],
            black: [
                t(
                    "Structures.Plan.FrenchIII.B1",
                    "...c7-c5xd4 with ...Nc6 and ...Qb6, and the c-file.",
                ),
                t(
                    "Structures.Plan.FrenchIII.B2",
                    "Or ...c5-c4 and ...b5-b4 (slow: better after long castling).",
                ),
                t(
                    "Structures.Plan.FrenchIII.B3",
                    "Trade the bad bishop (...b6 and ...Ba6); slow the attack with ...f5 or fight with ...f6.",
                ),
            ],
        },
        threeVsFour: {
            white: [
                t(
                    "Structures.Plan.ThreeVsFour.W1",
                    "Control the d-file and invade the seventh rank.",
                ),
                t(
                    "Structures.Plan.ThreeVsFour.W2",
                    "Advance the queenside majority to create a passed pawn.",
                ),
            ],
            black: [
                t("Structures.Plan.ThreeVsFour.B1", "Control the d-file as well."),
                t(
                    "Structures.Plan.ThreeVsFour.B2",
                    "Minority attack with ...a5 and ...b5-b4, then win with the kingside majority.",
                ),
            ],
        },
        panov: {
            white: [t("Structures.Plan.Panov.W1", "b2-b4-b5 and c5-c6 for a passed pawn.")],
            black: [
                t("Structures.Plan.Panov.B1", "Hit the front of the chain with ...b7-b6."),
                t(
                    "Structures.Plan.Panov.B2",
                    "Hit the base d4 with ...Nc6 and ...Bf6, often with ...f5 and ...Ne4.",
                ),
            ],
        },
        dragon: {
            white: [
                t(
                    "Structures.Plan.Dragon.W1",
                    "Long castling: h2-h4-h5 and an attack on the h-file.",
                ),
                t(
                    "Structures.Plan.Dragon.W2",
                    "Short castling: central play, a rook on d1 and a knight on d5.",
                ),
            ],
            black: [
                t(
                    "Structures.Plan.Dragon.B1",
                    "Against long castling, attack on the queenside at all costs (c-file, ...Rxc3).",
                ),
                t(
                    "Structures.Plan.Dragon.B2",
                    "Against short castling, play on the c-file with a knight on c4.",
                ),
            ],
        },
        scheveningen: {
            white: [
                t("Structures.Plan.Scheveningen.W1", "Pawn storm with g4-g5 and h4-h5."),
                t("Structures.Plan.Scheveningen.W2", "f4-f5 against e6, or f4 and e4-e5."),
            ],
            black: [
                t("Structures.Plan.Scheveningen.B1", "Free the position with ...d6-d5."),
                t(
                    "Structures.Plan.Scheveningen.B2",
                    "Play on the c-file with a knight on c4; ...Rxc3 sacrifices.",
                ),
                t(
                    "Structures.Plan.Scheveningen.B3",
                    "Against long castling, ...b5-b4 and ...a5-a4.",
                ),
            ],
        },
        benko: {
            white: [
                t(
                    "Structures.Plan.Benko.W1",
                    "Build a fortress on the queenside (pawns on a4 and b3, pieces around them).",
                ),
                t("Structures.Plan.Benko.W2", "Look for a central break with e4-e5 or f4-f5."),
            ],
            black: [
                t("Structures.Plan.Benko.B1", "Rooks on the a- and b-files against a2 and b2."),
                t("Structures.Plan.Benko.B2", "Keep the pressure: White has few targets."),
            ],
        },
        closedRuyLopez: {
            white: [
                t(
                    "Structures.Plan.ClosedRuyLopez.W1",
                    "Kingside attack with g4 and a knight to f5 (Nbd2-f1-g3).",
                ),
                t("Structures.Plan.ClosedRuyLopez.W2", "Or f2-f4."),
                t(
                    "Structures.Plan.ClosedRuyLopez.W3",
                    "Queenside play with b4 and a4 on the a-file.",
                ),
            ],
            black: [
                t("Structures.Plan.ClosedRuyLopez.B1", "Queenside play with ...a5 and ...b4."),
                t("Structures.Plan.ClosedRuyLopez.B2", "Or ...f5-f4 on the kingside."),
            ],
        },
        lopezFormation: {
            white: [
                t(
                    "Structures.Plan.LopezFormation.W1",
                    "Close the centre with d4-d5 (then c3-c4, or after ...c4).",
                ),
                t("Structures.Plan.LopezFormation.W2", "Open the d-file with dxe5."),
            ],
            black: [
                t("Structures.Plan.LopezFormation.B1", "Close the queenside with ...c5-c4."),
                t(
                    "Structures.Plan.LopezFormation.B2",
                    "...exd4 or ...cxd4 and, after cxd4 and d5, a Benoni or a King's Indian.",
                ),
            ],
        },
    }[structure];
}
