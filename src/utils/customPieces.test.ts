import { describe, expect, it, vi } from "vitest";

import {
    buildPieceSetCss,
    customPieceSetId,
    customPieceSetIdOf,
    customPieceSetValue,
    isCustomPieceSet,
    matchPieceFiles,
    PIECE_CODES,
} from "./customPieces";

vi.mock("@tauri-apps/plugin-fs", () => ({ BaseDirectory: { AppData: 0 } }));

describe("matchPieceFiles", () => {
    it("recognizes the wP/bK names used by chess.com and Lichess sources", () => {
        const files = PIECE_CODES.map((code) => `${code}.png`);
        const { found, missing } = matchPieceFiles(files);
        expect(missing).toEqual([]);
        expect(found.wP).toBe("wP.png");
        expect(found.bK).toBe("bK.png");
    });

    it("ignores case, separators and the order of color and role", () => {
        const { found } = matchPieceFiles(["White-Pawn.svg", "knight_black.PNG", "wq.webp"]);
        expect(found).toEqual({ wP: "White-Pawn.svg", bN: "knight_black.PNG", wQ: "wq.webp" });
    });

    it("names the missing pieces and skips files that are not images", () => {
        const files = PIECE_CODES.filter((code) => code !== "bQ").map((code) => `${code}.png`);
        const { missing } = matchPieceFiles([...files, "bQ.txt", "readme.md"]);
        expect(missing).toEqual(["bQ"]);
    });

    it("prefers SVG when a piece comes in several formats", () => {
        expect(matchPieceFiles(["wK.png", "wK.svg"]).found.wK).toBe("wK.svg");
    });
});

describe("buildPieceSetCss", () => {
    it("writes one rule per piece with the classes the boards use", () => {
        const images = Object.fromEntries(
            PIECE_CODES.map((code) => [
                code,
                { mime: "image/png", bytes: new Uint8Array([1, 2, 3]) },
            ]),
        ) as Parameters<typeof buildPieceSetCss>[0];
        const css = buildPieceSetCss(images);
        expect(css.split("\n")).toHaveLength(12);
        expect(css).toContain(".pawn.white {background-image:url('data:image/png;base64,AQID')}");
        expect(css).toContain(".king.black {");
    });
});

describe("custom piece set ids", () => {
    it("are stable slugs of the folder name", () => {
        expect(customPieceSetId("Neo Wood")).toBe("neo-wood");
        expect(customPieceSetId("Piezas ñandú")).toBe("piezas-nandu");
        expect(customPieceSetId("***")).toBe("pieces");
    });

    it("round-trip through the stored piece set value", () => {
        const value = customPieceSetValue("neo");
        expect(isCustomPieceSet(value)).toBe(true);
        expect(isCustomPieceSet("maestro")).toBe(false);
        expect(customPieceSetIdOf(value)).toBe("neo");
    });
});
