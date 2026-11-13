import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type Token } from "@/bindings";
import { normalizeAnnotations } from "./annotation";
import { getPGN, parsePGN } from "./chess";
import { mergeRepertoireTree } from "./repertoireAddition";

/**
 * The movetext rules of pgn-reader 0.26 that matter for glyphs: "!" and "?" pairs become NAGs
 * wherever they appear, and stray characters such as "," are skipped.
 */
function lexMovetext(pgn: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    while (i < pgn.length) {
        const rest = pgn.slice(i);
        const outcome = /^(1-0|0-1|1\/2-1\/2|\*)/.exec(rest);
        const glyph = /^(!!|!\?|\?!|\?\?|!|\?)/.exec(rest);
        const nag = /^\$(\d+)/.exec(rest);
        if (outcome) {
            tokens.push({ type: "Outcome", value: outcome[1] });
            i += outcome[1].length;
        } else if (glyph) {
            const value = { "!": 1, "?": 2, "!!": 3, "??": 4, "!?": 5, "?!": 6 }[glyph[1]];
            tokens.push({ type: "Nag", value: `$${value}` });
            i += glyph[1].length;
        } else if (nag) {
            tokens.push({ type: "Nag", value: `$${nag[1]}` });
            i += nag[0].length;
        } else if (rest[0] === "(" || rest[0] === ")") {
            tokens.push({ type: rest[0] === "(" ? "ParenOpen" : "ParenClose" });
            i += 1;
        } else if (/[A-Za-z]/.test(rest[0])) {
            const san = /^[^\s!?$(){}.,]+/.exec(rest)![0];
            tokens.push({ type: "San", value: san });
            i += san.length;
        } else {
            i += 1;
        }
    }
    return tokens;
}

function movetext(root: Awaited<ReturnType<typeof parsePGN>>["root"]) {
    return getPGN(root, {
        headers: null,
        glyphs: true,
        comments: false,
        variations: true,
        extraMarkups: false,
    });
}

beforeEach(() => {
    vi.spyOn(commands, "lexPgn").mockImplementation(async (pgn) => ({
        status: "ok",
        data: lexMovetext(pgn),
    }));
});

afterEach(() => vi.restoreAllMocks());

describe("move annotations", () => {
    it("keep one annotation per group, without blanks or repeats, in NAG order", () => {
        expect(normalizeAnnotations(["±", "!", "", "!", "?!", "N", "+-"])).toEqual(["!", "±", "N"]);
    });

    it("write the move glyph after the move and every other annotation as a NAG", async () => {
        const tree = await parsePGN("1. d4 Nf6 *");
        tree.root.children[0].annotations = ["!", "?!", "±"];

        expect(movetext(tree.root)).toBe("1. d4! $6 $16 Nf6");
    });

    it("stay the same size however many times a PGN is saved and read back", async () => {
        let pgn = "1. d4! $16 (1. c4!? $6) 1... Nf6?! 2. c4 *";
        const sizes: number[] = [];
        for (let round = 0; round < 6; round++) {
            pgn = movetext((await parsePGN(pgn)).root);
            sizes.push(pgn.length);
        }

        expect(new Set(sizes).size).toBe(1);
        // "c4!? $6" keeps only its first move glyph.
        expect(pgn).toBe("1. d4! $16  (1. c4!?  ) Nf6?! 2. c4");
    });

    it("repair a PGN whose glyphs were multiplied by earlier saves", async () => {
        const tree = await parsePGN("1. d4!,!,?!!,!,?!!,!,?! Nf6 *");

        expect(tree.root.children[0].annotations).toEqual(["!"]);
        expect(movetext(tree.root)).toBe("1. d4! Nf6");
    });

    it("keep the existing move glyph when merging lines that annotate a move differently", async () => {
        const target = await parsePGN("1. d4! Nf6 *");
        const source = await parsePGN("1. d4?! $16 d5 *");

        const merged = mergeRepertoireTree(target.root, source.root);

        expect(merged.children[0].annotations).toEqual(["!", "±"]);
    });
});
