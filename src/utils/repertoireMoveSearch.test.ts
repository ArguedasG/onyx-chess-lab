import { describe, expect, it } from "vitest";
import { normalizeSearchMove, searchRecord } from "./repertoireMoveSearch";

const RUY = '[Event "Ruy"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4 Bc5 4. Bb5) a6 4. Ba4 *';

describe("repertoire move search", () => {
    it("normalizes what the user types", () => {
        expect(normalizeSearchMove(" Bb5+ ")).toBe("Bb5");
        expect(normalizeSearchMove("0-0#")).toBe("O-O");
        expect(normalizeSearchMove("Nf3!?")).toBe("Nf3");
    });

    it("finds the move in the main line and in variations", () => {
        const hits = searchRecord(RUY, "Bb5", "both");
        expect(hits.map((hit) => hit.line)).toEqual([
            "1.e4 e5 2.Nf3 Nc6 3.Bb5",
            "1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.Bb5",
        ]);
        expect(hits[0].path).toEqual([0, 0, 0, 0, 0]);
        expect(hits[1].path).toEqual([0, 0, 0, 0, 1, 0, 0]);
    });

    it("ignores the check sign of the written move", () => {
        const [hit] = searchRecord("1. e4 f6 2. d4 g5 3. Qh5# *", "Qh5", "white");
        expect(hit.line).toBe("1.e4 f6 2.d4 g5 3.Qh5#");
    });

    it("filters by the side that plays the move", () => {
        expect(searchRecord(RUY, "Bb5", "black")).toEqual([]);
        expect(searchRecord(RUY, "Nc6", "black")).toHaveLength(1);
        expect(searchRecord(RUY, "Nc6", "white")).toEqual([]);
    });

    it("is exact: a capture is a different move", () => {
        expect(searchRecord("1. e4 d5 2. exd5 *", "d5", "both")).toHaveLength(1);
        expect(searchRecord("1. e4 d5 2. exd5 *", "exd5", "white")).toHaveLength(1);
    });

    it("marks hits on a trained line and numbers moves from a FEN", () => {
        const trained = new Set(["e2e4", "e2e4 e7e5"]);
        const [hit] = searchRecord("1. e4 e5 *", "e5", "both", trained);
        expect(hit.trained).toBe(true);
        const fen =
            '[FEN "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"]\n\n2. Nf3 *';
        expect(searchRecord(fen, "Nf3", "white")[0].line).toBe("2.Nf3");
    });
});

describe("repertoire index", () => {
    it("assigns records by their section header, else by index", async () => {
        const { indexRepertoireRecords, searchRepertoireIndex } =
            await import("./repertoireMoveSearch");
        const variant = (id: string, trainingRecordIndex: number) => ({
            id,
            repertoireId: "r",
            name: id,
            lineIds: [],
            sourceRecordIndex: trainingRecordIndex,
            trainingRecordIndex,
            contentType: "theory" as const,
            commentCount: 0,
            hasVariations: false,
        });
        const openings = {
            repertoires: { r: { id: "r", variantIds: ["a", "b"] } },
            variants: { a: variant("a", 0), b: variant("b", 1) },
            lines: {},
        } as never;
        const records = ["1. d4 *", '[ChessLabVariantId "b"]\n\n1. e4 *'];
        const index = indexRepertoireRecords(records, "r", openings);
        expect(searchRepertoireIndex(index, "e4", "both").map((s) => s.variant.id)).toEqual(["b"]);
        expect(searchRepertoireIndex(index, "d4", "both").map((s) => s.variant.id)).toEqual(["a"]);
    });
});
