import { describe, expect, it } from "vitest";
import type { Score } from "@/bindings";
import { findKeyMoments } from "./keyMoments";
import type { TreeNode } from "./treeReducer";

const cp = (value: number): Score => ({ value: { type: "cp", value }, wdl: null });

/** A main line whose positions have the given White evaluations (root first). */
function line(evaluations: number[]): TreeNode {
    const nodes: TreeNode[] = evaluations.map((value, halfMoves) => ({
        fen: `8/8/8/8/8/8/8/K6k ${halfMoves % 2 === 0 ? "w" : "b"} - - 0 1`,
        move: null,
        san: halfMoves === 0 ? null : `m${halfMoves}`,
        children: [],
        score: cp(value),
        depth: null,
        halfMoves,
        shapes: [],
        annotations: [],
        comment: "",
    }));
    for (let i = 0; i + 1 < nodes.length; i++) nodes[i].children = [nodes[i + 1]];
    return nodes[0];
}

describe("key moments", () => {
    it("keeps the three largest losses, in game order, and names what they did", () => {
        // White's moves are the odd plies. 1. +5.00 → +1.00 (missed win), 2... +0.80 → +3.00
        // (error for Black), 4. +2.60 → -2.00 (turning); the small slips are ignored.
        const root = line([500, 100, 100, 80, 300, 280, 260, -200, -190]);
        const moments = findKeyMoments(root);
        expect(moments.map((moment) => [moment.san, moment.color, moment.kind])).toEqual([
            ["m1", "white", "missedWin"],
            ["m4", "black", "error"],
            ["m7", "white", "turning"],
        ]);
        expect(moments[0].moveNumber).toBe(1);
        expect(moments[0].before).toBeGreaterThan(moments[0].after);
    });

    it("finds nothing in a game without engine scores or big losses", () => {
        expect(findKeyMoments(line([20, 10, 30, 0]))).toEqual([]);
        const unscored = line([0, 0]);
        unscored.score = null;
        expect(findKeyMoments(unscored)).toEqual([]);
    });
});
