import { INITIAL_FEN } from "chessops/fen";
import { describe, expect, it } from "vitest";
import {
    afterContinuousLine,
    aggregateMoveProgress,
    hintPiece,
    lineMastery,
    newContinuousSession,
    nextContinuousLine,
    studentPlies,
} from "./openingContinuous";
import { findRepertoireGaps, formatMoveList } from "./repertoireGaps";
import { createEmptyTrainingAreas, type OpeningLine } from "./trainingAreas";

const progress = (attempts: number, successes: number) => ({
    attempts,
    successes,
    failures: attempts - successes,
    totalTimeMs: 0,
    lastAttemptAt: "2026-10-16T00:00:00.000Z",
});

function line(id: string, moves: string[], moveProgress: OpeningLine["moveProgress"] = {}) {
    return {
        id,
        variantId: "v",
        name: id,
        fen: INITIAL_FEN,
        moves,
        path: [],
        plyCount: moves.length,
        trainable: true,
        sourceRecordIndex: null,
        moveProgress,
        session: { attempts: 0, completions: 0, flawless: 0, totalTimeMs: 0 },
        learnedAt: "2026-10-01T00:00:00.000Z",
    } satisfies OpeningLine;
}

function stateWith(lines: OpeningLine[]) {
    const state = createEmptyTrainingAreas().openings;
    return { ...state, lines: Object.fromEntries(lines.map((item) => [item.id, item])) };
}

describe("continuous review", () => {
    const solid = line("solid", ["e2e4", "e7e5", "g1f3"], {
        "0": progress(8, 8),
        "2": progress(8, 8),
    });
    const weak = line("weak", ["e2e4", "c7c5", "g1f3"], {
        "0": progress(8, 8),
        "2": progress(4, 1),
    });

    it("knows which plies are the student's", () => {
        expect(studentPlies(solid, "white")).toEqual([0, 2]);
        expect(studentPlies(solid, "black")).toEqual([1]);
    });

    it("shares the results of a common move across lines", () => {
        const aggregated = aggregateMoveProgress([solid, weak]);
        expect([...aggregated.values()][0]).toEqual({ attempts: 16, successes: 16 });
        expect(lineMastery(weak, aggregated, "white")).toBeLessThan(
            lineMastery(solid, aggregated, "white"),
        );
    });

    it("draws weak lines far more often than mastered ones", () => {
        const state = stateWith([solid, weak]);
        let weakCount = 0;
        for (let index = 0; index < 400; index++) {
            const next = nextContinuousLine(
                state,
                newContinuousSession(["solid", "weak"]),
                "white",
            );
            if (next?.lineId === "weak") weakCount += 1;
        }
        expect(weakCount).toBeGreaterThan(300);
    });

    it("brings a failed line back after two others and avoids immediate repeats", () => {
        const state = stateWith([solid, weak, line("third", ["d2d4"])]);
        let session = newContinuousSession(["solid", "weak", "third"]);
        session = afterContinuousLine(session, "weak", 2);
        expect(nextContinuousLine(state, session, "white", () => 0)?.lineId).not.toBe("weak");
        session = afterContinuousLine(afterContinuousLine(session, "solid", 0), "third", 0);
        const next = nextContinuousLine(state, session, "white");
        expect(next?.lineId).toBe("weak");
        expect(next?.session.comeback).toHaveLength(0);
        expect(session.clean).toBe(2);
    });

    it("hints the piece, not the move", () => {
        expect(hintPiece("Nf3")).toBe("knight");
        expect(hintPiece("O-O-O")).toBe("king");
        expect(hintPiece("exd5")).toBe("pawn");
    });
});

describe("repertoire gaps", () => {
    const repertoire = [
        { fen: INITIAL_FEN, moves: ["e2e4", "e7e5", "g1f3"] },
        { fen: INITIAL_FEN, moves: ["e2e4", "c7c5", "g1f3"] },
    ];
    const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const stats = (fen: string) =>
        Promise.resolve(
            fen === afterE4
                ? {
                      games: 1000,
                      moves: [
                          {
                              uci: "c7c5",
                              san: "c5",
                              games: 400,
                              white: 150,
                              draws: 100,
                              black: 150,
                          },
                          { uci: "e7e5", san: "e5", games: 300, white: 120, draws: 80, black: 100 },
                          { uci: "e7e6", san: "e6", games: 200, white: 80, draws: 60, black: 60 },
                          { uci: "a7a6", san: "a6", games: 10, white: 6, draws: 2, black: 2 },
                      ],
                  }
                : null,
        );

    it("lists uncovered replies weighted by how often they appear", async () => {
        const gaps = await findRepertoireGaps(repertoire, stats, {
            color: "white",
            minShare: 0.05,
            minGames: 5,
            maxPositions: 50,
        });
        expect(gaps.map((gap) => gap.move.san)).toEqual(["e6"]);
        expect(gaps[0].share).toBeCloseTo(0.2);
        expect(gaps[0].weight).toBeCloseTo(0.2);
        expect(formatMoveList(INITIAL_FEN, gaps[0].sans, gaps[0].move.san)).toBe("1.e4 e6");
    });

    it("does not report where a line simply ends", async () => {
        const gaps = await findRepertoireGaps([{ fen: INITIAL_FEN, moves: ["e2e4"] }], stats, {
            color: "white",
            minShare: 0.05,
            minGames: 5,
            maxPositions: 50,
        });
        expect(gaps).toEqual([]);
    });
});
