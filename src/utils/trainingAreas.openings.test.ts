import { describe, expect, it } from "vitest";
import {
    addOpeningRepertoire,
    createEmptyTrainingAreas,
    addBlankOpeningVariant,
    deleteOpeningRepertoire,
    removeOpeningSection,
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

describe("opening section deletion", () => {
    function twoSections() {
        let state = addRepertoire(createEmptyTrainingAreas().openings, "White");
        const repertoire = Object.values(state.repertoires)[0];
        state = addBlankOpeningVariant(state, repertoire.id, "Second");
        const [first, second] = state.repertoires[repertoire.id].variantIds.map(
            (id) => state.variants[id],
        );
        return { state, repertoire, first, second };
    }

    it("moves the lines to another section, keeping them", () => {
        const { state, repertoire, first, second } = twoSections();
        const lineId = first.lineIds[0];
        const next = removeOpeningSection(state, first.id, second.id);
        expect(next.variants[first.id]).toBeUndefined();
        expect(next.repertoires[repertoire.id].variantIds).toEqual([second.id]);
        expect(next.variants[second.id].lineIds).toEqual([lineId]);
        expect(next.lines[lineId].variantId).toBe(second.id);
    });

    it("deletes the lines with the section when no target is given", () => {
        const { state, first } = twoSections();
        const lineId = first.lineIds[0];
        const next = removeOpeningSection(state, first.id, null);
        expect(next.variants[first.id]).toBeUndefined();
        expect(next.lines[lineId]).toBeUndefined();
    });
});
