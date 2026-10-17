import i18n from "i18next";
import type { EndgameTheme } from "@/utils/trainingAreas";

export type EndgameThemeMetadata = { id: EndgameTheme; label: string; description: string };

export const getEndgameThemeMetadata = (
    trainingT: typeof i18n.t = i18n.t,
): EndgameThemeMetadata[] => [
    {
        id: "pawn",
        label: trainingT("Training.Copy.Pawnendgames.1d9ad580", "Pawn endgames"),
        description: trainingT(
            "Training.Copy.Oppositionpassedpawnspawnraces.1613b20c",
            "Opposition, passed pawns, pawn races, and key squares.",
        ),
    },
    {
        id: "rook",
        label: trainingT("Training.Copy.Rookendgames.5017d5d9", "Rook endgames"),
        description: trainingT(
            "Training.Copy.Activerookspassedpawnsand.8fbd6a79",
            "Active rooks, passed pawns, and theoretical positions.",
        ),
    },
    {
        id: "minorPiece",
        label: trainingT("Training.Copy.Minorpieces.3037b1a3", "Minor pieces"),
        description: trainingT(
            "Training.Copy.Knightsbishopsandtheirendgames.fc5978ce",
            "Knights, bishops, and their endgames against pawns.",
        ),
    },
    {
        id: "queen",
        label: trainingT("Training.Copy.Queenendgames.e698cea4", "Queen endgames"),
        description: trainingT(
            "Training.Copy.Matingtechniquechecksandking.b4e7aea3",
            "Mating technique, checks, and king coordination.",
        ),
    },
    {
        id: "mixed",
        label: trainingT("Training.Copy.Mixedmaterial.d33aeb87", "Mixed material"),
        description: trainingT(
            "Training.Copy.Endgameswithseveralkindsof.1b3d107d",
            "Endgames with several kinds of pieces on the board.",
        ),
    },
    {
        id: "other",
        label: trainingT("Training.Copy.Otherendgames.75f81a60", "Other endgames"),
        description: trainingT(
            "Training.Copy.Specialpositionsandsupplementaryexercises.08022247",
            "Special positions and supplementary exercises.",
        ),
    },
];

export function filenameWithoutExtension(path: string, fallback: string) {
    return (
        path
            .split(/[\\/]/)
            .pop()
            ?.replace(/\.[^.]+$/, "") || fallback
    );
}
