import { describe, expect, it } from "vitest";
import type { PlayerAnalysisCriticalPosition, PlayerEngineAnalysis } from "./playerAnalysis";
import {
    classifyPlayerEndgame,
    classifyPlayerTacticalMotif,
    playerEndgameInsights,
    playerTacticalInsights,
    playerTrainingObservation,
} from "./playerAnalysisInsights";
import { createEmptyTrainingAreas } from "./trainingAreas";

function critical(
    overrides: Partial<PlayerAnalysisCriticalPosition> = {},
): PlayerAnalysisCriticalPosition {
    return {
        key: "db:1",
        databasePath: "db.db3",
        databaseTitle: "DB",
        gameId: 1,
        playerId: 1,
        ply: 20,
        fen: "4k3/8/8/8/8/8/R7/4K3 w - - 0 1",
        postMoveFen: "Rr2k3/8/8/8/8/8/8/4K3 b - - 1 1",
        playedMove: "a2a8",
        bestLine: ["a2a7"],
        punishmentLine: ["b8a8"],
        playerColor: "white",
        cpLoss: 250,
        classification: "blunder",
        phase: "endgame",
        opening: "Unknown",
        gameLabel: "Player – Opponent",
        gameDate: "2026.01.01",
        ...overrides,
    };
}

describe("verifiable player insights", () => {
    it("classifies only motifs proven by board occupancy and the first engine move", () => {
        expect(classifyPlayerTacticalMotif(critical())).toBe("movedPiecePunished");
        expect(
            classifyPlayerTacticalMotif(
                critical({
                    fen: "3rk3/8/8/8/8/8/8/3QK3 w - - 0 1",
                    postMoveFen: "3rk3/8/8/8/8/8/4Q3/4K3 b - - 1 1",
                    playedMove: "d1e2",
                    bestLine: ["d1d8"],
                    punishmentLine: ["e8f7"],
                }),
            ),
        ).toBe("missedCapture");
        expect(
            classifyPlayerTacticalMotif(
                critical({
                    fen: "4k3/P7/8/8/8/8/8/4K3 w - - 0 1",
                    postMoveFen: "4k3/P7/8/8/8/8/4K3/8 b - - 1 1",
                    playedMove: "e1e2",
                    bestLine: ["a7a8q"],
                    punishmentLine: ["e8f7"],
                }),
            ),
        ).toBe("missedPromotion");
        const summary = playerTacticalInsights([
            critical(),
            critical({ punishmentLine: ["e8f7"], bestLine: ["a2a3"] }),
        ]);
        expect(summary.classified).toBe(1);
        expect(summary.total).toBe(2);
        expect(summary.coveragePercent).toBe(50);
    });

    it("classifies endgames by material and limits tablebases to seven pieces", () => {
        const pawn = critical({
            fen: "4k3/8/8/8/8/8/P7/4K3 w - - 0 1",
            postMoveFen: "4k3/8/8/8/8/P7/8/4K3 b - - 0 1",
        });
        expect(classifyPlayerEndgame(pawn)).toMatchObject({
            family: "pawn",
            pieceCount: 3,
            tablebaseEligible: true,
        });
        const summary = playerEndgameInsights([pawn, critical({ phase: "middlegame" })]);
        expect(summary).toMatchObject({ classified: 2, total: 2, tablebaseEligible: 2 });
        expect(
            classifyPlayerEndgame(
                critical({
                    phase: "middlegame",
                    fen: "4k3/8/8/8/8/8/3Q4/4K3 w - - 0 1",
                }),
            ),
        ).toMatchObject({ family: "queen", pieceCount: 3, tablebaseEligible: true });
    });

    it("compares linked training only as a dated observation", () => {
        const before = critical({ gameId: 1, gameDate: "2026.01.01", cpLoss: 200 });
        const after = critical({ gameId: 2, gameDate: "2026.03.01", cpLoss: 100 });
        const engine = {
            criticalPositions: [before, after],
        } as PlayerEngineAnalysis;
        const training = createEmptyTrainingAreas();
        training.tactics.exercises.exercise = {
            id: "exercise",
            title: "Position",
            fen: before.fen,
            solutionMoves: ["a2a7"],
            tags: [],
            source: {
                playerAnalysis: {
                    databasePath: before.databasePath,
                    gameId: before.gameId,
                    ply: before.ply!,
                    cpLoss: before.cpLoss,
                    classification: before.classification,
                    mode: "improveDecision",
                    fen: before.fen,
                    sideToMove: "white",
                    solution: ["a2a7"],
                },
            },
            createdAt: "2026-02-01T00:00:00.000Z",
        };
        training.tactics.attempts.push({
            id: "attempt",
            setId: "set",
            exerciseId: "exercise",
            playedMove: "a2a7",
            outcome: "correct",
            timeMs: 1000,
            createdAt: "2026-02-01T00:00:00.000Z",
        });
        expect(playerTrainingObservation(engine, training)).toEqual({
            linkedPositions: 1,
            attempts: 1,
            correctAttempts: 1,
            evaluatedAttempts: 1,
            beforeErrors: 1,
            afterErrors: 1,
            beforeAverageLoss: 200,
            afterAverageLoss: 100,
            comparisonAvailable: true,
        });
    });
});
