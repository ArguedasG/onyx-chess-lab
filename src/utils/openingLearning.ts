import type { OpeningLine, OpeningsState } from "@/utils/trainingAreas";

export const DEFAULT_OPENING_LEARN_BATCH = 5;

/**
 * Guided Learn pauses on a move that carries a PGN comment or drawn arrows/circles, so the student
 * can read and see them before continuing.
 */
export function hasLearnAnnotations(node: {
    comment: string;
    shapes: readonly unknown[];
}): boolean {
    return node.comment.trim().length > 0 || node.shapes.length > 0;
}

/**
 * A line counts as learned once it went through Learn mode. Lines completed in practice before
 * Learn existed are treated as learned too, so existing progress is never hidden or lost.
 */
export function isOpeningLineLearned(line: Pick<OpeningLine, "learnedAt" | "session">): boolean {
    return Boolean(line.learnedAt) || line.session.completions > 0;
}

export function markOpeningLineLearned(
    state: OpeningsState,
    lineId: string,
    at = new Date().toISOString(),
): OpeningsState {
    const line = state.lines[lineId];
    if (!line || line.learnedAt) return state;
    return { ...state, lines: { ...state.lines, [lineId]: { ...line, learnedAt: at } } };
}

export function openingLearnBatchSize(state: OpeningsState): number {
    return state.settings.learnBatchSize ?? DEFAULT_OPENING_LEARN_BATCH;
}

/** Trainable theory lines of the given sections, in repertoire order. */
export function trainableOpeningLines(state: OpeningsState, variantIds: string[]): OpeningLine[] {
    return variantIds.flatMap((variantId) => {
        const variant = state.variants[variantId];
        if (!variant || variant.contentType !== "theory") return [];
        return variant.lineIds.flatMap((lineId) => {
            const line = state.lines[lineId];
            return line?.trainable ? [line] : [];
        });
    });
}

export type OpeningLearningSummary = {
    learned: number;
    total: number;
    /** Lines still to learn, in repertoire order. */
    pending: OpeningLine[];
};

export function getOpeningLearningSummary(lines: readonly OpeningLine[]): OpeningLearningSummary {
    const trainable = lines.filter((line) => line.trainable);
    const pending = trainable.filter((line) => !isOpeningLineLearned(line));
    return { learned: trainable.length - pending.length, total: trainable.length, pending };
}

/**
 * Number of leading plies of `line` already covered by a learned line of the same repertoire.
 * Learn mode replays that shared part automatically and starts teaching at the divergence.
 */
export function learnedOpeningPrefixLength(state: OpeningsState, line: OpeningLine): number {
    const repertoireId = state.variants[line.variantId]?.repertoireId;
    if (!repertoireId) return 0;
    let best = 0;
    for (const variantId of state.repertoires[repertoireId]?.variantIds ?? []) {
        for (const otherId of state.variants[variantId]?.lineIds ?? []) {
            const other = state.lines[otherId];
            if (!other || other.id === line.id || other.fen !== line.fen) continue;
            if (!isOpeningLineLearned(other)) continue;
            let shared = 0;
            while (
                shared < line.moves.length &&
                shared < other.moves.length &&
                line.moves[shared] === other.moves[shared]
            ) {
                shared += 1;
            }
            best = Math.max(best, shared);
        }
    }
    return best;
}

/**
 * Where a Learn session should start: after the already learned prefix, but always leaving at
 * least one move for the student. `isStudentPly(ply)` tells whether the move at that ply is theirs.
 */
export function openingLearnStartPly(
    prefixLength: number,
    lineLength: number,
    isStudentPly: (ply: number) => boolean,
): number {
    let start = Math.max(0, Math.min(prefixLength, lineLength));
    const hasStudentMoveFrom = (from: number) => {
        for (let ply = from; ply < lineLength; ply += 1) if (isStudentPly(ply)) return true;
        return false;
    };
    while (start > 0 && !hasStudentMoveFrom(start)) start -= 1;
    return start;
}
