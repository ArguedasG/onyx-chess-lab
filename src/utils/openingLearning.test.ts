import { describe, expect, it } from "vitest";
import {
    getOpeningLearningSummary,
    hasLearnAnnotations,
    isOpeningLineLearned,
    learnedOpeningPrefixLength,
    markOpeningLineLearned,
    openingLearnBatchSize,
    openingLearnStartPly,
    trainableOpeningLines,
} from "./openingLearning";
import { createEmptyTrainingAreas, type OpeningLine, type OpeningsState } from "./trainingAreas";

function line(id: string, moves: string[], extra: Partial<OpeningLine> = {}): OpeningLine {
    return {
        id,
        variantId: "v1",
        name: id,
        fen: "start",
        moves,
        path: moves.map(() => 0),
        plyCount: moves.length,
        trainable: true,
        sourceRecordIndex: null,
        moveProgress: {},
        session: { attempts: 0, completions: 0, flawless: 0, totalTimeMs: 0 },
        ...extra,
    };
}

function state(lines: OpeningLine[]): OpeningsState {
    const base = createEmptyTrainingAreas().openings;
    return {
        ...base,
        repertoires: {
            r1: {
                id: "r1",
                name: "Repertoire",
                color: "white",
                description: "",
                path: "r1.pgn",
                sourcePath: "r1.pgn",
                recordCount: 1,
                variantIds: ["v1", "v2"],
                acceptanceThresholdCp: 30,
                subvariationPolicy: "all",
                createdAt: "2026-01-01",
                updatedAt: "2026-01-01",
            },
        },
        variants: {
            v1: {
                id: "v1",
                repertoireId: "r1",
                name: "Theory",
                lineIds: lines.filter((l) => l.variantId === "v1").map((l) => l.id),
                sourceRecordIndex: 0,
                trainingRecordIndex: 0,
                contentType: "theory",
                commentCount: 0,
                hasVariations: true,
            },
            v2: {
                id: "v2",
                repertoireId: "r1",
                name: "Games",
                lineIds: lines.filter((l) => l.variantId === "v2").map((l) => l.id),
                sourceRecordIndex: 1,
                trainingRecordIndex: 1,
                contentType: "modelGame",
                commentCount: 0,
                hasVariations: false,
            },
        },
        lines: Object.fromEntries(lines.map((l) => [l.id, l])),
    };
}

describe("opening learning", () => {
    it("treats lines completed before Learn mode existed as learned", () => {
        expect(isOpeningLineLearned(line("a", ["e2e4"]))).toBe(false);
        expect(isOpeningLineLearned(line("a", ["e2e4"], { learnedAt: "2026-09-26" }))).toBe(true);
        expect(
            isOpeningLineLearned(
                line("a", ["e2e4"], {
                    session: { attempts: 1, completions: 1, flawless: 0, totalTimeMs: 0 },
                }),
            ),
        ).toBe(true);
    });

    it("marks a line once and keeps the first learning date", () => {
        const initial = state([line("a", ["e2e4"])]);
        const learned = markOpeningLineLearned(initial, "a", "2026-09-26T10:00:00.000Z");
        expect(learned.lines.a.learnedAt).toBe("2026-09-26T10:00:00.000Z");
        expect(markOpeningLineLearned(learned, "a", "2027-01-01T00:00:00.000Z")).toBe(learned);
    });

    it("summarizes trainable theory lines in repertoire order", () => {
        const current = state([
            line("a", ["e2e4"], { learnedAt: "2026-09-26" }),
            line("b", ["d2d4"]),
            line("c", ["c2c4"], { trainable: false }),
            line("d", ["g1f3"]),
            line("game", ["e2e4", "e7e5"], { variantId: "v2" }),
        ]);
        const lines = trainableOpeningLines(current, ["v1", "v2"]);
        expect(lines.map((l) => l.id)).toEqual(["a", "b", "d"]);
        const summary = getOpeningLearningSummary(lines);
        expect(summary).toMatchObject({ learned: 1, total: 3 });
        expect(summary.pending.map((l) => l.id)).toEqual(["b", "d"]);
        expect(openingLearnBatchSize(current)).toBe(5);
    });

    it("finds the prefix already covered by learned lines of the repertoire", () => {
        const current = state([
            line("known", ["e2e4", "e7e5", "g1f3", "b8c6"], { learnedAt: "2026-09-26" }),
            line("new", ["e2e4", "e7e5", "g1f3", "g8f6", "f3e5"]),
            line("unlearned", ["e2e4", "e7e5", "g1f3", "g8f6", "d2d4"]),
            line("other-start", ["e2e4", "e7e5", "g1f3", "g8f6"], {
                fen: "other",
                learnedAt: "2026-09-26",
            }),
        ]);
        expect(learnedOpeningPrefixLength(current, current.lines.new)).toBe(3);
    });

    it("always leaves at least one student move to learn", () => {
        const whiteMoves = (ply: number) => ply % 2 === 0;
        expect(openingLearnStartPly(3, 6, whiteMoves)).toBe(3);
        // Only a black reply remains after ply 5, so the start moves back to White's last move.
        expect(openingLearnStartPly(5, 6, whiteMoves)).toBe(4);
        expect(openingLearnStartPly(6, 6, whiteMoves)).toBe(4);
        expect(openingLearnStartPly(0, 6, whiteMoves)).toBe(0);
    });

    it("pauses guided learning only on commented or drawn moves", () => {
        expect(hasLearnAnnotations({ comment: "", shapes: [] })).toBe(false);
        expect(hasLearnAnnotations({ comment: "  \n ", shapes: [] })).toBe(false);
        expect(hasLearnAnnotations({ comment: "Controls d5", shapes: [] })).toBe(true);
        expect(hasLearnAnnotations({ comment: "", shapes: [{ orig: "e2", brush: "green" }] })).toBe(
            true,
        );
    });
});
