import { describe, expect, it } from "vitest";
import { splitPgnTextRecords } from "./studyImport";
import { decodePgnBytes, normalizePgnLineEndings } from "./pgnText";

describe("decodePgnBytes", () => {
    it("keeps UTF-8 text and strips the BOM", () => {
        const bom = String.fromCharCode(0xfeff);
        const bytes = new TextEncoder().encode(`${bom}[Event "Grünfeld"]\r\n\r\n1. d4 *`);
        expect(decodePgnBytes(bytes)).toBe('[Event "Grünfeld"]\n\n1. d4 *');
    });

    it("falls back to Windows-1252 and classic Mac line endings", () => {
        const bytes = Uint8Array.from([
            ...new TextEncoder().encode('[Event "Gr'),
            0xfc,
            ...new TextEncoder().encode('nfeld"]\r\r{'),
            0x93,
            ...new TextEncoder().encode("quoted"),
            0x94,
            ...new TextEncoder().encode("} 1. d4 *\r"),
        ]);
        expect(decodePgnBytes(bytes)).toBe('[Event "Grünfeld"]\n\n{“quoted”} 1. d4 *\n');
    });
});

describe("splitting records with CR-only line endings", () => {
    it("finds every game instead of merging them into one line", () => {
        const raw = '[Event "A"]\r\r1. d4 *\r\r[Event "B"]\r\r1. c4 *\r';
        expect(splitPgnTextRecords(raw)).toEqual([
            '[Event "A"]\n\n1. d4 *',
            '[Event "B"]\n\n1. c4 *',
        ]);
        expect(normalizePgnLineEndings("a\r\nb\rc\n")).toBe("a\nb\nc\n");
    });
});
