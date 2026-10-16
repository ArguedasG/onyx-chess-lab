import { describe, expect, it } from "vitest";
import type { PlayerGameRow } from "@/bindings";
import type {
    PlayerAnalysisSource,
    PlayerEngineAnalysis,
    PlayerEngineGameMetrics,
} from "@/utils/playerAnalysis";
import { expectedScore, formatParDelta } from "@/utils/ratingPar";
import {
    endings,
    engineHabits,
    isProbableTimeLoss,
    resultsAfterResult,
    standoutRange,
} from "./habits";
import { engineHighlights, playerHighlights } from "./highlights";
import {
    filterProfileGames,
    mergeProfileGames,
    normalizeGameDate,
    type ProfileGame,
    toProfileGame,
} from "./profileGames";
import { activityByMonth, openingBuckets, ratingSummaries, resultBucket } from "./results";
import { gamesAgainst, nemesisAndFavourite, rivals } from "./rivals";

const source: PlayerAnalysisSource = {
    databasePath: "base.db3",
    databaseTitle: "Base",
    playerId: 1,
    playerName: "Player",
};

let nextId = 1;
function game(input: Partial<PlayerGameRow> & { result: string }): ProfileGame {
    const id = input.id ?? nextId++;
    return toProfileGame(
        {
            id,
            playerId: 1,
            isWhite: true,
            opponent: "Rival",
            opponentId: 2,
            playerElo: 1500,
            opponentElo: 1500,
            date: "2026.01.10",
            time: null,
            event: "Event",
            site: "https://lichess.org/abc",
            timeControl: "180+2",
            eco: null,
            opening: "French Defense: Advance Variation",
            plies: 60,
            customStart: false,
            ending: "open",
            playerToMoveAtEnd: false,
            playerLastClock: null,
            opponentLastClock: null,
            ...input,
        },
        source,
    );
}

describe("rating par", () => {
    it("uses the Elo formula", () => {
        expect(expectedScore(1500, 1500)).toBeCloseTo(0.5);
        expect(expectedScore(1700, 1500)).toBeCloseTo(0.76, 2);
        expect(formatParDelta(4.26)).toBe("+4.3");
        expect(formatParDelta(-3)).toBe("−3.0");
        expect(formatParDelta(null)).toBe("—");
    });

    it("compares the score of rated games with what the ratings predict", () => {
        const bucket = resultBucket("all", [
            game({ result: "1-0", opponentElo: 1700 }),
            game({ result: "0-1", opponentElo: 1700 }),
            game({ result: "1-0", opponentElo: null }),
        ]);
        expect(bucket.games).toBe(3);
        expect(bucket.ratedGames).toBe(2);
        expect(bucket.ratedScorePercent).toBe(50);
        expect(bucket.expectedPercent).toBeCloseTo(24, 0);
        expect(bucket.parDelta).toBeCloseTo(26, 0);
    });
});

describe("profile games", () => {
    it("normalizes PGN dates with unknown parts", () => {
        expect(normalizeGameDate("2024.05.01")).toBe("2024-05-01");
        expect(normalizeGameDate("2024.05.??")).toBe("2024-05");
        expect(normalizeGameDate("????.??.??")).toBeNull();
    });

    it("reads the outcome from the player's side", () => {
        expect(game({ result: "0-1", isWhite: false }).outcome).toBe("win");
        expect(game({ result: "1/2-1/2" }).points).toBe(0.5);
        expect(game({ result: "*" }).outcome).toBe("unknown");
    });

    it("merges aliases without counting a game twice", () => {
        const shared = game({ id: 500, result: "1-0" });
        expect(mergeProfileGames([[shared], [shared, game({ result: "0-1" })]])).toHaveLength(2);
    });

    it("filters by time control, color and period", () => {
        const games = [
            game({ result: "1-0", timeControl: "60+0", date: "2025.06.01" }),
            game({ result: "1-0", isWhite: false, date: "2025.01.01" }),
            game({ result: "1-0", date: "2026.03.01" }),
        ];
        const today = new Date("2026-04-01T00:00:00Z");
        expect(
            filterProfileGames(
                games,
                { timeControl: "bullet", period: "all", color: "any" },
                today,
            ),
        ).toHaveLength(1);
        expect(
            filterProfileGames(games, { timeControl: "all", period: "all", color: "black" }, today),
        ).toHaveLength(1);
        expect(
            filterProfileGames(games, { timeControl: "all", period: "3m", color: "any" }, today),
        ).toHaveLength(1);
    });
});

describe("results", () => {
    it("builds opening levels with exact results per color", () => {
        const games = [
            game({ result: "1-0", opening: "French Defense: Advance Variation" }),
            game({ result: "0-1", opening: "French Defense: Winawer Variation" }),
            game({ result: "1-0", opening: "Sicilian Defense", isWhite: false }),
        ];
        const white = openingBuckets(games, "white");
        expect(white.games).toBe(2);
        expect(white.groups.find((bucket) => bucket.key === "French Defense")?.games).toBe(2);
        expect(white.leaves).toHaveLength(2);
    });

    it("fills empty months in the activity", () => {
        const activity = activityByMonth([
            game({ result: "1-0", date: "2026.01.05" }),
            game({ result: "1-0", date: "2026.03.05" }),
        ]);
        expect(activity.map((value) => value.games)).toEqual([1, 0, 1]);
    });

    it("keeps the latest and the peak rating per time control", () => {
        const [blitz] = ratingSummaries([
            game({ result: "1-0", date: "2026.01.01", playerElo: 1600 }),
            game({ result: "1-0", date: "2026.02.01", playerElo: 1550 }),
        ]);
        expect(blitz.current).toBe(1550);
        expect(blitz.peak).toBe(1600);
    });
});

describe("highlights", () => {
    it("finds upsets, streaks and the fastest mate", () => {
        const highlights = playerHighlights([
            game({ result: "1-0", date: "2026.01.01", opponentElo: 1800, playerElo: 1500 }),
            game({ result: "1-0", date: "2026.01.02", ending: "checkmate", plies: 15 }),
            game({ result: "1-0", date: "2026.01.03" }),
            game({ result: "0-1", date: "2026.01.04" }),
            game({ result: "0-1", date: "2026.01.05" }),
        ]);
        expect(highlights.biggestUpset?.eloGap).toBe(300);
        expect(highlights.strongestWin?.game.opponentElo).toBe(1800);
        expect(highlights.longestWinStreak?.length).toBe(3);
        expect(highlights.currentStreak).toMatchObject({ outcome: "loss", length: 2 });
        expect(highlights.fastestMate?.moves).toBe(8);
    });

    it("takes engine moments only from the games in view", () => {
        const won = game({ result: "1-0" });
        const engine = {
            criticalPositions: [
                { key: won.key, cpLoss: 300, winChanceLoss: 30, ply: 20 },
                { key: "other:1", cpLoss: 900, winChanceLoss: 60, ply: 10 },
            ],
            games: [{ key: won.key, lowestWinChance: 8 }],
        } as unknown as PlayerEngineAnalysis;
        const moments = engineHighlights(engine, [won]);
        expect(moments.costliestError?.critical.winChanceLoss).toBe(30);
        expect(moments.biggestComeback?.lowestWinChance).toBe(8);
    });
});

describe("habits", () => {
    it("compares the next game of the same day by previous result", () => {
        const stats = resultsAfterResult([
            game({ result: "0-1", date: "2026.01.01", time: "10:00:00" }),
            game({ result: "1-0", date: "2026.01.01", time: "11:00:00" }),
            game({ result: "0-1", date: "2026.01.02", time: "10:00:00" }),
        ]);
        expect(stats.afterLoss.games).toBe(1);
        expect(stats.afterLoss.wins).toBe(1);
        expect(stats.afterWin.games).toBe(0);
    });

    it("tells probable time losses from mates and resignations", () => {
        const flagged = game({ result: "0-1", playerToMoveAtEnd: true, playerLastClock: 3 });
        const resigned = game({ result: "0-1", playerToMoveAtEnd: true, playerLastClock: 90 });
        const mated = game({ result: "0-1", ending: "checkmate", playerToMoveAtEnd: true });
        expect(isProbableTimeLoss(flagged, "player")).toBe(true);
        expect(isProbableTimeLoss(resigned, "player")).toBe(false);
        expect(endings([flagged, resigned, mated], "loss")).toEqual({
            total: 3,
            checkmate: 1,
            probableTime: 1,
            other: 1,
            withClock: 2,
        });
    });

    it("aggregates engine habits and losses in positions that were not lost", () => {
        const lost = game({ result: "0-1" });
        const metrics = {
            key: lost.key,
            finalWinChance: 45,
            moveRanges: [
                { moves: 10, errors: 0 },
                { moves: 10, errors: 1 },
            ],
        } as unknown as PlayerEngineGameMetrics;
        const habits = engineHabits({ games: [metrics] } as unknown as PlayerEngineAnalysis, [
            lost,
        ]);
        expect(habits?.notLostLosses).toEqual({ losses: 1, notLost: [lost] });
        expect(habits?.moveRanges?.ranges[1]).toEqual({ moves: 10, errors: 1 });
    });

    it("names a move range only when it stands out with enough moves", () => {
        expect(
            standoutRange([
                { moves: 100, errors: 2 },
                { moves: 100, errors: 10 },
            ]),
        ).toMatchObject({ index: 1 });
        expect(
            standoutRange([
                { moves: 100, errors: 5 },
                { moves: 100, errors: 6 },
            ]),
        ).toBeNull();
    });
});

describe("rivals", () => {
    it("ranks nemesis and favourite by score against expectation", () => {
        const games = [
            ...Array.from({ length: 5 }, () =>
                game({ result: "0-1", opponent: "Strong", opponentId: 3, opponentElo: 2100 }),
            ),
            ...Array.from({ length: 5 }, () =>
                game({ result: "0-1", opponent: "Equal", opponentId: 4 }),
            ),
            ...Array.from({ length: 5 }, () =>
                game({ result: "1-0", opponent: "Weak", opponentId: 5 }),
            ),
        ];
        const list = rivals(games);
        expect(list).toHaveLength(3);
        const { nemesis, favourite } = nemesisAndFavourite(list);
        // Losing to a much stronger rival was expected, losing to an equal one was not.
        expect(nemesis?.name).toBe("Equal");
        expect(favourite?.name).toBe("Weak");
    });

    it("finds the games against the user's own records", () => {
        const games = [
            game({ result: "1-0", opponentId: 9 }),
            game({ result: "1-0", opponentId: 2 }),
        ];
        const own = { ...source, playerId: 9 };
        expect(gamesAgainst(games, [own])).toHaveLength(1);
    });
});
