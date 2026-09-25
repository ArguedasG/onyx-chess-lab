import { describe, expect, it } from "vitest";
import {
    addOpeningRepertoire,
    createEmptyTrainingAreas,
    deleteOpeningRepertoire,
} from "./trainingAreas";

function addRepertoire(
    state: ReturnType<typeof createEmptyTrainingAreas>["openings"],
    name: string,
) {
    return addOpeningRepertoire(state, {
        name,
        color: "white",
        description: "",
        path: `C:/test/${name}.pgn`,
        sourcePath: `C:/source/${name}.pgn`,
        recordCount: 1,
        subvariationPolicy: "all",
        variants: [
            {
                name: `${name} section`,
                sourceRecordIndex: 0,
                trainingRecordIndex: 0,
                contentType: "theory",
                commentCount: 0,
                hasVariations: false,
                lines: [
                    {
                        name: `${name} line`,
                        fen: "start",
                        moves: ["e2e4"],
                        path: [0],
                        plyCount: 1,
                        trainable: true,
                    },
                ],
            },
        ],
    });
}

describe("opening repertoire deletion", () => {
    it("removes the selected repertoire, its sections and lines without touching another repertoire", () => {
        let state = addRepertoire(createEmptyTrainingAreas().openings, "White");
        state = addRepertoire(state, "Black");
        const removed = Object.values(state.repertoires).find((item) => item.name === "White")!;
        const retained = Object.values(state.repertoires).find((item) => item.name === "Black")!;

        const next = deleteOpeningRepertoire(state, removed.id);

        expect(next.repertoires[removed.id]).toBeUndefined();
        expect(next.repertoires[retained.id]).toEqual(retained);
        expect(Object.values(next.variants).every((item) => item.repertoireId !== removed.id)).toBe(
            true,
        );
        expect(Object.values(next.lines)).toHaveLength(1);
    });
});
