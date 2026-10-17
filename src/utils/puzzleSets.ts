import type { PuzzleWithThemes } from "@/bindings";
import { addTacticsSet, type TacticsSet, type TacticsState } from "@/utils/trainingAreas";

/**
 * Sets built from the Lichess puzzle database (I-20). Each puzzle becomes an embedded exercise:
 * its first move is the opponent's, its themes become tags and the set remembers the rating band.
 */

export type PuzzleSetTemplate = {
    id: string;
    themes: string[];
    themeMode: "any" | "all";
    length?: "any" | "short" | "medium" | "long";
    maxPieces?: number;
};

/** Ready-made starting points; ChessRamp's positional themes are grouped in "positional". */
export const PUZZLE_SET_TEMPLATES: PuzzleSetTemplate[] = [
    { id: "mateIn2", themes: ["mateIn2"], themeMode: "any" },
    { id: "forks", themes: ["fork"], themeMode: "any" },
    { id: "pins", themes: ["pin", "skewer", "xRayAttack"], themeMode: "any" },
    { id: "deflection", themes: ["deflection", "attraction", "interference"], themeMode: "any" },
    {
        id: "positional",
        themes: ["quietMove", "zugzwang", "advancedPawn", "defensiveMove", "trappedPiece"],
        themeMode: "any",
    },
    { id: "endgames", themes: ["endgame"], themeMode: "any" },
    { id: "defense", themes: ["defensiveMove", "equality"], themeMode: "any" },
    // Few pieces and short solutions: the best material for "no pieces" visualization (I-38).
    { id: "visualization", themes: [], themeMode: "any", length: "short", maxPieces: 10 },
];

export function addPuzzleSet(
    state: TacticsState,
    input: {
        name: string;
        description: string;
        puzzles: PuzzleWithThemes[];
        band: [number, number];
        mode: TacticsSet["config"]["mode"];
    },
): { state: TacticsState; setId: string } {
    const records = input.puzzles.map((puzzle) => ({
        fen: puzzle.fen,
        moves: puzzle.moves.split(" "),
        title: `Lichess ${puzzle.id} · ${puzzle.rating}`,
        hasExplicitFen: true,
    }));
    const next = addTacticsSet(state, input.name, input.description, records, {
        config: {
            mode: input.mode,
            startingActor: "opponent",
            variationPolicy: "mainline",
            validationMode: "prepared",
        },
    });
    const setId = Object.keys(next.sets).find((id) => !state.sets[id]);
    if (!setId) return { state, setId: "" };
    const set = next.sets[setId];
    const exercises = { ...next.exercises };
    set.exerciseIds.forEach((exerciseId, index) => {
        const puzzle = input.puzzles[index];
        if (exercises[exerciseId] && puzzle) {
            exercises[exerciseId] = { ...exercises[exerciseId], tags: puzzle.themes };
        }
    });
    return {
        setId,
        state: {
            ...next,
            exercises,
            sets: {
                ...next.sets,
                [setId]: {
                    ...set,
                    recommendedRating: { min: input.band[0], max: input.band[1] },
                },
            },
        },
    };
}

/** Recent accuracy and average solving time of a set, for its card (ChessRamp's shelf). */
export function recentSetStats(
    state: TacticsState,
    setId: string,
    window = 30,
): { accuracy: number | null; averageMs: number | null; sample: number } {
    const attempts = state.attempts
        .filter((attempt) => attempt.setId === setId && attempt.outcome !== "unsupported")
        .slice(-window);
    if (attempts.length === 0) return { accuracy: null, averageMs: null, sample: 0 };
    const correct = attempts.filter((attempt) => attempt.outcome === "correct");
    return {
        accuracy: correct.length / attempts.length,
        averageMs:
            correct.length > 0
                ? correct.reduce((sum, attempt) => sum + attempt.timeMs, 0) / correct.length
                : null,
        sample: attempts.length,
    };
}
