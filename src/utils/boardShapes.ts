import type { DrawShape } from "@lichess-org/chessground/draw";
import { makeSquare, type NormalMove } from "chessops";
import type { TreeNode } from "./treeReducer";

export const MAIN_VARIATION_BRUSH = "variationMain";
export const SECONDARY_VARIATION_BRUSH = "variationSecondary";

export function getVariationArrowShapes(node: Pick<TreeNode, "children">): DrawShape[] {
    if (node.children.length < 2) return [];

    return node.children.flatMap((child, index) => {
        if (!child.move) return [];
        const move = child.move as NormalMove;
        const orig = makeSquare(move.from);
        const dest = makeSquare(move.to);
        if (!orig || !dest) return [];

        return [
            {
                orig,
                dest,
                brush: index === 0 ? MAIN_VARIATION_BRUSH : SECONDARY_VARIATION_BRUSH,
                modifiers: { lineWidth: index === 0 ? 10 : 5.5 },
            },
        ];
    });
}
