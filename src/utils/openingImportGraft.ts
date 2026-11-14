import { makeUci } from "chessops";
import type { TreeNode } from "./treeReducer";

/**
 * Course exports often start a record from a position of the course instead of the initial one
 * (a `[FEN]` after a few moves), usually with move counters that do not match ("0 1"). Such a
 * record can still join the tree of its chapter: it is grafted where that position appears.
 */

/** A position without its move counters, to recognize it in another tree. */
export function positionKey(fen: string): string {
    return fen.trim().split(/\s+/).slice(0, 4).join(" ");
}

function collectPositions(node: TreeNode, into: Set<string>) {
    into.add(positionKey(node.fen));
    for (const child of node.children) collectPositions(child, into);
}

/**
 * For each record, the start of the tree it can join: its own start, or, when its position
 * appears after some moves in another record (directly or through a chain of such records), the
 * start of that record. Records that cannot be attached keep their own start.
 */
export function attachSectionFens(trees: ReadonlyArray<TreeNode | null>): string[] {
    const own = trees.map((tree) => tree?.fen ?? "");
    const positions = trees.map((tree) => {
        const set = new Set<string>();
        if (tree) collectPositions(tree, set);
        return set;
    });
    const section = [...own];
    // A chain (a record inside a record inside another) settles in a few passes.
    for (let pass = 0; pass < 4; pass++) {
        let changed = false;
        trees.forEach((tree, index) => {
            if (!tree) return;
            const key = positionKey(tree.fen);
            let best: string | undefined;
            trees.forEach((other, otherIndex) => {
                if (!other || otherIndex === index) return;
                // Inside the other tree, not at its root: there it would be the same start.
                if (positionKey(other.fen) === key || !positions[otherIndex].has(key)) return;
                const candidate = section[otherIndex];
                if (positionKey(candidate) === key) return;
                // Prefer the deepest anchor, which is where most records start (the initial one).
                if (!best || isInitial(candidate)) best = candidate;
            });
            if (best && positionKey(best) !== positionKey(section[index])) {
                section[index] = best;
                changed = true;
            }
        });
        if (!changed) break;
    }
    return section;
}

function isInitial(fen: string): boolean {
    return positionKey(fen) === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
}

function findPath(node: TreeNode, key: string, path: TreeNode[] = []): TreeNode[] | null {
    if (positionKey(node.fen) === key) return path;
    for (const child of node.children) {
        const found = findPath(child, key, [...path, child]);
        if (found) return found;
    }
    return null;
}

function moveKey(node: TreeNode): string | null {
    return node.move ? makeUci(node.move) : null;
}

/** A copy of `node` and its subtree numbered from `halfMoves`, as the grafted part needs. */
function renumbered(node: TreeNode, halfMoves: number): TreeNode {
    return {
        ...structuredClone({ ...node, children: [] }),
        halfMoves,
        children: node.children.map((child) => renumbered(child, halfMoves + 1)),
    };
}

/**
 * Grafts `source` (a tree that starts inside `target`) at the node with its position, merging it
 * with what is already there. When `target` does not contain the position yet, the moves that
 * lead to it are copied from one of `bridges` (other records of the file). Returns the path (child
 * indexes) from the start of `target` to the graft point, or null when it cannot be attached.
 */
export function graftTree(
    target: TreeNode,
    source: TreeNode,
    bridges: ReadonlyArray<TreeNode | null>,
    merge: (node: TreeNode, source: TreeNode) => void,
): number[] | null {
    const key = positionKey(source.fen);
    let path = findPath(target, key);
    if (!path) {
        const targetKey = positionKey(target.fen);
        const bridge = bridges
            .filter(
                (tree): tree is TreeNode => Boolean(tree) && positionKey(tree!.fen) === targetKey,
            )
            .map((tree) => findPath(tree, key))
            .find((found): found is TreeNode[] => found !== null);
        if (!bridge) return null;
        // Copy only the moves: the comments of the bridge belong to another record.
        let node = target;
        path = [];
        for (const step of bridge) {
            let child = node.children.find((candidate) => moveKey(candidate) === moveKey(step));
            if (!child) {
                child = {
                    ...structuredClone({ ...step, children: [] }),
                    halfMoves: node.halfMoves + 1,
                    comment: "",
                    shapes: [],
                    annotations: [],
                    score: null,
                };
                node.children.push(child);
            }
            path.push(child);
            node = child;
        }
    }
    const at = path.at(-1) ?? target;
    merge(at, renumbered(source, at.halfMoves));
    const indexes: number[] = [];
    let parent = target;
    for (const node of path) {
        indexes.push(parent.children.indexOf(node));
        parent = node;
    }
    return indexes;
}
