import { afterEach, describe, expect, it, vi } from "vitest";
import { commands } from "@/bindings";
import { MAX_PASTED_PGN_RECORDS, parseStudyPgnText, splitPgnTextRecords } from "./studyImport";

function mockLexer() {
    return vi.spyOn(commands, "lexPgn").mockImplementation(async (pgn) => {
        if (pgn.includes("Broken")) return { status: "ok", data: [] };
        const event = /\[Event "([^"]+)"\]/.exec(pgn)?.[1] ?? "?";
        const queenPawn = pgn.includes("d4");
        return {
            status: "ok",
            data: [
                { type: "Header", value: { tag: "Event", value: event } },
                { type: "San", value: queenPawn ? "d4" : "e4" },
                { type: "San", value: queenPawn ? "d5" : "e5" },
                { type: "Outcome", value: "*" },
            ],
        } as Awaited<ReturnType<typeof commands.lexPgn>>;
    });
}

afterEach(() => vi.restoreAllMocks());

describe("pasted study PGN", () => {
    it("splits standard multi-game PGN text and creates one chapter per game", async () => {
        mockLexer();
        const raw = `[Event "First"]\n\n1. e4 e5 *\n\n[Event "Second"]\n\n1. d4 d5 *`;
        expect(splitPgnTextRecords(raw)).toHaveLength(2);

        const chapters = await parseStudyPgnText(raw);
        expect(chapters.map((chapter) => chapter.title)).toEqual(["First", "Second"]);
        expect(chapters[1].pgn).toContain("1. d4 d5");
    });

    it("identifies the invalid record instead of importing a partial batch", async () => {
        mockLexer();
        const raw = `[Event "First"]\n\n1. e4 e5 *\n\n[Event "Broken"]\n\nnot a game`;

        await expect(parseStudyPgnText(raw)).rejects.toMatchObject({
            code: "invalid",
            recordNumber: 2,
        });
    });

    it("rejects an excessive pasted batch before parsing it", async () => {
        const raw = Array.from(
            { length: MAX_PASTED_PGN_RECORDS + 1 },
            (_, index) => `[Event "${index}"]\n\n1. e4 *`,
        ).join("\n\n");

        await expect(parseStudyPgnText(raw)).rejects.toMatchObject({
            code: "tooMany",
        });
    });
});
