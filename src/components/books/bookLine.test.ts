import { describe, expect, it } from "vitest";
import { openLine } from "@/utils/bookGame";
import { moveAt, textWindow, tokenBox } from "./bookLine";

// One line of text on page 3: each character 5 units wide, baseline at y = 100.
const run = (str: string, x = 50) => ({ str, x, y: 100, width: 5 * str.length, height: 10 });
const w = textWindow([{ page: 3, runs: [run("1.e4 c5 2.Nf3 d6 3.d4")] }]);

describe("bookLine", () => {
    it("finds the move under the pointer, or the move after its number", () => {
        // "Nf3" starts at character 10: x = 50 + 10 * 5.
        const at = moveAt(w, 3, 50 + 11 * 5, 103);
        expect(at).not.toBeNull();
        expect(w.text.slice(w.tokens[at!].start, w.tokens[at!].end)).toBe("Nf3");
        const number = moveAt(w, 3, 50 + 8 * 5 + 1, 103);
        expect(number).toBe(at);
        expect(moveAt(w, 3, 50 + 11 * 5, 200)).toBeNull();
        expect(moveAt(w, 4, 50 + 11 * 5, 103)).toBeNull();
    });

    it("boxes a token on its page and opens its line", () => {
        const at = moveAt(w, 3, 50 + 11 * 5, 103)!;
        expect(tokenBox(w, at)).toEqual({ page: 3, box: [100, 97.5, 115, 110] });
        const line = openLine(w.tokens, at, [
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        ]);
        expect(line?.moves.map((m) => m.san)).toEqual(["e4", "c5", "Nf3", "d6", "d4"]);
        expect(line?.clicked).toBe(2);
    });
});
