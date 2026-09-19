import { INITIAL_FEN } from "chessops/fen";
import { describe, expect, it } from "vitest";
import { createTreeStore } from "@/state/store/tree";
import {
    createPositionEndgameRecord,
    createPositionTacticsRecord,
    findRepertoirePositionMatches,
    getPositionSolutionBranches,
} from "./positionActions";
import { createEmptyTrainingAreas, type OpeningsState } from "./trainingAreas";

function openingsWithMoveOrders(): OpeningsState {
    const state = createEmptyTrainingAreas().openings;
    state.repertoires.rep = {
        id: "rep",
        name: "Réti",
        color: "white",
        description: "",
        path: "reti.pgn",
        sourcePath: "reti-source.pgn",
        recordCount: 1,
        variantIds: ["variant"],
        acceptanceThresholdCp: 30,
        subvariationPolicy: "all",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
    state.variants.variant = {
        id: "variant",
        repertoireId: "rep",
        name: "Move orders",
        lineIds: ["exact", "transposition"],
        sourceRecordIndex: 0,
        trainingRecordIndex: 0,
        contentType: "theory",
        commentCount: 0,
        hasVariations: true,
    };
    const progress = { attempts: 0, completions: 0, flawless: 0, totalTimeMs: 0 };
    state.lines.exact = {
        id: "exact",
        variantId: "variant",
        name: "Knight first",
        fen: INITIAL_FEN,
        moves: ["g1f3", "d7d5", "g2g3", "c7c5"],
        path: [0, 0, 0, 0],
        plyCount: 4,
        trainable: true,
        sourceRecordIndex: 0,
        moveProgress: {},
        session: progress,
    };
    state.lines.transposition = {
        ...state.lines.exact,
        id: "transposition",
        name: "Fianchetto first",
        moves: ["g2g3", "d7d5", "g1f3", "c7c5"],
    };
    return state;
}

describe("current-position actions", () => {
    it("distinguishes an exact repertoire route from a transposition", () => {
        const store = createTreeStore();
        store.getState().makeMoves({ payload: ["Nf3", "d5", "g3", "c5"] });
        const matches = findRepertoirePositionMatches(openingsWithMoveOrders(), store.getState());

        expect(matches.map((match) => [match.lineId, match.kind])).toEqual([
            ["exact", "exact"],
            ["transposition", "transposition"],
        ]);
        expect(matches[0].routeSan).toEqual(["Nf3", "d5", "g3", "c5"]);
    });

    it("promotes the reviewed branch to the copied tactical solution and keeps alternatives", () => {
        const store = createTreeStore();
        store.getState().makeMoves({ payload: ["e4", "e5", "Nf3"] });
        store.getState().goToMove([0]);
        store.getState().makeMoves({ payload: ["c5", "Nf3"], mainline: false });
        store.getState().goToMove([0]);

        const branches = getPositionSolutionBranches(store.getState());
        expect(branches.map((branch) => branch.san)).toEqual(["e5", "c5"]);

        const record = createPositionTacticsRecord(store.getState(), 1, "Sicilian idea", "Board");
        expect(record.moves.slice(0, 2)).toEqual(["c7c5", "g1f3"]);
        expect(record.sourcePgn).toContain("e5");
        expect(record.sourcePgn).toContain("c5");
    });

    it("copies an endgame with explicit student color and objective", () => {
        const store = createTreeStore(undefined, undefined);
        const record = createPositionEndgameRecord(
            store.getState(),
            "Hold this position",
            "Board",
            "draw",
            "black",
        );
        expect(record.fen).toBe(INITIAL_FEN);
        expect(record.endgameObjective).toBe("draw");
        expect(record.endgameStudentColor).toBe("black");
    });
});
