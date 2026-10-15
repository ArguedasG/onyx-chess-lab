import { describe, expect, it } from "vitest";
import { capturedBy, explainMistake, mateFor, mistakeShapes } from "./moveExplanation";

// 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6?? 4. Qxf7#: the position before Black's mistake.
const beforeNf6 = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3";

describe("mistake explanations", () => {
    it("reads mates from White's side for either colour", () => {
        expect(mateFor({ type: "mate", value: 1 }, "white")).toBe(1);
        expect(mateFor({ type: "mate", value: 1 }, "black")).toBeNull();
        expect(mateFor({ type: "mate", value: -3 }, "black")).toBe(3);
        expect(mateFor({ type: "cp", value: 300 }, "white")).toBeNull();
    });

    it("explains a move that allows mate and names the best move", () => {
        const sentences = explainMistake({
            fen: beforeNf6,
            played: { uci: "g8f6", san: "Nf6" },
            color: "black",
            best: { uci: ["g7g6"], san: ["g6"], score: { type: "cp", value: 30 } },
            refutation: { uci: ["h5f7"], san: ["Qxf7#"], score: { type: "mate", value: 1 } },
        });
        expect(sentences).toEqual([
            { key: "Explain.AllowsMate", params: { move: "Nf6", moves: 1, line: "Qxf7#" } },
            { key: "Explain.EvalChange", params: { before: "+0.30", after: "+M1" } },
            { key: "Explain.Best", params: { best: "g6" } },
        ]);
    });

    it("names the piece a reply captures", () => {
        // After 1. e4 d5, White's exd5 captures the pawn on d5.
        const fen = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2";
        expect(capturedBy(fen, "e4d5")).toEqual({ role: "pawn", square: "d5" });
        expect(capturedBy(fen, "g1f3")).toBeNull();
        const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        const sentences = explainMistake({
            fen: start,
            played: { uci: "e2e4", san: "e4" },
            color: "white",
            refutation: { uci: ["d7d5"], san: ["d5"], score: { type: "cp", value: 0 } },
        });
        expect(sentences[0]).toEqual({
            key: "Explain.Allows",
            params: { move: "e4", reply: "d5" },
        });
    });

    it("draws the mistake in red, the best move in green and circles what is lost", () => {
        const shapes = mistakeShapes({
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            played: { uci: "f2f3", san: "f3" },
            color: "white",
            best: { uci: ["e2e4"], san: ["e4"], score: { type: "cp", value: 30 } },
        });
        expect(shapes).toEqual([
            { orig: "f2", dest: "f3", brush: "red" },
            { orig: "e2", dest: "e4", brush: "green" },
        ]);
    });
});
