import { describe, expect, it } from "vitest";
import { findPgnUsages, normalizeFilePath, samePath } from "./pgnUsage";
import type { StudyLibrary } from "./studies";
import type { TrainingAreasState } from "./trainingAreas";

function areas(): Pick<TrainingAreasState, "openings" | "tactics"> {
    return {
        openings: {
            repertoires: {
                cat: {
                    id: "cat",
                    name: "Catalan",
                    path: "C:\\Docs\\Catalan - Editable.pgn",
                    sourcePath: "C:\\Downloads\\catalan.pgn",
                    imports: [{ source: "C:/Docs/extra.pgn" }],
                },
                slav: {
                    id: "slav",
                    name: "Slav",
                    path: "C:\\Docs\\Slav - Editable.pgn",
                    sourcePath: "C:\\Docs\\Catalan - Editable.pgn",
                },
            },
        },
        tactics: {
            sets: {
                forks: {
                    id: "forks",
                    name: "Forks",
                    source: { kind: "pgnFile", path: "C:\\Docs\\extra.pgn" },
                },
                embedded: { id: "embedded", name: "Bundled", source: { kind: "embedded" } },
            },
        },
    } as unknown as Pick<TrainingAreasState, "openings" | "tactics">;
}

const studies = {
    studyOrder: ["s1", "missing"],
    studies: {
        s1: {
            id: "s1",
            name: "Model games",
            chapters: {
                a: { source: { kind: "file", label: "c:/docs/EXTRA.pgn" } },
                b: { source: { kind: "file", label: "C:\\Docs\\extra.pgn" } },
                c: { source: { kind: "board", label: "C:\\Docs\\extra.pgn" } },
            },
        },
    },
} as unknown as StudyLibrary;

describe("pgn usage", () => {
    it("normalizes separators, trailing slashes and case", () => {
        expect(normalizeFilePath("C:\\Docs\\A.pgn ")).toBe("c:/docs/a.pgn");
        expect(samePath("C:\\Docs\\", "c:/docs")).toBe(true);
        expect(samePath("", "")).toBe(false);
        expect(samePath(undefined, "a.pgn")).toBe(false);
    });

    it("reports the strongest repertoire relation for each repertoire", () => {
        expect(findPgnUsages("c:/docs/catalan - editable.pgn", areas())).toEqual([
            { kind: "repertoire", role: "editable", id: "cat", name: "Catalan" },
            { kind: "repertoire", role: "source", id: "slav", name: "Slav" },
        ]);
    });

    it("finds imports, tactics sets and study chapters taken from the file", () => {
        expect(findPgnUsages("C:\\Docs\\extra.pgn", areas(), studies)).toEqual([
            { kind: "repertoire", role: "imported", id: "cat", name: "Catalan" },
            { kind: "tactics", id: "forks", name: "Forks" },
            { kind: "study", id: "s1", name: "Model games", chapters: 2 },
        ]);
    });

    it("returns nothing for an unrelated file", () => {
        expect(findPgnUsages("C:\\Docs\\other.pgn", areas(), studies)).toEqual([]);
    });
});
