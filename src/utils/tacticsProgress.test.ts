import { describe, expect, it } from "vitest";
import {
    applyRushResult,
    buildPuzzleFilter,
    finishRushIfTimeUp,
    rushRange,
    rushScore,
    startRush,
    STORM_PENALTY_MS,
} from "./puzzleSession";
import { INITIAL_TACTICS_RATING, ratingBandFor, updateTacticsRating } from "./tacticsRating";
import {
    addTacticsReviewItem,
    dueTacticsReview,
    emptyTacticsReview,
    recordBest,
    recordTacticsReview,
} from "./tacticsReview";

describe("puzzle filters", () => {
    it("turns the trainer settings into the backend filter", () => {
        expect(
            buildPuzzleFilter({
                range: [1200, 1600],
                themes: ["fork", "pin"],
                themeMode: "all",
                quality: "good",
                length: "long",
            }),
        ).toEqual({
            minRating: 1200,
            maxRating: 1600,
            themes: ["fork", "pin"],
            matchAllThemes: true,
            excludeThemes: [],
            minPopularity: 70,
            minPlays: 50,
            minSolutionMoves: 4,
            maxSolutionMoves: null,
            maxPieces: null,
        });
        // "All" with a single theme is the same as "any".
        expect(
            buildPuzzleFilter({
                range: [1200, 1600],
                themes: ["fork"],
                themeMode: "all",
                quality: "all",
                length: "any",
            }).matchAllThemes,
        ).toBe(false);
    });
});

describe("storm and streak", () => {
    it("raises the difficulty with each solved puzzle and keeps the best combo", () => {
        let state = startRush(
            "streak",
            { stormSeconds: 180, streakLives: 2, countdownSeconds: 30 },
            1500,
            0,
        );
        expect(rushRange(state)).toEqual([1250, 1350]);
        state = applyRushResult(state, true, 1300, 1);
        state = applyRushResult(state, true, 1370, 2);
        expect(rushRange(state)[0]).toBe(1370);
        state = applyRushResult(state, false, 1420, 3);
        expect(state.status).toBe("running");
        expect(state.combo).toBe(0);
        state = applyRushResult(state, false, 1420, 4);
        expect(state.status).toBe("over");
        expect(rushScore(state)).toBe(2);
        expect(state.highestSolved).toBe(1370);
    });

    it("takes time away in storm and ends when it runs out", () => {
        let state = startRush(
            "storm",
            { stormSeconds: 180, streakLives: 1, countdownSeconds: 30 },
            1500,
            0,
        );
        state = applyRushResult(state, false, 1200, 1000);
        expect(state.endsAt).toBe(180_000 - STORM_PENALTY_MS);
        expect(finishRushIfTimeUp(state, 170_000).status).toBe("over");
    });
});

describe("tactical rating", () => {
    it("rises after solving and falls after failing, faster while provisional", () => {
        const solved = updateTacticsRating(
            INITIAL_TACTICS_RATING,
            { rating: 1500, deviation: 80 },
            true,
        );
        const failed = updateTacticsRating(
            INITIAL_TACTICS_RATING,
            { rating: 1500, deviation: 80 },
            false,
        );
        expect(solved.rating).toBeGreaterThan(1600);
        expect(failed.rating).toBeLessThan(1400);
        expect(solved.deviation).toBeLessThan(INITIAL_TACTICS_RATING.deviation);
        expect(solved.history).toHaveLength(1);

        let settled = INITIAL_TACTICS_RATING;
        for (let index = 0; index < 60; index++) {
            settled = updateTacticsRating(
                settled,
                { rating: 1800, deviation: 75 },
                index % 2 === 0,
            );
        }
        const step =
            updateTacticsRating(settled, { rating: 1800, deviation: 75 }, true).rating -
            settled.rating;
        expect(Math.abs(settled.rating - 1800)).toBeLessThan(120);
        expect(step).toBeLessThan(40);
        expect(ratingBandFor(settled)[1] - ratingBandFor(settled)[0]).toBe(300);
    });
});

describe("tactics review", () => {
    const item = {
        id: "lichess:42",
        fen: "8/8/8/8/8/8/8/8 w - - 0 1",
        solution: ["e2e4", "e7e5"],
        opponentFirst: true,
        label: "Puzzle 42",
        rating: 1500,
        themes: ["fork"],
        source: "puzzles" as const,
    };

    it("adds a missed tactic once and schedules it with FSRS", () => {
        const now = new Date("2026-10-16T10:00:00Z");
        let state = addTacticsReviewItem(emptyTacticsReview(), item, now);
        state = addTacticsReviewItem(state, item, now);
        expect(Object.keys(state.items)).toHaveLength(1);
        expect(dueTacticsReview(state, now)).toHaveLength(1);
        state = recordTacticsReview(state, item.id, "solved", now);
        expect(dueTacticsReview(state, now)).toHaveLength(0);
        expect(state.items[item.id]).toMatchObject({
            attempts: 1,
            solved: 1,
            lastResult: "solved",
        });
    });

    it("keeps only the best storm result", () => {
        let state = recordBest(emptyTacticsReview(), "storm", 12);
        state = recordBest(state, "storm", 9);
        expect(state.best.storm?.score).toBe(12);
    });
});

describe("blind visualization", () => {
    it("hides the opponent's first move of a puzzle", async () => {
        const { blindFromOpponentMove } = await import("./tacticsVisualization");
        const view = blindFromOpponentMove(
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "e2e4",
        );
        expect(view?.hiddenSans).toEqual(["e4"]);
    });

    it("goes back the requested half-moves in the source game", async () => {
        const { blindFromGame } = await import("./tacticsVisualization");
        const target = "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";
        const view = blindFromGame("1. e4 c5 2. Nf3 d6 3. d4", null, target, 3, 2);
        expect(view?.hiddenSans).toEqual(["c5", "Nf3"]);
        expect(view?.fen.startsWith("rnbqkbnr/pppppppp/8/8/4P3")).toBe(true);
    });
});
