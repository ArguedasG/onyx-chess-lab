/**
 * "My mistakes" (8.7, I-17): the errors of the analyzed games as a spaced-repetition queue. One
 * item per position and played move, so the same error in several games is reviewed once and
 * remembers every game it came from. The schedule is FSRS, like the opening lines.
 */
import { type Card, createEmptyCard, fsrs, generatorParameters, Rating } from "ts-fsrs";
import { z } from "zod";
import type { PlayerAnalysisCriticalPosition } from "@/utils/playerAnalysis";
import { classifyLeak, type LeakCategory } from "./leaks";

export const MISTAKE_QUEUE_VERSION = 1;

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

const sourceSchema = z.object({
    databasePath: z.string(),
    gameId: z.number().int(),
    ply: z.number().int().nonnegative(),
    gameLabel: z.string(),
    gameDate: z.string().nullable().optional(),
});

const itemSchema = z.object({
    id: z.string(),
    /** Position without move counters and the played move: the deduplication key. */
    key: z.string(),
    fen: z.string(),
    playedMove: z.string(),
    bestLine: z.array(z.string()),
    punishmentLine: z.array(z.string()),
    playerColor: z.enum(["white", "black"]),
    classification: z.enum(["inaccuracy", "mistake", "blunder"]),
    phase: z.enum(["opening", "middlegame", "endgame"]),
    category: z.string(),
    opening: z.string(),
    winChanceLoss: z.number().nullable(),
    cpLoss: z.number(),
    sources: z.array(sourceSchema),
    review: reviewSchema.optional(),
    attempts: z.number().int().nonnegative(),
    solved: z.number().int().nonnegative(),
    addedAt: z.string(),
    lastResult: z.enum(["solved", "hard", "failed"]).optional(),
});
export type MistakeItem = z.infer<typeof itemSchema>;
export type MistakeSource = z.infer<typeof sourceSchema>;

const ownerSchema = z.object({
    items: z.record(itemSchema),
    /** Errors are added on their own after each engine analysis (I-17, opt-in). */
    autoAdd: z.boolean(),
    /** Inaccuracies too; off by default. */
    includeInaccuracies: z.boolean(),
    /** Keys removed by the user, so an automatic addition does not bring them back. */
    dismissed: z.array(z.string()).default([]),
    /** Analysis date of each Player Analysis profile already added automatically. */
    synced: z.record(z.string()).default({}),
});
export type MistakeQueue = z.infer<typeof ownerSchema>;

export const mistakeQueuesSchema = z.object({
    version: z.literal(MISTAKE_QUEUE_VERSION),
    /** By owner: "self" for every card of the user, the analysis profile id for others. */
    owners: z.record(ownerSchema),
});
export type MistakeQueues = z.infer<typeof mistakeQueuesSchema>;

export function emptyQueues(): MistakeQueues {
    return { version: MISTAKE_QUEUE_VERSION, owners: {} };
}

export function emptyQueue(): MistakeQueue {
    return { items: {}, autoAdd: false, includeInaccuracies: false, dismissed: [], synced: {} };
}

export function mistakeKey(fen: string, playedMove: string): string {
    return `${fen.split(" ").slice(0, 4).join(" ")}|${playedMove}`;
}

function newId() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sourceOf(critical: PlayerAnalysisCriticalPosition): MistakeSource {
    return {
        databasePath: critical.databasePath,
        gameId: critical.gameId,
        ply: critical.ply ?? 0,
        gameLabel: critical.gameLabel,
        gameDate: critical.gameDate ?? null,
    };
}

/** A critical position can be trained when the engine gave a better move. */
export function isTrainable(critical: PlayerAnalysisCriticalPosition) {
    return critical.bestLine.length > 0 && critical.bestLine[0] !== critical.playedMove;
}

/**
 * Adds errors to a queue: a new position becomes an item, a known one only gains the game. Returns
 * the queue and how many items were created.
 */
export function addMistakes(
    queue: MistakeQueue,
    criticals: readonly PlayerAnalysisCriticalPosition[],
    now = new Date(),
): { queue: MistakeQueue; added: number } {
    const items = { ...queue.items };
    const byKey = new Map(Object.values(items).map((item) => [item.key, item.id]));
    const dismissed = new Set(queue.dismissed);
    let added = 0;
    for (const critical of criticals) {
        if (!isTrainable(critical)) continue;
        if (critical.classification === "inaccuracy" && !queue.includeInaccuracies) continue;
        const key = mistakeKey(critical.fen, critical.playedMove);
        if (dismissed.has(key)) continue;
        const source = sourceOf(critical);
        const existingId = byKey.get(key);
        if (existingId) {
            const existing = items[existingId];
            const known = existing.sources.some(
                (candidate) =>
                    candidate.databasePath === source.databasePath &&
                    candidate.gameId === source.gameId,
            );
            if (!known) items[existingId] = { ...existing, sources: [...existing.sources, source] };
            continue;
        }
        const id = newId();
        items[id] = {
            id,
            key,
            fen: critical.fen,
            playedMove: critical.playedMove,
            bestLine: critical.bestLine,
            punishmentLine: critical.punishmentLine,
            playerColor: critical.playerColor,
            classification: critical.classification,
            phase: critical.phase,
            category: classifyLeak(critical),
            opening: critical.opening,
            winChanceLoss: critical.winChanceLoss ?? null,
            cpLoss: critical.cpLoss,
            sources: [source],
            attempts: 0,
            solved: 0,
            addedAt: now.toISOString(),
        };
        byKey.set(key, id);
        added += 1;
    }
    return { queue: { ...queue, items }, added };
}

function toCard(review: NonNullable<MistakeItem["review"]>): Card {
    return {
        ...review,
        due: new Date(review.due),
        last_review: review.lastReview ? new Date(review.lastReview) : undefined,
    };
}

/** New items are due right away; reviewed ones when FSRS says. */
export function isDue(item: MistakeItem, now = new Date()) {
    return !item.review || new Date(item.review.due).getTime() <= now.getTime();
}

export type MistakeResult = "solved" | "hard" | "failed";

/**
 * Schedules the next review: found at the first try is "Good", found after a wrong try is "Hard"
 * and seeing the solution is "Again".
 */
export function recordResult(
    item: MistakeItem,
    result: MistakeResult,
    now = new Date(),
): MistakeItem {
    const card = item.review ? toCard(item.review) : createEmptyCard(now);
    const grade =
        result === "solved" ? Rating.Good : result === "hard" ? Rating.Hard : Rating.Again;
    const next = scheduler.repeat(card, now)[grade].card;
    return {
        ...item,
        attempts: item.attempts + 1,
        solved: item.solved + (result === "failed" ? 0 : 1),
        lastResult: result,
        review: {
            due: next.due.toISOString(),
            stability: next.stability,
            difficulty: next.difficulty,
            elapsed_days: next.elapsed_days,
            scheduled_days: next.scheduled_days,
            reps: next.reps,
            lapses: next.lapses,
            state: next.state,
            lastReview: next.last_review?.toISOString(),
        },
    };
}

export type MistakeFilter = {
    phase?: MistakeItem["phase"];
    category?: LeakCategory;
    classification?: MistakeItem["classification"];
};

export function matchesFilter(item: MistakeItem, filter: MistakeFilter) {
    return (
        (!filter.phase || item.phase === filter.phase) &&
        (!filter.category || item.category === filter.category) &&
        (!filter.classification || item.classification === filter.classification)
    );
}

/** Due items of a filter, the costliest new ones and the most overdue first; at most `limit`. */
export function dueItems(
    queue: MistakeQueue,
    filter: MistakeFilter = {},
    limit = 20,
    now = new Date(),
): MistakeItem[] {
    const due = (item: MistakeItem) =>
        item.review ? new Date(item.review.due).getTime() : Number.NEGATIVE_INFINITY;
    return Object.values(queue.items)
        .filter((item) => isDue(item, now) && matchesFilter(item, filter))
        .sort(
            (a, b) =>
                due(a) - due(b) ||
                (b.winChanceLoss ?? b.cpLoss / 10) - (a.winChanceLoss ?? a.cpLoss / 10),
        )
        .slice(0, limit);
}

export type QueueSummary = {
    total: number;
    due: number;
    learned: number;
    byPhase: Record<MistakeItem["phase"], { total: number; due: number }>;
    byCategory: Array<{ category: string; total: number; due: number }>;
    nextDue: Date | null;
};

/** "Learned": reviewed at least twice with the last one solved and the next one a week away. */
export function isLearned(item: MistakeItem) {
    return (
        (item.review?.reps ?? 0) >= 2 &&
        item.lastResult !== "failed" &&
        (item.review?.scheduled_days ?? 0) >= 7
    );
}

export function summarizeQueue(queue: MistakeQueue, now = new Date()): QueueSummary {
    const items = Object.values(queue.items);
    const byPhase = {
        opening: { total: 0, due: 0 },
        middlegame: { total: 0, due: 0 },
        endgame: { total: 0, due: 0 },
    };
    const byCategory = new Map<string, { total: number; due: number }>();
    let due = 0;
    let nextDue: number | null = null;
    for (const item of items) {
        const isItemDue = isDue(item, now);
        if (isItemDue) due += 1;
        else if (item.review) {
            const time = new Date(item.review.due).getTime();
            if (nextDue === null || time < nextDue) nextDue = time;
        }
        byPhase[item.phase].total += 1;
        if (isItemDue) byPhase[item.phase].due += 1;
        const category = byCategory.get(item.category) ?? { total: 0, due: 0 };
        category.total += 1;
        if (isItemDue) category.due += 1;
        byCategory.set(item.category, category);
    }
    return {
        total: items.length,
        due,
        learned: items.filter(isLearned).length,
        byPhase,
        byCategory: [...byCategory.entries()]
            .map(([category, counts]) => ({ category, ...counts }))
            .sort((a, b) => b.total - a.total),
        nextDue: nextDue === null ? null : new Date(nextDue),
    };
}

/** Owner of a card's queue: every card of the user shares one. */
export function queueOwner(card: { kind: string; analysisProfileId: string }) {
    return card.kind === "self" ? "self" : card.analysisProfileId;
}

/** Removes an item for good: later analyses do not add it again. */
export function removeMistake(queue: MistakeQueue, id: string): MistakeQueue {
    const item = queue.items[id];
    if (!item) return queue;
    const { [id]: _, ...items } = queue.items;
    return { ...queue, items, dismissed: [...new Set([...queue.dismissed, item.key])] };
}

/** The queue of an owner, created empty when missing. */
export function ownerQueue(queues: MistakeQueues, owner: string): MistakeQueue {
    return queues.owners[owner] ?? emptyQueue();
}

export function withOwnerQueue(
    queues: MistakeQueues,
    owner: string,
    change: (queue: MistakeQueue) => MistakeQueue,
): MistakeQueues {
    return { ...queues, owners: { ...queues.owners, [owner]: change(ownerQueue(queues, owner)) } };
}
