import { describe, expect, it } from "vitest";
import type { MoveAnalysis, NormalizedGame } from "@/bindings";
import {
    aggregateEngineAnalysis,
    analyzePlayerGames,
    buildEngineGameMetrics,
    criticalPositionForPerspective,
    DEFAULT_PLAYER_ANALYSIS_FILTERS,
    getPlayerAnalysisTimeControl,
    playerClockCoverage,
    playerAnalysisTimeControlCounts,
    selectPlayerEngineGames,
    type PlayerAnalysisGame,
    type PlayerAnalysisSource,
} from "./playerAnalysis";

describe("clock coverage levels", () => {
    it("requires both the agreed sample and coverage thresholds", () => {
        expect(playerClockCoverage(9, 10).level).toBe("insufficient");
        expect(playerClockCoverage(10, 20).level).toBe("exploratory");
        expect(playerClockCoverage(20, 28).level).toBe("adequate");
        expect(playerClockCoverage(50, 58).level).toBe("high");
        expect(playerClockCoverage(49, 50).level).toBe("adequate");
    });
});

const source: PlayerAnalysisSource = {
    databasePath: "lichess.db3",
    databaseTitle: "Player Lichess",
    playerId: 1,
    playerName: "Player",
};

function game(
    id: number,
    input: Partial<NormalizedGame> & Pick<NormalizedGame, "white" | "black" | "result">,
): PlayerAnalysisGame {
    return {
        key: `${source.databasePath}:${id}`,
        source,
        game: {
            id,
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            event: "Rated",
            event_id: 1,
            site: "https://lichess.org/game",
            site_id: 1,
            white_id: input.white === "Player" ? 1 : 2,
            black_id: input.black === "Player" ? 1 : 2,
            white_elo: 1800,
            black_elo: 1900,
            time_control: "600+0",
            eco: "B12 Caro-Kann",
            ply_count: 40,
            moves: "1. e4 c6 2. d4 d5 *",
            ...input,
        },
    };
}

describe("player metadata analysis", () => {
    it("uses the player's perspective and keeps evidence for weak cohorts", () => {
        const games = Array.from({ length: 10 }, (_, index) =>
            game(index + 1, {
                white: index % 2 === 0 ? "Player" : "Opponent",
                black: index % 2 === 0 ? "Opponent" : "Player",
                result: index < 2 ? (index % 2 === 0 ? "1-0" : "0-1") : "0-1",
                date: `2026.01.${String(index + 1).padStart(2, "0")}`,
            }),
        );
        const report = analyzePlayerGames(
            "Player",
            games,
            [source],
            DEFAULT_PLAYER_ANALYSIS_FILTERS,
            "2026-01-20T00:00:00.000Z",
        );
        expect(report.schemaVersion).toBe(3);
        expect(report.summary.games).toBe(10);
        expect(report.summary.wins).toBe(6);
        expect(report.summary.losses).toBe(4);
        expect(report.openings[0].references[0]).toMatchObject({
            databasePath: "lichess.db3",
            gameId: 1,
        });
        expect(report.findings.every((finding) => finding.sampleSize >= 5)).toBe(true);
    });

    it("applies date, color, opponent rating and time-control filters", () => {
        const games = [
            game(1, { white: "Player", black: "Opponent", result: "1-0", date: "2025.01.01" }),
            game(2, {
                white: "Opponent",
                black: "Player",
                result: "0-1",
                date: "2026.01.01",
                time_control: "180+2",
                white_elo: 2100,
            }),
        ];
        const report = analyzePlayerGames("Player", games, [source], {
            ...DEFAULT_PLAYER_ANALYSIS_FILTERS,
            startDate: "2026.01.01",
            color: "black",
            opponentEloMin: 2000,
            timeControl: "180+2",
        });
        expect(report.sampleSize).toBe(1);
        expect(report.summary.wins).toBe(1);
        expect(report.summary.averageOpponentElo).toBe(2100);
    });

    it("uses a derived opening name when the source PGN has no ECO header", () => {
        const report = analyzePlayerGames(
            "Player",
            [
                game(1, {
                    white: "Player",
                    black: "Opponent",
                    result: "1-0",
                    eco: null,
                    opening: "Caro-Kann Defense",
                }),
            ],
            [source],
        );

        expect(report.openings[0].key).toBe("Caro-Kann Defense");
    });

    it("selects either the requested newest games or the complete filtered sample", () => {
        const games = [
            game(1, { white: "Player", black: "A", result: "1-0", date: "2026.01.01" }),
            game(2, { white: "Player", black: "B", result: "1-0", date: "2026.03.01" }),
            game(3, { white: "Player", black: "C", result: "1-0", date: "2026.02.01" }),
        ];

        expect(
            selectPlayerEngineGames(games, DEFAULT_PLAYER_ANALYSIS_FILTERS, 2).map(
                (item) => item.game.id,
            ),
        ).toEqual([2, 3]);
        expect(selectPlayerEngineGames(games, DEFAULT_PLAYER_ANALYSIS_FILTERS, "all")).toHaveLength(
            3,
        );
    });

    it("combines selected time controls before applying the newest-game limit", () => {
        const games = [
            game(1, {
                white: "Player",
                black: "A",
                result: "1-0",
                date: "2026.04.01",
                time_control: "60+0",
            }),
            game(2, {
                white: "Player",
                black: "B",
                result: "1-0",
                date: "2026.03.01",
                time_control: "180+2",
            }),
            game(3, {
                white: "Player",
                black: "C",
                result: "1-0",
                date: "2026.02.01",
                time_control: "600+0",
            }),
            game(4, {
                white: "Player",
                black: "D",
                result: "1-0",
                date: "2026.01.01",
                time_control: "180+2",
            }),
        ];

        expect(
            selectPlayerEngineGames(games, DEFAULT_PLAYER_ANALYSIS_FILTERS, 2, [
                "blitz",
                "rapid",
            ]).map((item) => item.game.id),
        ).toEqual([2, 3]);
        expect(playerAnalysisTimeControlCounts(games, DEFAULT_PLAYER_ANALYSIS_FILTERS)).toEqual([
            { value: "bullet", count: 1 },
            { value: "blitz", count: 2 },
            { value: "rapid", count: 1 },
        ]);
    });

    it("recognizes Chess.com daily games and unknown time controls", () => {
        const daily = game(1, {
            white: "Player",
            black: "A",
            result: "1-0",
            site: "https://www.chess.com/game/daily/1",
            time_control: "1/86400",
        });
        const unknown = game(2, {
            white: "Player",
            black: "B",
            result: "1-0",
            time_control: "?",
        });
        const malformed = game(3, {
            white: "Player",
            black: "C",
            result: "1-0",
            time_control: "40/7200:3600",
        });
        expect(getPlayerAnalysisTimeControl(daily)).toBe("daily");
        expect(getPlayerAnalysisTimeControl(unknown)).toBe("unknown");
        expect(getPlayerAnalysisTimeControl(malformed)).toBe("unknown");
    });
});

function moveAnalysis(
    score: MoveAnalysis["best"][number]["score"]["value"],
    bestMove = "e2e4",
): MoveAnalysis {
    return {
        novelty: false,
        is_sacrifice: false,
        best: [
            {
                nodes: 1,
                depth: 1,
                score: { value: score, wdl: null },
                uciMoves: [bestMove],
                sanMoves: ["e4"],
                multipv: 1,
                nps: 1,
            },
        ],
    };
}

describe("player engine analysis", () => {
    it("counts only the player's moves and exposes critical positions", () => {
        const item = game(1, { white: "Player", black: "Opponent", result: "0-1" });
        const metrics = buildEngineGameMetrics({
            item,
            uciMoves: ["e2e4", "e7e5", "g1f3"],
            preMoveFens: [
                "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
                "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
                "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
            ],
            analysis: [
                moveAnalysis({ type: "cp", value: 200 }),
                moveAnalysis({ type: "cp", value: -150 }),
                moveAnalysis({ type: "cp", value: 20 }, "g1f3"),
                moveAnalysis({ type: "cp", value: -100 }),
            ],
            hasClockData: true,
            clockSeconds: [590, null, 20],
        });
        expect(metrics.moves).toBe(2);
        expect(metrics.blunders).toBe(1);
        expect(metrics.mistakes).toBe(1);
        expect(metrics.criticalPositions).toHaveLength(2);
        expect(metrics.clock).toMatchObject({
            clockedMoves: 2,
            measuredDecisions: 2,
            averageDecisionSeconds: 290,
            lowTimeMoves: 1,
            criticalErrorsInLowTime: 1,
        });
        expect(metrics.criticalPositions[0]).toMatchObject({
            gameId: 1,
            ply: 0,
            classification: "blunder",
        });
        expect(
            criticalPositionForPerspective(metrics.criticalPositions[0], "improveDecision"),
        ).toMatchObject({
            mode: "improveDecision",
            ply: 0,
            sideToMove: "white",
            fen: metrics.criticalPositions[0].fen,
        });
        expect(
            criticalPositionForPerspective(metrics.criticalPositions[0], "punishError"),
        ).toMatchObject({
            mode: "punishError",
            ply: 1,
            sideToMove: "black",
            fen: metrics.criticalPositions[0].postMoveFen,
        });

        const aggregate = aggregateEngineAnalysis({
            engine: {
                name: "Stockfish",
                path: "stockfish",
                args: [],
                options: [],
                limit: "time:250ms",
            },
            requestedGames: 1,
            eligibleGames: 4,
            timeControls: ["blitz", "rapid"],
            timeControlBreakdown: [
                { value: "blitz", eligibleGames: 3, analyzedGames: 1 },
                { value: "rapid", eligibleGames: 1, analyzedGames: 0 },
            ],
            skippedGames: 0,
            games: [metrics],
            analyzedAt: "2026-01-20T00:00:00.000Z",
        });
        expect(aggregate.analyzedGames).toBe(1);
        expect(aggregate.eligibleGames).toBe(4);
        expect(aggregate.timeControls).toEqual(["blitz", "rapid"]);
        expect(aggregate.timeControlBreakdown).toEqual([
            { value: "blitz", eligibleGames: 3, analyzedGames: 1 },
            { value: "rapid", eligibleGames: 1, analyzedGames: 0 },
        ]);
        expect(aggregate.moves).toBe(2);
        expect(aggregate.criticalPositions).toHaveLength(2);
        expect(aggregate.advantageGames).toBe(1);
        expect(aggregate.conversionRate).toBe(0);
        expect(aggregate.clockCoverage?.level).toBe("insufficient");
        expect(aggregate.timeManagement).toBeUndefined();

        const covered = aggregateEngineAnalysis({
            engine: aggregate.engine,
            requestedGames: 10,
            skippedGames: 0,
            games: Array.from({ length: 10 }, () => metrics),
        });
        expect(covered.clockCoverage?.level).toBe("exploratory");
        expect(covered.timeManagement).toEqual({
            measuredDecisions: 20,
            averageDecisionSeconds: 290,
            lowTimeMoves: 10,
            criticalErrorsInLowTime: 10,
        });
    });
});
