import { type Card, createEmptyCard, fsrs, generatorParameters, type Grade } from "ts-fsrs";
import { isOpeningLineLearned, trainableOpeningLines } from "@/utils/openingLearning";
import type { OpeningLine, OpeningLineReview, OpeningsState } from "@/utils/trainingAreas";

const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));

/**
 * Line-level spaced repetition. The FSRS card lives in the line itself (training data), so it
 * survives section reorganizations, backups and exports, unlike the per-position practice deck.
 */
function toCard(review: OpeningLineReview): Card {
    return {
        ...review,
        due: new Date(review.due),
        last_review: review.lastReview ? new Date(review.lastReview) : undefined,
    };
}

function fromCard(card: Card): OpeningLineReview {
    return {
        due: card.due.toISOString(),
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: card.elapsed_days,
        scheduled_days: card.scheduled_days,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state,
        lastReview: card.last_review?.toISOString(),
    };
}

export function scheduleOpeningLineReview(
    state: OpeningsState,
    lineId: string,
    grade: Grade,
    now = new Date(),
): OpeningsState {
    const line = state.lines[lineId];
    if (!line) return state;
    const card = line.review ? toCard(line.review) : createEmptyCard(now);
    const next = scheduler.repeat(card, now)[grade].card;
    return {
        ...state,
        lines: { ...state.lines, [lineId]: { ...line, review: fromCard(next) } },
    };
}

/** Learned lines without a schedule yet (learned before reviews existed) are due right away. */
export function isOpeningLineDue(line: OpeningLine, now = new Date()): boolean {
    if (!line.trainable || !isOpeningLineLearned(line)) return false;
    return !line.review || new Date(line.review.due).getTime() <= now.getTime();
}

/** Due lines of the given sections, most overdue first. */
export function getDueOpeningLines(
    state: OpeningsState,
    variantIds: string[],
    now = new Date(),
): OpeningLine[] {
    const dueTime = (line: OpeningLine) =>
        line.review ? new Date(line.review.due).getTime() : Number.NEGATIVE_INFINITY;
    return trainableOpeningLines(state, variantIds)
        .filter((line) => isOpeningLineDue(line, now))
        .sort((left, right) => dueTime(left) - dueTime(right));
}

/** Earliest upcoming review among learned lines that are not due yet. */
export function nextOpeningReviewDate(
    lines: readonly OpeningLine[],
    now = new Date(),
): Date | null {
    let next: number | null = null;
    for (const line of lines) {
        if (!line.trainable || !line.review || !isOpeningLineLearned(line)) continue;
        const due = new Date(line.review.due).getTime();
        if (due > now.getTime() && (next === null || due < next)) next = due;
    }
    return next === null ? null : new Date(next);
}
