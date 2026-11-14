import { describe, expect, it } from "vitest";
import { buildReviewLines, formatLineScore, numberedMoves, positionAfter } from "./reviewLines";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("mistake review lines", () => {
    it("show the student's move, the engine's line and the punished game move", () => {
        const lines = buildReviewLines({
            played: { uci: "f2f3", san: "f3" },
            attempt: { uci: ["d2d4", "d7d5"], san: ["d4", "d5"], score: { type: "cp", value: 20 } },
            best: {
                uci: "e2e4",
                san: "e4",
                score: { type: "cp", value: 30 },
                line: {
                    uci: ["e2e4", "e7e5"],
                    san: ["e4", "e5"],
                    score: { type: "cp", value: 30 },
                },
            },
            refutation: { uci: ["e7e5"], san: ["e5"], score: { type: "cp", value: -20 } },
        });

        expect(lines.map((line) => [line.kind, line.san.join(" ")])).toEqual([
            ["attempt", "d4 d5"],
            ["best", "e4 e5"],
            ["game", "f3 e5"],
        ]);
    });

    it("show the engine's line once when the student found its move", () => {
        const lines = buildReviewLines({
            played: { uci: "f2f3", san: "f3" },
            attempt: { uci: ["e2e4"], san: ["e4"], score: { type: "cp", value: 30 } },
            best: { uci: "e2e4", san: "e4", score: { type: "cp", value: 30 } },
        });

        expect(lines.map((line) => line.kind)).toEqual(["best", "game"]);
        expect(lines[1].score).toBeNull();
    });

    it("step through a line on the board", () => {
        expect(positionAfter(START, ["e2e4", "e7e5"], 0)).toEqual({ fen: START, turn: "white" });
        const after = positionAfter(START, ["e2e4", "e7e5"], 1);
        expect(after.fen.startsWith("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b")).toBe(true);
        expect(after.turn).toBe("black");
        expect(after.lastMove).toEqual(["e2", "e4"]);
    });

    it("number the moves from the position of the exercise", () => {
        expect(numberedMoves("8/8/8/8/8/8/8/K6k b - - 0 12", ["Kg1", "Ka2", "Kf1"])).toEqual([
            "12... Kg1",
            "13. Ka2",
            "Kf1",
        ]);
        expect(formatLineScore({ type: "mate", value: 0 })).toBe("#");
        expect(formatLineScore({ type: "cp", value: 757 })).toBe("+7.57");
    });
});
