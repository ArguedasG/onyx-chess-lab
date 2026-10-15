import type { Color } from "chessops";
import type { Score } from "@/bindings";
import { getWinChance, normalizeScore } from "./score";
import type { TreeNode } from "./treeReducer";

/**
 * The moves that decided a reported game (idea I-15): the largest losses of winning chances on
 * the main line, so the student can jump straight to them. Only moves losing more than
 * `KEY_MOMENT_MIN_LOSS` points count, and at most `MAX_KEY_MOMENTS` are kept.
 */
export const KEY_MOMENT_MIN_LOSS = 10;
export const MAX_KEY_MOMENTS = 3;

export type KeyMomentKind =
    /** The side ahead changes: the mover goes from better (≥ 55 %) to worse (≤ 45 %). */
    | "turning"
    /** A winning position (≥ 80 %) stops being clearly winning (< 65 %). */
    | "missedWin"
    | "error";

export type KeyMoment = {
    path: number[];
    moveNumber: number;
    color: Color;
    san: string;
    /** Winning chances of the mover before and after the move (0–100). */
    before: number;
    after: number;
    kind: KeyMomentKind;
};

function chance(score: Score, color: Color) {
    return getWinChance(normalizeScore(score.value, color));
}

export function findKeyMoments(root: TreeNode): KeyMoment[] {
    const moments: KeyMoment[] = [];
    let parent = root;
    const path: number[] = [];
    while (parent.children.length > 0) {
        const node = parent.children[0];
        path.push(0);
        if (parent.score && node.score && node.san) {
            const color: Color = parent.fen.split(" ")[1] === "b" ? "black" : "white";
            const before = chance(parent.score, color);
            const after = chance(node.score, color);
            if (before - after > KEY_MOMENT_MIN_LOSS) {
                const kind: KeyMomentKind =
                    before >= 55 && after <= 45
                        ? "turning"
                        : before >= 80 && after < 65
                          ? "missedWin"
                          : "error";
                moments.push({
                    path: [...path],
                    moveNumber: Math.ceil(node.halfMoves / 2),
                    color,
                    san: node.san,
                    before,
                    after,
                    kind,
                });
            }
        }
        parent = node;
    }
    return moments
        .sort((a, b) => b.before - b.after - (a.before - a.after))
        .slice(0, MAX_KEY_MOMENTS)
        .sort((a, b) => a.path.length - b.path.length);
}
