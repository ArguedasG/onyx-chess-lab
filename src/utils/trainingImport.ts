import i18n from "i18next";
import { getGameName, treeIteratorMainLine } from "@/utils/treeReducer";
import { parsePGN } from "./chess";
import { positionFromFen } from "./chessops";
import { createTrainingItem, type TrainingItem, type TrainingKind } from "./training";

export type TrainingImport = {
    item: TrainingItem;
    sourceDescription: string;
};

export async function parseTrainingInput({
    input,
    kind,
    title,
    tags,
    notes,
}: {
    input: string;
    kind: TrainingKind;
    title: string;
    tags: string[];
    notes: string;
}): Promise<TrainingImport> {
    const trimmed = input.trim();
    if (!trimmed) {
        throw new Error(i18n.t("Errors.EnterFenOrPgn", "Enter a FEN position or a PGN game."));
    }

    const [position] = positionFromFen(trimmed);
    if (position) {
        return {
            item: createTrainingItem({
                kind,
                title: title.trim() || i18n.t("Training.UntitledPosition", "Untitled position"),
                fen: trimmed,
                sideToMove: position.turn,
                objective: "custom",
                solutionMoves: [],
                tags,
                notes,
                source: { kind: "fen", label: title.trim() || undefined },
            }),
            sourceDescription: "FEN",
        };
    }

    const tree = await parsePGN(trimmed);
    const mainline = Array.from(treeIteratorMainLine(tree.root)).slice(1);
    if (mainline.length === 0) {
        throw new Error(
            i18n.t("Errors.PgnNoTrainableMoves", "The PGN contains no moves that can be trained."),
        );
    }

    return {
        item: createTrainingItem({
            kind,
            title: title.trim() || getGameName(tree.headers),
            fen: tree.root.fen,
            sideToMove: tree.root.halfMoves % 2 === 0 ? "white" : "black",
            objective: kind === "opening" ? "replayLine" : "findBestMove",
            solutionMoves: mainline
                .map(({ node }) => node.san)
                .filter((san): san is string => san !== null),
            tags,
            notes,
            source: { kind: "pgn", label: title.trim() || getGameName(tree.headers), pgn: trimmed },
        }),
        sourceDescription: i18n.t("Training.PgnMoveCount", "PGN · {{count}} moves", {
            count: mainline.length,
        }),
    };
}
