import type { TFunction } from "i18next";
import type { PawnStructure } from "@/bindings";
import type { PlayerAnalysisPhase } from "@/utils/playerAnalysis";

export function structureName(structure: PawnStructure, t: TFunction): string {
    return {
        iqp: t("Preparation.Structure.Iqp", "Isolated queen's pawn"),
        carlsbad: t("Preparation.Structure.Carlsbad", "Carlsbad"),
        hangingPawns: t("Preparation.Structure.Hanging", "Hanging pawns"),
        caroSlav: t("Preparation.Structure.CaroSlav", "Caro-Kann / Slav"),
        french: t("Preparation.Structure.French", "French chain"),
        maroczy: t("Preparation.Structure.Maroczy", "Maróczy bind"),
        hedgehog: t("Preparation.Structure.Hedgehog", "Hedgehog"),
        kingsIndian: t("Preparation.Structure.KingsIndian", "King's Indian chain"),
    }[structure];
}

/** The rule as the interface explains it, from the side that owns the structure. */
export function structureRule(structure: PawnStructure, t: TFunction): string {
    return {
        iqp: t(
            "Preparation.StructureRule.Iqp",
            "A lone d-pawn on the fourth rank with no own c- or e-pawns; the opponent has no d-pawn.",
        ),
        carlsbad: t(
            "Preparation.StructureRule.Carlsbad",
            "d4 and e3 (or e2) without a c-pawn against c6 (or c7) and d5 without an e-pawn: the minority-attack side owns it.",
        ),
        hangingPawns: t(
            "Preparation.StructureRule.Hanging",
            "c- and d-pawns side by side on the fourth rank, no own b- or e-pawns, no enemy c- or d-pawns.",
        ),
        caroSlav: t(
            "Preparation.StructureRule.CaroSlav",
            "c6 and e6 without a d-pawn against d4, with White missing the e-pawn (Caro-Kann) or the c-pawn (Slav).",
        ),
        french: t("Preparation.StructureRule.French", "The chain e6/d5 against d4/e5."),
        maroczy: t(
            "Preparation.StructureRule.Maroczy",
            "c4 and e4 without a d-pawn against a d-pawn and no c-pawn (a Sicilian set-up).",
        ),
        hedgehog: t("Preparation.StructureRule.Hedgehog", "a6, b6, d6 and e6 against c4 and e4."),
        kingsIndian: t(
            "Preparation.StructureRule.KingsIndian",
            "The closed chain d6/e5 against d5/e4.",
        ),
    }[structure];
}

export function phaseName(phase: PlayerAnalysisPhase, t: TFunction): string {
    return {
        opening: t("Preparation.Phase.Opening", "opening"),
        middlegame: t("Preparation.Phase.Middlegame", "middlegame"),
        endgame: t("Preparation.Phase.Endgame", "endgame"),
    }[phase];
}

export function colorName(color: "white" | "black", t: TFunction): string {
    return color === "white" ? t("Fen.White", "White") : t("Fen.Black", "Black");
}
