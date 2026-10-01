import { describe, expect, it, vi } from "vitest";
import { Chess } from "chessops/chess";
import { INITIAL_FEN, makeFen } from "chessops/fen";
import { parseSan } from "chessops/san";

vi.mock("i18next", () => ({
    default: {
        t: (_key: string, fallback: string, values: Record<string, unknown> = {}) =>
            fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values[name])),
    },
}));
import {
    buildOpeningFlatPgn,
    consolidateOpeningSections,
    extractOpeningImportLines,
    getOpeningConsolidationGroups,
    getOpeningImportGroupPreviews,
    getOpeningImportSuggestedExclusions,
    mergeImportedOpeningTrees,
    previewOpeningTrainingSync,
    type OpeningPgnSample,
} from "./openingTraining";
import { addOpeningRepertoire, createEmptyTrainingAreas } from "./trainingAreas";
import { createNode, defaultTree, type TreeNode } from "./treeReducer";

function lineTree(sans: string[]): TreeNode {
    const root = defaultTree().root;
    const position = Chess.default();
    let node = root;
    for (const san of sans) {
        const move = parseSan(position, san);
        if (!move) throw new Error(`Invalid test move: ${san}`);
        position.play(move);
        const child = createNode({
            fen: makeFen(position.toSetup()),
            move,
            san,
            halfMoves: node.halfMoves + 1,
        });
        node.children.push(child);
        node = child;
    }
    return root;
}

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

describe("opening import grouping", () => {
    it("groups Chessable records with the same normalized chapter label", () => {
        const groups = getOpeningImportGroupPreviews(
            {
                filename: "black-repertoire.pgn",
                samples: [
                    sample(0, "2) Slav — line one", { chessableGroupName: "Slav" }),
                    sample(1, "12) Slav — line two", { chessableGroupName: "Slav" }),
                    sample(2, "3) QGA — line one", { chessableGroupName: "QGA" }),
                ],
            },
            "smart",
        );

        expect(groups).toHaveLength(2);
        expect(groups[0]).toMatchObject({ name: "Slav", recordIndexes: [0, 1], lineCount: 2 });
        expect(groups[1]).toMatchObject({ name: "QGA", recordIndexes: [2] });
    });

    it("never merges records with incompatible starting positions", () => {
        const groups = getOpeningImportGroupPreviews(
            {
                filename: "repertoire.pgn",
                samples: [
                    sample(0, "French one", { chapterName: "French", startingFen: "fen-a" }),
                    sample(1, "French two", { chapterName: "French", startingFen: "fen-b" }),
                ],
            },
            "records",
        );

        expect(groups).toHaveLength(2);
        expect(groups.map((group) => group.name)).toEqual(["French one", "French two"]);

        const shared = getOpeningImportGroupPreviews(
            {
                filename: "repertoire.pgn",
                samples: [
                    sample(0, "French one", { chapterName: "French", startingFen: "fen-a" }),
                    sample(1, "French two", { chapterName: "French", startingFen: "fen-b" }),
                    sample(2, "French three", { chapterName: "French", startingFen: "fen-a" }),
                    sample(3, "French four", { chapterName: "French", startingFen: "fen-b" }),
                ],
            },
            "smart",
        );
        expect(shared.map((group) => [group.name, group.recordIndexes])).toEqual([
            ["French", [0, 2]],
            ["French (2)", [1, 3]],
        ]);
    });

    it("keeps the legacy record mode and combines compatible theory in single mode", () => {
        const inspection = {
            filename: "my-repertoire.pgn",
            samples: [sample(0, "First"), sample(1, "Second")],
        };

        expect(getOpeningImportGroupPreviews(inspection, "records")).toHaveLength(2);
        expect(getOpeningImportGroupPreviews(inspection, "single")).toEqual([
            expect.objectContaining({
                name: "my-repertoire",
                recordIndexes: [0, 1],
                lineCount: 2,
            }),
        ]);
    });

    it("keeps model games separate even when theory is combined", () => {
        const groups = getOpeningImportGroupPreviews(
            {
                filename: "mixed.pgn",
                samples: [
                    sample(0, "Theory"),
                    sample(1, "Game one", { contentType: "modelGame" }),
                    sample(2, "Game two", { contentType: "modelGame" }),
                ],
            },
            "single",
        );

        expect(groups).toHaveLength(3);
        expect(groups.map((group) => group.recordIndexes)).toEqual([[0], [1], [2]]);
    });

    it("merges compatible records into one tree without duplicating their common prefix", () => {
        const first = lineTree(["Nf3", "d5", "g3", "c6"]);
        const second = lineTree(["Nf3", "d5", "g3", "Nf6"]);
        const merged = mergeImportedOpeningTrees(first, second);
        const lines = extractOpeningImportLines(merged, "all");

        expect(lines).toHaveLength(2);
        expect(lines.map((line) => line.moves.slice(0, 3))).toEqual([
            ["g1f3", "d7d5", "g2g3"],
            ["g1f3", "d7d5", "g2g3"],
        ]);
        expect(new Set(lines.map((line) => line.moves.at(-1)))).toEqual(new Set(["c7c6", "g8f6"]));
    });

    it("exports one portable PGN record per trainable line", () => {
        const openings = addOpeningRepertoire(createEmptyTrainingAreas().openings, {
            name: "Black repertoire",
            color: "black",
            description: "",
            path: "editable.pgn",
            sourcePath: "source.pgn",
            recordCount: 1,
            subvariationPolicy: "all",
            variants: [
                {
                    name: "Slav",
                    sourceRecordIndex: 0,
                    trainingRecordIndex: 0,
                    contentType: "theory",
                    commentCount: 0,
                    hasVariations: true,
                    lines: [
                        {
                            name: "Main line",
                            fen: INITIAL_FEN,
                            moves: ["d2d4", "d7d5"],
                            path: [0, 0],
                            plyCount: 2,
                            trainable: true,
                        },
                        {
                            name: "Paused line",
                            fen: INITIAL_FEN,
                            moves: ["c2c4"],
                            path: [1],
                            plyCount: 1,
                            trainable: false,
                        },
                    ],
                },
            ],
        });
        const repertoireId = Object.keys(openings.repertoires)[0];
        const output = buildOpeningFlatPgn(openings, repertoireId);

        expect(output.match(/^\[Event /gm)).toHaveLength(1);
        expect(output).toContain('[ChapterName "Slav"]');
        expect(output).toContain('[LineName "Main line"]');
        expect(output).toContain("1. d4 d5");
        expect(output).not.toContain("Paused line");
    });

    it("requires confirmation only when board edits change training line structure", () => {
        const openings = addOpeningRepertoire(createEmptyTrainingAreas().openings, {
            name: "Repertoire",
            color: "white",
            description: "",
            path: "editable.pgn",
            sourcePath: "source.pgn",
            recordCount: 1,
            subvariationPolicy: "all",
            variants: [
                {
                    name: "Main",
                    sourceRecordIndex: 0,
                    trainingRecordIndex: 0,
                    contentType: "theory",
                    commentCount: 0,
                    hasVariations: false,
                    lines: [
                        {
                            name: "Line",
                            fen: INITIAL_FEN,
                            moves: ["d2d4", "d7d5"],
                            path: [0, 0],
                            plyCount: 2,
                            trainable: true,
                        },
                    ],
                },
            ],
        });
        const headers = { ...defaultTree().headers, event: "Renamed section" };
        const metadataOnly = previewOpeningTrainingSync(
            openings,
            "editable.pgn",
            0,
            lineTree(["d4", "d5"]),
            headers,
        );
        const extended = previewOpeningTrainingSync(
            openings,
            "editable.pgn",
            0,
            lineTree(["d4", "d5", "c4"]),
            headers,
        );

        expect(metadataOnly.structural).toBe(false);
        expect(extended).toMatchObject({
            structural: true,
            addedLines: 0,
            changedLines: 1,
            removedLines: 0,
        });
    });

    it("consolidates numbered legacy sections and accumulates duplicate progress", () => {
        let openings = addOpeningRepertoire(createEmptyTrainingAreas().openings, {
            name: "Imported repertoire",
            color: "black",
            description: "",
            path: "editable.pgn",
            sourcePath: "source.pgn",
            recordCount: 2,
            subvariationPolicy: "all",
            variants: ["2) Slav vs. first line", "12) Slav vs. second line"].map((name, index) => ({
                name,
                sourceRecordIndex: index,
                trainingRecordIndex: index,
                contentType: "theory" as const,
                commentCount: 0,
                hasVariations: false,
                lines: [
                    {
                        name,
                        fen: INITIAL_FEN,
                        moves: ["d2d4", "d7d5"],
                        path: [0, 0],
                        plyCount: 2,
                        trainable: true,
                    },
                ],
            })),
        });
        const repertoireId = Object.keys(openings.repertoires)[0];
        const originalLineIds = Object.values(openings.lines).map((line) => line.id);
        openings = {
            ...openings,
            lines: {
                ...openings.lines,
                [originalLineIds[0]]: {
                    ...openings.lines[originalLineIds[0]],
                    session: { attempts: 1, completions: 1, flawless: 1, totalTimeMs: 1000 },
                },
                [originalLineIds[1]]: {
                    ...openings.lines[originalLineIds[1]],
                    session: { attempts: 2, completions: 1, flawless: 0, totalTimeMs: 3000 },
                },
            },
        };
        const groups = getOpeningConsolidationGroups(openings, repertoireId);
        const consolidated = consolidateOpeningSections(
            openings,
            repertoireId,
            groups.map((group) => group.key),
        );
        const repertoire = consolidated.repertoires[repertoireId];
        const variant = consolidated.variants[repertoire.variantIds[0]];
        const mergedLine = consolidated.lines[variant.lineIds[0]];

        expect(groups).toEqual([
            expect.objectContaining({ name: "Slav", variantIds: expect.any(Array), lineCount: 2 }),
        ]);
        expect(repertoire.variantIds).toHaveLength(1);
        expect(variant).toMatchObject({ name: "Slav", trainingRecordIndex: 0 });
        expect(variant.lineIds).toHaveLength(1);
        expect(mergedLine.session).toMatchObject({
            attempts: 3,
            completions: 2,
            totalTimeMs: 4000,
        });
    });
});

describe("smart grouping of course exports", () => {
    const course = (samples: OpeningPgnSample[]) => ({ filename: "course.pgn", samples });
    const white = (index: number, whiteName: string, extra: Partial<OpeningPgnSample> = {}) =>
        sample(index, `${whiteName} — ${index}`, {
            whiteName,
            blackName: `Line ${index}`,
            eventName: "Course",
            ...extra,
        });

    it("uses repeated White labels as chapters and joins every Quickstarter", () => {
        const groups = getOpeningImportGroupPreviews(
            course([
                white(0, "Introduction to the Course"),
                white(1, "Quickstarter Guide: Taimanov"),
                white(2, "Quickstarter Guide: Taimanov"),
                white(3, "Quickstarter Guide: The Kan"),
                white(4, "Miniatures"),
                white(5, "Miniatures"),
                white(6, "18 A) Kan Begins", { chessableGroupName: "Kan Begins" }),
            ]),
            "smart",
        );
        expect(groups.map((group) => [group.name, group.recordIndexes])).toEqual([
            ["Course", [0]],
            ["Quickstarter", [1, 2, 3]],
            ["Miniatures", [4, 5]],
            ["Kan Begins", [6]],
        ]);
    });

    it("puts every model game in one section", () => {
        const groups = getOpeningImportGroupPreviews(
            course([
                white(0, "1) Main line", { chessableGroupName: "Main line" }),
                white(1, "Model Games", { contentType: "modelGame" }),
                white(2, "Inspiring Games", { contentType: "modelGame" }),
            ]),
            "smart",
        );
        expect(groups.map((group) => [group.name, group.recordIndexes])).toEqual([
            ["Main line", [0]],
            ["Model games", [1, 2]],
        ]);
    });

    it("leaves out puzzles that start from their own position", () => {
        const inspection = course([
            white(0, "1) Main line", { chessableGroupName: "Main line" }),
            white(1, "Puzzles", { startingFen: "puzzle-a" }),
            white(2, "Puzzles", { startingFen: "puzzle-b" }),
            white(3, "Endgame", { startingFen: "shared" }),
            white(4, "Endgame", { startingFen: "shared" }),
            white(5, "Tactics", { startingFen: "shared" }),
        ]);
        expect(getOpeningImportSuggestedExclusions(inspection, "smart")).toEqual([1, 2, 5]);
        expect(getOpeningImportSuggestedExclusions(inspection, "single")).toEqual([]);
        expect(
            getOpeningImportGroupPreviews(inspection, "smart").map((group) => group.recordIndexes),
        ).toEqual([[0], [3, 4]]);
    });

    it("does not treat players of a game database as chapters", () => {
        const groups = getOpeningImportGroupPreviews(
            course([
                sample(0, "a", { whiteName: "Carlsen, Magnus", blackName: "Nakamura, Hikaru" }),
                sample(1, "b", { whiteName: "Carlsen, Magnus", blackName: "Caruana, Fabiano" }),
                sample(2, "c", { whiteName: "DrNykterstein", blackName: "penguingm1" }),
                sample(3, "d", { whiteName: "penguingm1", blackName: "DrNykterstein" }),
                sample(4, "e", { whiteName: "penguingm1", blackName: "Firouzja2003" }),
            ]),
            "smart",
        );
        expect(groups).toHaveLength(5);
    });
});
