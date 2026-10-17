/**
 * Spaced review of failed tactics (I-06): puzzles of the trainer and exercises of the sets that
 * were missed come back on an FSRS schedule, like the opening lines and "My mistakes". Each item
 * keeps its own copy of the position and solution, so it survives the deletion of its set.
 */
import { type Card, createEmptyCard, fsrs, generatorParameters, Rating } from "ts-fsrs";
import { z } from "zod";
import { INITIAL_TACTICS_RATING, type TacticsRating } from "./tacticsRating";

export const TACTICS_REVIEW_VERSION = 1;

const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));

const reviewSchema = z.object({
    due: z.string(),
    stability: z.number(),
    difficulty: z.number(),
    elapsed_days: z.number(),
    scheduled_days: z.number(),
    reps: z.number().int().nonnegative(),
    lapses: z.number().int().nonnegative(),
    state: z.number().int(),
    lastReview: z.string().optional(),
});

const itemSchema = z.object({
    /** Lichess puzzle id or set and exercise: the deduplication key. */
    id: z.string(),
    fen: z.string(),
    /** Solution as UCI moves, starting with the opponent's move when `opponentFirst`. */
    solution: z.array(z.string()),
    opponentFirst: z.boolean(),
    label: z.string(),
    rating: z.number().nullable(),
    themes: z.array(z.string()),
    source: z.enum(["puzzles", "set"]),
    review: reviewSchema,
    attempts: z.number().int().nonnegative(),
    solved: z.number().int().nonnegative(),
    addedAt: z.string(),
    lastResult: z.enum(["solved", "hard", "failed"]).optional(),
});
export type TacticsReviewItem = z.infer<typeof itemSchema>;
export type TacticsReviewResult = NonNullable<TacticsReviewItem["lastResult"]>;

const ratingSchema = z.object({
    rating: z.number(),
    deviation: z.number(),
    volatility: z.number(),
    games: z.number().int().nonnegative(),
    history: z.array(z.object({ at: z.string(), rating: z.number() })),
});

const bestSchema = z.object({ score: z.number().int().nonnegative(), at: z.string() });

export const tacticsReviewSchema = z.object({
    version: z.literal(TACTICS_REVIEW_VERSION),
    items: z.record(itemSchema),
    /** Failed puzzles and exercises join the review on their own (on by default). */
    autoAdd: z.boolean(),
    rating: ratingSchema,
    /** Best results of the trainer's storm and streak. */
    best: z.object({ storm: bestSchema.optional(), streak: bestSchema.optional() }),
});
export type TacticsReviewState = z.infer<typeof tacticsReviewSchema>;

export function emptyTacticsReview(): TacticsReviewState {
    return {
        version: TACTICS_REVIEW_VERSION,
        items: {},
        autoAdd: true,
        rating: INITIAL_TACTICS_RATING,
        best: {},
    };
}

function toCard(review: TacticsReviewItem["review"]): Card {
    return {
        ...review,
        due: new Date(review.due),
        last_review: review.lastReview ? new Date(review.lastReview) : undefined,
    };
}

function fromCard(card: Card): TacticsReviewItem["review"] {
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

export type NewTacticsReviewItem = Omit<
    TacticsReviewItem,
    "review" | "attempts" | "solved" | "addedAt" | "lastResult"
>;

/** Adds a missed tactic; one already in the review is simply due again. */
export function addTacticsReviewItem(
    state: TacticsReviewState,
    item: NewTacticsReviewItem,
    now = new Date(),
): TacticsReviewState {
    const existing = state.items[item.id];
    if (existing) {
        return {
            ...state,
            items: {
                ...state.items,
                [item.id]: { ...existing, review: { ...existing.review, due: now.toISOString() } },
            },
        };
    }
    return {
        ...state,
        items: {
            ...state.items,
            [item.id]: {
                ...item,
                review: fromCard(createEmptyCard(now)),
                attempts: 0,
                solved: 0,
                addedAt: now.toISOString(),
            },
        },
    };
}

const RATING_OF: Record<TacticsReviewResult, Rating.Again | Rating.Hard | Rating.Good> = {
    failed: Rating.Again,
    hard: Rating.Hard,
    solved: Rating.Good,
};

export function recordTacticsReview(
    state: TacticsReviewState,
    id: string,
    result: TacticsReviewResult,
    now = new Date(),
): TacticsReviewState {
    const item = state.items[id];
    if (!item) return state;
    const next = scheduler.repeat(toCard(item.review), now)[RATING_OF[result]].card;
    return {
        ...state,
        items: {
            ...state.items,
            [id]: {
                ...item,
                review: fromCard(next),
                attempts: item.attempts + 1,
                solved: item.solved + (result === "failed" ? 0 : 1),
                lastResult: result,
            },
        },
    };
}

export function removeTacticsReviewItem(state: TacticsReviewState, id: string) {
    const items = { ...state.items };
    delete items[id];
    return { ...state, items };
}

/** Due items, most overdue first. */
export function dueTacticsReview(state: TacticsReviewState, now = new Date()) {
    return Object.values(state.items)
        .filter((item) => new Date(item.review.due).getTime() <= now.getTime())
        .sort((left, right) => left.review.due.localeCompare(right.review.due));
}

export function nextTacticsReviewDate(state: TacticsReviewState, now = new Date()): Date | null {
    let next: number | null = null;
    for (const item of Object.values(state.items)) {
        const due = new Date(item.review.due).getTime();
        if (due > now.getTime() && (next === null || due < next)) next = due;
    }
    return next === null ? null : new Date(next);
}

export function withRating(state: TacticsReviewState, rating: TacticsRating): TacticsReviewState {
    return { ...state, rating };
}

export function recordBest(
    state: TacticsReviewState,
    mode: "storm" | "streak",
    score: number,
    now = new Date(),
): TacticsReviewState {
    const previous = state.best[mode];
    if (previous && previous.score >= score) return state;
    return { ...state, best: { ...state.best, [mode]: { score, at: now.toISOString() } } };
}
