import { describe, expect, it } from "vitest";
import type {
    PlayerAnalysisCriticalPosition,
    PlayerEngineAnalysis,
    PlayerEngineGameMetrics,
} from "@/utils/playerAnalysis";
import { classifyLeak, leakCatalogue, leakTrend, quarterOf } from "./leaks";
import {
    addMistakes,
    dueItems,
    emptyQueue,
    isDue,
    mistakeQueuesSchema,
    recordResult,
    removeMistake,
    summarizeQueue,
} from "./queue";

function critical(input: Partial<PlayerAnalysisCriticalPosition>): PlayerAnalysisCriticalPosition {
    return {
        key: "db:1",
        databasePath: "db",
        databaseTitle: "DB",
        gameId: 1,
        playerId: 1,
        ply: 40,
        fen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1",
        postMoveFen: "4k3/8/8/8/8/8/4P3/3K4 b - - 1 1",
        playedMove: "e1d1",
        bestLine: ["e2e4"],
        punishmentLine: ["e8d8"],
        playerColor: "white",
        cpLoss: 80,
        winChanceLoss: 6,
        winChanceBefore: 50,
        classification: "inaccuracy",
        phase: "middlegame",
        opening: "Opening",
        gameLabel: "A – B",
        gameDate: "2026.03.10",
        ...input,
    };
}

describe("leak catalogue (I-29)", () => {
    it("names checked tactical errors first", () => {
        expect(
            classifyLeak(
                critical({
                    playerColor: "black",
                    fen: "k7/8/1K6/8/8/8/7Q/8 b - - 0 1",
                    postMoveFen: "k7/8/1K6/8/8/8/7Q/8 w - - 0 1",
                    punishmentLine: ["h2h8"],
                    winChanceLoss: 60,
                }),
            ),
        ).toBe("allowedMate");
        expect(
            classifyLeak(
                critical({
                    fen: "4k3/8/3p4/8/8/5N2/8/4K3 w - - 0 1",
                    postMoveFen: "4k3/8/3p4/4N3/8/8/8/4K3 b - - 1 1",
                    playedMove: "f3e5",
                    bestLine: ["e1e2"],
                    punishmentLine: ["d6e5"],
                    winChanceLoss: 30,
                }),
            ),
        ).toBe("hangingPiece");
        expect(
            classifyLeak(
                critical({
                    fen: "r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1",
                    postMoveFen: "r3k3/8/8/1N6/8/8/4K3/8 b - - 1 1",
                    playedMove: "e1e2",
                    bestLine: ["b5c7"],
                    punishmentLine: ["a8a1"],
                    winChanceLoss: 15,
                }),
            ),
        ).toBe("missedFork");
        expect(classifyLeak(critical({ bestWasMate: true, winChanceLoss: 40 }))).toBe("missedMate");
    });

    it("falls back to the situation and then to unclassified", () => {
        expect(classifyLeak(critical({ winChanceBefore: 85, winChanceLoss: 30 }))).toBe(
            "conversion",
        );
        expect(classifyLeak(critical({ winChanceBefore: 25, winChanceLoss: 15 }))).toBe("collapse");
        expect(classifyLeak(critical({ clockShare: 0.05 }))).toBe("timeTrouble");
        expect(classifyLeak(critical({ ply: 6 }))).toBe("opening");
        expect(classifyLeak(critical({ phase: "endgame" }))).toBe("endgame");
        expect(classifyLeak(critical({}))).toBe("unclassified");
        // A small loss is never named as a tactic.
        expect(classifyLeak(critical({ bestWasMate: true, winChanceLoss: 6 }))).toBe(
            "unclassified",
        );
    });

    it("sums the cost and the games turned into losses, and follows the trend", () => {
        const mistake = (input: Partial<PlayerAnalysisCriticalPosition>) =>
            critical({ classification: "mistake", ...input });
        const games: PlayerEngineGameMetrics[] = [
            {
                key: "db:1",
                moves: 60,
                criticalPositions: [mistake({ ply: 6, winChanceLoss: 12 })],
            },
            {
                key: "db:2",
                moves: 60,
                criticalPositions: [
                    mistake({ key: "db:2", ply: 8, winChanceLoss: 20, gameDate: "2026.07.01" }),
                    critical({ key: "db:2", classification: "inaccuracy" }),
                ],
            },
        ].map((game) => game as unknown as PlayerEngineGameMetrics);
        const engine = { games } as unknown as PlayerEngineAnalysis;
        const keys = new Set(["db:1", "db:2"]);
        const catalogue = leakCatalogue(engine, keys, new Map([["db:2", "loss"]]));
        expect(catalogue.rows).toHaveLength(1);
        expect(catalogue.rows[0]).toMatchObject({
            category: "opening",
            errors: 2,
            cost: 32,
            turnedLosses: 1,
        });
        expect(quarterOf("2026.07.01")).toBe("2026-Q3");
        const trend = leakTrend(
            engine,
            keys,
            new Map([
                ["db:1", "2026-03-10"],
                ["db:2", "2026-07-01"],
            ]),
            ["opening"],
            50,
        );
        expect(trend.map((point) => point.quarter)).toEqual(["2026-Q1", "2026-Q3"]);
        expect(trend[0].opening).toBeCloseTo(1.7, 1);
    });
});

describe("My mistakes (I-17)", () => {
    const blunder = critical({ classification: "blunder", winChanceLoss: 40 });

    it("adds each position once and remembers every game", () => {
        const first = addMistakes(emptyQueue(), [blunder]);
        expect(first.added).toBe(1);
        const again = addMistakes(first.queue, [
            { ...blunder, gameId: 2, key: "db:2" },
            critical({}), // an inaccuracy, left out by default
        ]);
        expect(again.added).toBe(0);
        const [item] = Object.values(again.queue.items);
        expect(item.sources.map((source) => source.gameId)).toEqual([1, 2]);
    });

    it("schedules with FSRS and keeps removed positions out", () => {
        const now = new Date("2026-10-16T10:00:00Z");
        const { queue } = addMistakes(emptyQueue(), [blunder], now);
        const [item] = Object.values(queue.items);
        expect(isDue(item, now)).toBe(true);
        const reviewed = recordResult(item, "solved", now);
        expect(reviewed.solved).toBe(1);
        expect(isDue(reviewed, now)).toBe(false);
        const failed = recordResult(item, "failed", now);
        expect(new Date(failed.review!.due).getTime()).toBeLessThan(
            new Date(reviewed.review!.due).getTime(),
        );
        const withReview = { ...queue, items: { [item.id]: reviewed } };
        expect(dueItems(withReview, {}, 20, now)).toHaveLength(0);
        expect(summarizeQueue(withReview, now).nextDue).not.toBeNull();
        const removed = removeMistake(queue, item.id);
        expect(Object.keys(removed.items)).toHaveLength(0);
        expect(addMistakes(removed, [blunder]).added).toBe(0);
    });

    it("reads files written before the newer fields", () => {
        const parsed = mistakeQueuesSchema.parse({
            version: 1,
            owners: { self: { items: {}, autoAdd: true, includeInaccuracies: false } },
        });
        expect(parsed.owners.self.dismissed).toEqual([]);
        expect(parsed.owners.self.synced).toEqual({});
    });
});
