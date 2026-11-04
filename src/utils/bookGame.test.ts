import { describe, expect, it } from "vitest";
import { garbledRole, openLine, parseMove, tokenize } from "./bookGame";

const INITIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Opens the line through the first move printed as `word` (the n-th one when repeated). */
function open(text: string, word: string, starts = [INITIAL], nth = 0) {
    const tokens = tokenize(text);
    let seen = 0;
    const index = tokens.findIndex(
        (t) => t.kind === "move" && text.slice(t.start, t.end).includes(word) && seen++ === nth,
    );
    if (index < 0) throw new Error(`no move token contains ${word}`);
    const line = openLine(tokens, index, starts);
    return {
        line,
        sans: line?.moves.map((m) => m.san) ?? [],
        clicked: line && line.clicked >= 0 ? line.moves[line.clicked].san : null,
        failed: line?.failure
            ? text.slice(tokens[line.failure.token].start, tokens[line.failure.token].end)
            : null,
    };
}

describe("parseMove", () => {
    it("reads letters, figurines, captures, promotions and castling", () => {
        expect(parseMove("Nxd4+!")).toMatchObject({ piece: "N", capture: true });
        expect(parseMove("♘f3")).toMatchObject({ piece: "♘" });
        expect(parseMove("exd5")).toMatchObject({ piece: "", fromFile: 4, capture: true });
        expect(parseMove("b8Q+")).toMatchObject({ piece: "", promotion: "Q" });
        expect(parseMove("e8=D")).toMatchObject({ promotion: "D" });
        expect(parseMove("0-0-0")).toEqual({ castle: "long" });
        expect(parseMove("O-O")).toEqual({ castle: "short" });
        expect(parseMove("Kc2=")).toMatchObject({ piece: "K" });
        expect(parseMove("Nb2Z")).toMatchObject({ piece: "N" });
    });

    it("reads garbled figurines and OCR ranks", () => {
        expect(parseMove("ttJf3")).toMatchObject({ piece: null, garbled: "ttJ" });
        expect(parseMove("ltlxb3")).toMatchObject({ piece: null, capture: true });
        expect(parseMove("ie4t")).toMatchObject({ piece: null, garbled: "i" });
        expect(parseMove("J:hc8")).toMatchObject({ piece: null, fromFile: 7 });
        expect(parseMove("dS")).toMatchObject({ piece: "" });
    });

    it("ignores words", () => {
        expect(parseMove("the")).toBeNull();
        expect(parseMove("move")).toBeNull();
        expect(parseMove("1948")).toBeNull();
    });

    it("guesses garbled pieces", () => {
        expect(garbledRole("ttJ")).toBe("knight");
        expect(garbledRole("'W")).toBe("queen");
        expect(garbledRole("E!:")).toBe("rook");
        expect(garbledRole(".i")).toBe("bishop");
    });
});

describe("openLine", () => {
    it("plays the main line up to the clicked move and keeps the rest", () => {
        const r = open("1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6", "Nxd4");
        expect(r.sans).toEqual(["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"]);
        expect(r.clicked).toBe("Nxd4");
        expect(r.line?.failure).toBeNull();
    });

    it("follows a variation in parentheses and skips the move it replaces", () => {
        const text = "1.e4 c5 2.Nf3 d6 (2...Nc6 3.d4 cxd4) 3.d4 cxd4 4.Nxd4";
        const inside = open(text, "Nc6");
        expect(inside.sans).toEqual(["e4", "c5", "Nf3", "Nc6", "d4", "cxd4"]);
        expect(inside.clicked).toBe("Nc6");
        const after = open(text, "Nxd4");
        expect(after.sans).toEqual(["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4"]);
    });

    it("reads moves among prose, unnumbered replies and annotation signs", () => {
        const text =
            "1.e4 e5 2.Nf3 Nc6 Other moves are less stubborn: 2...d6 3.d4 is the Philidor. 3.Bb5! a6 4.Ba4 Nf6 5.O-O Be7=";
        const r = open(text, "Ba4");
        expect(r.sans).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7"]);
        const prose = open(text, "d4");
        expect(prose.sans.slice(0, 5)).toEqual(["e4", "e5", "Nf3", "d6", "d4"]);
    });

    it("reads Spanish letters, ellipsis and spaced numbers", () => {
        const r = open("1.e4 e5 2.Cf3 Cc6 3.Ac4 Ac5 4.0-0 Cf6 5 . d3 d6 6.Te1 …Ag4", "Te1");
        expect(r.sans).toEqual([
            "e4",
            "e5",
            "Nf3",
            "Nc6",
            "Bc4",
            "Bc5",
            "O-O",
            "Nf6",
            "d3",
            "d6",
            "Re1",
            "Bg4",
        ]);
        const king = open("1.e4 e5 2.Re2 Re7", "Re7");
        expect(king.sans).toEqual(["e4", "e5", "Ke2", "Ke7"]);
    });

    it("reads garbled figurines when the position leaves no doubt", () => {
        const r = open("1.e4 e5 2.ttJf3 ttJc6 3 . .ib5 a6 4.ixc6 dxc6", "dxc6");
        expect(r.sans).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Bxc6", "dxc6"]);
        expect(r.line?.moves.filter((m) => m.fuzzy).length).toBe(4);
    });

    it("starts from a diagram's position and its move number", () => {
        const fen = "8/8/8/4k3/8/8/4K3/4R3 b - - 0 40";
        const r = open("40...Kd5 41.Kd3 Kc5 42.Re5+", "Kc5", [fen, INITIAL]);
        expect(r.line?.fen).toBe(fen);
        expect(r.sans).toEqual(["Kd5", "Kd3", "Kc5", "Re5+"]);
        expect(r.clicked).toBe("Kc5");
    });

    it("tries the next start when the first one does not fit", () => {
        const wrong = "8/8/8/4k3/8/8/4K3/4R3 b - - 0 2";
        const r = open("1.e4 e5 2.Nf3 Nc6", "Nc6", [wrong, INITIAL]);
        expect(r.line?.fen).toBe(INITIAL);
        expect(r.clicked).toBe("Nc6");
    });

    it("stops at the first impossible move and says which", () => {
        const r = open("1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Bxe5 Nf6", "Nf6");
        expect(r.sans).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);
        expect(r.clicked).toBeNull();
        expect(r.failed).toBe("4.Bxe5".slice(2));
        expect(r.line?.failure?.reason).toBe("illegal");
    });

    it("does not continue past a result or into another game", () => {
        const r = open("1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6 4.Qxf7# 1-0 1.d4 d5 2.c4", "Bc4");
        expect(r.sans).toEqual(["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"]);
    });

    it("treats Everyman's (D) as a diagram mark, not a variation", () => {
        const r = open("1.e4 c6 2.d4 d5 3.Nc3 dxe4 (D) 4.Nxe4 Bf5", "Bf5");
        expect(r.sans).toEqual(["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4", "Bf5"]);
    });
});
