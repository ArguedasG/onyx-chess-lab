import { describe, expect, it } from "vitest";
import { describeTacticsSolution, getPreparedSolutionLine } from "./tacticsSolution";

describe("tactics solution reveal", () => {
    it("uses the first non-empty prepared line as the principal solution", () => {
        expect(getPreparedSolutionLine([[], ["e2e4", "e7e5"], ["d2d4"]])).toEqual(["e2e4", "e7e5"]);
        expect(getPreparedSolutionLine([[]])).toBeNull();
    });

    it("formats a prepared UCI line as SAN from the exercise position", () => {
        expect(
            describeTacticsSolution("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", [
                "e2e4",
                "e7e5",
                "g1f3",
            ]).sanMoves,
        ).toEqual(["e4", "e5", "Nf3"]);
    });

    it("keeps engine SAN when it describes the complete line", () => {
        expect(describeTacticsSolution("invalid", ["a2a4"], ["a4"]).sanMoves).toEqual(["a4"]);
    });
});
