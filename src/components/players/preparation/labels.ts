import type { TFunction } from "i18next";
import type { PlayerAnalysisPhase } from "@/utils/playerAnalysis";

export { structureName, structureRule } from "@/components/structures/texts";

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
