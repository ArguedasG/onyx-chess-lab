import { parseUci } from "chessops";
import { describe, expect, it } from "vitest";
import {
    getExpectedMoveShape,
    getVariationArrowShapes,
    MAIN_VARIATION_BRUSH,
    SECONDARY_VARIATION_BRUSH,
} from "./boardShapes";
import type { TreeNode } from "./treeReducer";

function nodeWithMoves(...moves: string[]): Pick<TreeNode, "children"> {
    return {
        children: moves.map((move) => ({ move: parseUci(move) }) as TreeNode),
    };
}

describe("variation arrows", () => {
    it("does not draw an arrow when there is no alternative", () => {
        expect(getVariationArrowShapes(nodeWithMoves("e2e4"))).toEqual([]);
    });

    it("distinguishes the main line from secondary variations", () => {
        expect(getVariationArrowShapes(nodeWithMoves("e2e4", "g1f3", "d2d4"))).toEqual([
            {
                orig: "e2",
                dest: "e4",
                brush: MAIN_VARIATION_BRUSH,
                modifiers: { lineWidth: 10 },
            },
            {
                orig: "g1",
                dest: "f3",
                brush: SECONDARY_VARIATION_BRUSH,
                modifiers: { lineWidth: 5.5 },
            },
            {
                orig: "d2",
                dest: "d4",
                brush: SECONDARY_VARIATION_BRUSH,
                modifiers: { lineWidth: 5.5 },
            },
        ]);
    });
});

describe("expected move arrow", () => {
    it("points at the requested continuation", () => {
        expect(getExpectedMoveShape(nodeWithMoves("e2e4", "d2d4"), 1)).toEqual({
            orig: "d2",
            dest: "d4",
            brush: "green",
            modifiers: { lineWidth: 12 },
        });
    });

    it("returns nothing when the continuation does not exist", () => {
        expect(getExpectedMoveShape(nodeWithMoves("e2e4"), 3)).toBeNull();
    });
});
