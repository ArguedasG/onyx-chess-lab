import { positionFromFen } from "@/utils/chessops";
import { scoreForStudent } from "@/utils/endgameVerdict";
import { getBestMovesOnce, type LocalEngine } from "@/utils/engines";
import { getTablebaseInfo } from "@/utils/lichess/api";
import {
    endgameObjectiveFromTablebase,
    type EndgameStudentColor,
    type TrainingObjective,
} from "@/utils/trainingAreas";

export type ComputedObjective = {
    objective: TrainingObjective;
    source: "tablebase" | "stockfish";
    category?: string;
};

const OBJECTIVE_SEARCH_MS = 1500;

/**
 * Objective of an endgame calculated from its position (I-08): exact with the tablebase up to
 * 7 pieces, and from a short Stockfish search above. Engine scores between a clear draw and a
 * clear win stay undecided rather than guessed.
 */
export async function computeEndgameObjective(
    fen: string,
    studentColor: EndgameStudentColor,
    engine: LocalEngine | null,
): Promise<ComputedObjective | null> {
    const [position] = positionFromFen(fen);
    if (!position) return null;
    if (position.board.occupied.size() <= 7) {
        try {
            const data = await getTablebaseInfo(fen);
            const objective = endgameObjectiveFromTablebase(
                data.category,
                position.turn,
                studentColor,
            );
            if (objective !== "unknown") {
                return { objective, source: "tablebase", category: data.category };
            }
        } catch {
            // Without connection the engine decides.
        }
    }
    if (!engine) return null;
    const lines = await getBestMovesOnce(
        engine,
        { t: "Time", c: OBJECTIVE_SEARCH_MS },
        {
            fen,
            moves: [],
            extraOptions: [
                { name: "Threads", value: "1" },
                { name: "Hash", value: "64" },
                { name: "MultiPV", value: "1" },
            ],
        },
        OBJECTIVE_SEARCH_MS + 6_000,
    );
    const white = lines[0]?.score.value;
    if (!white) return null;
    const score = scoreForStudent(white, studentColor);
    const objective: TrainingObjective =
        score.type === "mate"
            ? score.value > 0
                ? "win"
                : "loss"
            : score.value >= 200
              ? "win"
              : score.value <= -200
                ? "loss"
                : Math.abs(score.value) <= 60
                  ? "draw"
                  : "unknown";
    return objective === "unknown" ? null : { objective, source: "stockfish" };
}
