import { describe, expect, it } from "vitest";
import {
    createOpeningImportDraft,
    draftToImportGroups,
    excludeDraftSection,
    mergeDraftSections,
    moveDraftRecord,
    moveDraftSection,
    renameDraftRecord,
    restoreDraftRecord,
    updateDraftSection,
} from "./openingImportDraft";
import type { OpeningPgnSample } from "./openingTraining";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function sample(
    index: number,
    name: string,
    extra: Partial<OpeningPgnSample> = {},
): OpeningPgnSample {
    return {
        index,
        name,
        startingFen: START,
        lineCount: 1,
        commentCount: 0,
        hasVariations: false,
        contentType: "theory",
        ...extra,
    };
}

const inspection = {
    filename: "course.pgn",
    samples: [
        sample(0, "Slav line one", { chessableGroupName: "Slav" }),
        sample(1, "Slav line two", { chessableGroupName: "Slav", lineCount: 3 }),
        sample(2, "QGA line", { chessableGroupName: "QGA" }),
        sample(3, "Custom line", { startingFen: "custom-fen", chapterName: "Custom" }),
        sample(4, "Broken", { error: "Invalid PGN" }),
        sample(5, "Custom line two", { startingFen: "custom-fen", chapterName: "Custom" }),
    ],
};

describe("opening import draft", () => {
    it("starts from the automatic grouping", () => {
        const draft = createOpeningImportDraft(inspection, "smart");
        expect(draft.sections.map((section) => [section.name, section.recordIndexes])).toEqual([
            ["Slav", [0, 1]],
            ["QGA", [2]],
            ["Custom", [3, 5]],
        ]);
        expect(draft.excluded).toEqual([]);
    });

    it("leaves puzzles out by default in smart mode only", () => {
        const withPuzzle = {
            ...inspection,
            samples: [
                ...inspection.samples,
                sample(6, "Fantastic shot!", { startingFen: "puzzle" }),
            ],
        };
        const draft = createOpeningImportDraft(withPuzzle, "smart");
        expect(draft.excluded).toEqual([6]);
        expect(
            draftToImportGroups(withPuzzle, draft).flatMap((g) => g.recordIndexes),
        ).not.toContain(6);

        const restored = restoreDraftRecord(withPuzzle, draft, 6);
        expect(restored.sections.at(-1)).toMatchObject({ recordIndexes: [6] });
        expect(createOpeningImportDraft(withPuzzle, "records").excluded).toEqual([]);
    });

    it("moves a record between compatible sections at the requested position", () => {
        const draft = createOpeningImportDraft(inspection, "smart");
        const qga = draft.sections[1].key;
        const next = moveDraftRecord(inspection, draft, 1, { kind: "section", key: qga, index: 0 });

        expect(next?.sections[0].recordIndexes).toEqual([0]);
        expect(next?.sections[1].recordIndexes).toEqual([1, 2]);
    });

    it("reorders a record inside its own section", () => {
        const draft = createOpeningImportDraft(inspection, "smart");
        const slav = draft.sections[0].key;
        const next = moveDraftRecord(inspection, draft, 0, {
            kind: "section",
            key: slav,
            index: 1,
        });
        expect(next?.sections[0].recordIndexes).toEqual([1, 0]);
    });

    it("refuses to merge records with different starting positions", () => {
        const draft = createOpeningImportDraft(inspection, "smart");
        const slav = draft.sections[0].key;
        expect(
            moveDraftRecord(inspection, draft, 3, { kind: "section", key: slav, index: 0 }),
        ).toBeNull();
        expect(mergeDraftSections(draft, draft.sections[2].key, slav)).toBeNull();
    });

    it("creates a new section after the origin section", () => {
        const draft = createOpeningImportDraft(inspection, "smart");
        const next = moveDraftRecord(inspection, draft, 1, {
            kind: "newSection",
            name: "Slav 4.e3",
        });
        expect(next?.sections.map((section) => section.name)).toEqual([
            "Slav",
            "Slav 4.e3",
            "QGA",
            "Custom",
        ]);
        expect(next?.sections[1]).toMatchObject({ key: "custom:1", recordIndexes: [1] });
    });

    it("excludes records and restores them to their previous section", () => {
        const draft = createOpeningImportDraft(inspection, "smart");
        const excluded = moveDraftRecord(inspection, draft, 0, { kind: "excluded" })!;
        expect(excluded.excluded).toEqual([0]);
        expect(draftToImportGroups(inspection, excluded)[0].recordIndexes).toEqual([1]);

        const restored = restoreDraftRecord(inspection, excluded, 0);
        expect(restored.excluded).toEqual([]);
        expect(restored.sections[0].recordIndexes).toEqual([1, 0]);
    });

    it("converts edits into import groups without empty sections", () => {
        let draft = createOpeningImportDraft(inspection, "smart");
        draft = moveDraftRecord(inspection, draft, 2, {
            kind: "section",
            key: draft.sections[0].key,
            index: 2,
        })!;
        draft = updateDraftSection(draft, draft.sections[0].key, {
            name: "Queen's Gambit",
            contentType: "modelGame",
        });
        draft = moveDraftSection(draft, 2, 0);
        draft = renameDraftRecord(draft, 1, "  Main line ");

        const groups = draftToImportGroups(inspection, draft);
        expect(groups.map((group) => [group.name, group.recordIndexes])).toEqual([
            ["Custom", [3, 5]],
            ["Queen's Gambit", [0, 1, 2]],
        ]);
        expect(groups[1]).toMatchObject({ lineCount: 5, contentType: "modelGame" });
        expect(draft.recordNames).toEqual({ 1: "Main line" });
    });

    it("keeps duplicate section names distinguishable and falls back from blank names", () => {
        let draft = createOpeningImportDraft(inspection, "records");
        draft = updateDraftSection(draft, draft.sections[0].key, { name: "Slav" });
        draft = updateDraftSection(draft, draft.sections[1].key, { name: "slav" });
        draft = updateDraftSection(draft, draft.sections[2].key, { name: "   " });

        expect(draftToImportGroups(inspection, draft).map((group) => group.name)).toEqual([
            "Slav",
            "slav (2)",
            "QGA line",
            "Custom line",
            "Custom line two",
        ]);
    });
    it("excludes a whole section and restores its records into it", () => {
        const draft = createOpeningImportDraft(inspection, "smart");
        const slav = draft.sections[0];
        const excluded = excludeDraftSection(draft, slav.key);
        expect(excluded.excluded).toEqual([0, 1]);
        expect(draftToImportGroups(inspection, excluded).map((group) => group.name)).toEqual([
            "QGA",
            "Custom",
        ]);

        const restored = restoreDraftRecord(inspection, excluded, 1);
        expect(restored.sections[0]).toMatchObject({ name: "Slav", recordIndexes: [1] });
        expect(restored.excluded).toEqual([0]);
    });
});
