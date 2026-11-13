import { makeFen } from "chessops/fen";
import { parseUci } from "chessops/util";
import type { PuzzleWithThemes } from "@/bindings";
import { positionFromFen } from "@/utils/chessops";
import {
    addTacticsExerciseToSet,
    addTacticsSet,
    type TacticsSet,
    type TacticsState,
} from "@/utils/trainingAreas";

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

/** A puzzle of the trainer, as the puzzle page holds it. */
export type SavablePuzzle = {
    id: number | string;
    fen: string;
    /** UCI moves; the first is the opponent's. */
    moves: string[];
    rating: number;
    themes?: string[];
};

/** Tag of an exercise copied from a Lichess puzzle: it keeps a set from saving it twice. */
export function lichessPuzzleTag(id: number | string): string {
    return `lichess:${id}`;
}

/** Sets a puzzle can be saved into: the user's own, not the ones read from a PGN file. */
export function puzzleTargetSets(state: TacticsState): TacticsSet[] {
    return Object.values(state.sets).filter(
        (set) => set.origin === "user" && set.source?.kind !== "pgnFile",
    );
}

export function setHasPuzzle(state: TacticsState, setId: string, id: number | string): boolean {
    const tag = lichessPuzzleTag(id);
    // Sets built from the puzzle database before the tag existed name their exercises this way.
    const titlePrefix = `Lichess ${id} ·`;
    return (state.sets[setId]?.exerciseIds ?? []).some((exerciseId) => {
        const exercise = state.exercises[exerciseId];
        return Boolean(exercise?.tags.includes(tag) || exercise?.title.startsWith(titlePrefix));
    });
}

/**
 * The exercise of a puzzle for a set. Puzzle sets let the opponent play first, as Lichess does; a
 * set whose exercises start with the student's move gets the position after that first move.
 */
function puzzleRecord(puzzle: SavablePuzzle, opponentFirst: boolean) {
    const title = `Lichess ${puzzle.id} · ${puzzle.rating}`;
    if (opponentFirst) {
        return { fen: puzzle.fen, moves: puzzle.moves, title, hasExplicitFen: true };
    }
    const [position, error] = positionFromFen(puzzle.fen);
    const first = parseUci(puzzle.moves[0] ?? "");
    if (error || !first || !position.isLegal(first)) {
        throw new Error(`Invalid puzzle ${puzzle.id}`);
    }
    position.play(first);
    return {
        fen: makeFen(position.toSetup()),
        moves: puzzle.moves.slice(1),
        title,
        hasExplicitFen: true,
    };
}

/**
 * Saves a finished puzzle of the trainer into one of the user's sets, or into a new set when
 * `target` has a name. Saving a puzzle the set already has changes nothing (`added` is false).
 */
export function savePuzzleToSet(
    state: TacticsState,
    target: { setId: string } | { name: string; description: string },
    puzzle: SavablePuzzle,
): { state: TacticsState; setId: string; added: boolean } {
    const tags = [lichessPuzzleTag(puzzle.id), ...(puzzle.themes ?? [])];
    if ("setId" in target) {
        const set = state.sets[target.setId];
        if (!set || setHasPuzzle(state, target.setId, puzzle.id)) {
            return { state, setId: target.setId, added: false };
        }
        const record = puzzleRecord(puzzle, set.config.startingActor === "opponent");
        const next = addTacticsExerciseToSet(state, target.setId, record, tags);
        return { state: next, setId: target.setId, added: next !== state };
    }
    const created = addTacticsSet(state, target.name, target.description, [], {
        config: {
            mode: "guided",
            startingActor: "opponent",
            variationPolicy: "mainline",
            validationMode: "prepared",
        },
    });
    const setId = Object.keys(created.sets).find((id) => !state.sets[id]) ?? "";
    const next = addTacticsExerciseToSet(created, setId, puzzleRecord(puzzle, true), tags);
    return { state: next, setId, added: true };
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
