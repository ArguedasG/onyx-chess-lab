import { describe, expect, it } from "vitest";
import { positionFromFen } from "./chessops";
import { BASIC_MATES, generateBasicMate } from "./basicMates";
import { groupEndgameImport, hasUsefulChapters, previewEndgameImport } from "./endgameImport";
import {
    acceptComputedEndgameObjective,
    addEndgameRecordsToSet,
    addEndgameSet,
    applyComputedEndgameObjective,
    createEmptyTrainingAreas,
    recordBasicMateAttempt,
    type ParsedTrainingRecord,
} from "./trainingAreas";

const record = (fen: string, event: string, objective?: "win" | "draw"): ParsedTrainingRecord => ({
    fen,
    moves: [],
    // A misleading title: the family must come from the position.
    title: "Torre activa",
    sourcePgn: `[Event "${event}"]\n[FEN "${fen}"]\n\n*`,
    endgameObjective: objective,
    hasExplicitFen: true,
});

const pawnEnding = "8/8/4k3/8/4P3/4K3/8/8 w - - 0 1";
const rookEnding = "8/8/4k3/8/4P3/4K3/8/R6r w - - 0 1";
const queenEnding = "8/8/4k3/8/8/4K3/8/Q7 w - - 0 1";

describe("endgame import", () => {
    const records = [
        record(pawnEnding, "Chapter 1"),
        record(rookEnding, "Chapter 1"),
        record(queenEnding, "Chapter 2"),
        record(pawnEnding, "Chapter 2"),
    ];
    const preview = previewEndgameImport(records);

    it("reads the family from the position, not the title", () => {
        expect(preview.map((item) => item.theme)).toEqual(["pawn", "rook", "queen", "pawn"]);
        expect(preview[0].pieces).toBe(3);
    });

    it("splits by family or by chapter, in PGN order", () => {
        const byTheme = groupEndgameImport(preview, "theme", "Book", (theme) => theme);
        expect(byTheme.map((group) => [group.name, group.records.length])).toEqual([
            ["Book · pawn", 2],
            ["Book · rook", 1],
            ["Book · queen", 1],
        ]);
        expect(hasUsefulChapters(preview)).toBe(true);
        const byChapter = groupEndgameImport(preview, "chapter", "Book", (theme) => theme);
        expect(byChapter.map((group) => group.name)).toEqual([
            "Book · Chapter 1",
            "Book · Chapter 2",
        ]);
    });

    it("adds records to an existing set", () => {
        const base = addEndgameSet(createEmptyTrainingAreas().endgames, "Mine", "", [records[0]]);
        const setId = Object.keys(base.sets)[0];
        const next = addEndgameRecordsToSet(base, setId, records.slice(1));
        expect(Object.keys(next.sets)).toEqual([setId]);
        expect(next.sets[setId].positionIds).toHaveLength(4);
        expect(next.positions[next.sets[setId].positionIds[1]].theme).toBe("rook");
    });

    it("keeps the PGN objective when the calculation disagrees", () => {
        const base = addEndgameSet(createEmptyTrainingAreas().endgames, "Mine", "", [
            record(pawnEnding, "x", "win"),
            record(pawnEnding, "x"),
        ]);
        const [written, pending] = base.sets[Object.keys(base.sets)[0]].positionIds;
        let next = applyComputedEndgameObjective(base, written, "draw", "tablebase");
        next = applyComputedEndgameObjective(next, pending, "draw", "tablebase");
        expect(next.positions[written].objective).toBe("win");
        expect(next.positions[written].computedObjective).toBe("draw");
        expect(next.positions[pending].objective).toBe("draw");
        next = acceptComputedEndgameObjective(next, written);
        expect(next.positions[written].objective).toBe("draw");
        expect(next.positions[written].objectiveSource).toBe("tablebase");
    });
});

describe("basic mates", () => {
    it("generates legal positions with the lone king away from the edge", () => {
        for (const mate of BASIC_MATES) {
            for (let index = 0; index < 40; index++) {
                const fen = generateBasicMate(mate.id);
                const [position] = positionFromFen(fen);
                expect(position).not.toBeNull();
                expect(position!.turn).toBe("white");
                expect(position!.board.occupied.size()).toBe(2 + mate.pieces.length);
                const king = position!.board.kingOf("black")!;
                expect(king % 8).toBeGreaterThan(0);
                expect(king % 8).toBeLessThan(7);
            }
        }
    });

    it("keeps the best successful time", () => {
        let state = createEmptyTrainingAreas().endgames;
        state = recordBasicMateAttempt(state, "kq", { success: true, timeMs: 40_000 });
        state = recordBasicMateAttempt(state, "kq", { success: false, timeMs: 10_000 });
        state = recordBasicMateAttempt(state, "kq", { success: true, timeMs: 30_000 });
        expect(state.basicMates?.kq).toMatchObject({
            attempts: 3,
            successes: 2,
            bestTimeMs: 30_000,
        });
    });
});
