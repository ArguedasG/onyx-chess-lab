import type { BestMoves, ScoreValue } from "@/bindings";

/**
 * Guided play against a bot (Phase 9.1, I-52): before the player moves, a short Stockfish search
 * tells whether the position asks for one precise move. Guided games are always friendly.
 *
 * - `warnings`: only the warning that the moment is critical;
 * - `hints`: the warning, and on request the piece to move and then the move itself.
 */
export type GuidedLevel = "off" | "warnings" | "hints";

/** The best move must beat the second by this much to call the moment critical. */
export const CRITICAL_GAP_CP = 150;
/** Outside this range the game is already decided and no warning helps. */
const DECIDED_CP = 600;
const MATE_CP = 100_000;

function centipawns(score: ScoreValue, white: boolean): number {
    const value =
        score.type === "mate"
            ? Math.sign(score.value) * (MATE_CP - Math.abs(score.value))
            : score.value;
    return white ? value : -value;
}

export type GuidedMoment = {
    critical: boolean;
    /** The best move, in UCI, to show as a hint. */
    best: string | null;
    /** How much better the best move is than the second, for the side to move. */
    gapCp: number;
};

/** Reads a MultiPV 2 search (scores from White's point of view) for the side to move. */
export function guidedMoment(lines: readonly BestMoves[], whiteToMove: boolean): GuidedMoment {
    const sorted = [...lines].sort((left, right) => left.multipv - right.multipv);
    const [first, second] = sorted;
    const best = first?.uciMoves[0] ?? null;
    if (!first || !second) return { critical: false, best, gapCp: 0 };
    const bestCp = centipawns(first.score.value, whiteToMove);
    const secondCp = centipawns(second.score.value, whiteToMove);
    const gapCp = bestCp - secondCp;
    // A forced mate or a game already won or lost is not a moment to warn about; a single
    // move that keeps a position alive is.
    const undecided = Math.abs(bestCp) < DECIDED_CP || Math.abs(secondCp) < DECIDED_CP;
    return { critical: undecided && gapCp >= CRITICAL_GAP_CP, best, gapCp };
}
