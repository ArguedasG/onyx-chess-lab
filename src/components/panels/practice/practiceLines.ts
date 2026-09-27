import type { Position } from "@/components/files/opening";
import { getVariationLine, uciNormalize } from "@/utils/chess";
import { positionFromFen } from "@/utils/chessops";
import type { TreeNode } from "@/utils/treeReducer";

export function getLineRepresentativeIndices(root: TreeNode, positions: Position[]): number[] {
    const positionIndexByFen = new Map(positions.map((position, index) => [position.fen, index]));
    const representatives = new Set<number>();

    function visit(node: TreeNode, lastPositionIndex: number | null) {
        const nextIndex = positionIndexByFen.get(node.fen) ?? lastPositionIndex;
        if (node.children.length === 0) {
            if (nextIndex !== null) representatives.add(nextIndex);
            return;
        }
        node.children.forEach((child) => visit(child, nextIndex));
    }

    visit(root, null);
    return [...representatives];
}

export function getLineMoves(root: TreeNode, path: number[]): string[] {
    return getVariationLine(root, path, true);
}

export function findOpeningLinePath(root: TreeNode, moves: string[]): number[] | null {
    const [position] = positionFromFen(root.fen);
    if (!position) return null;
    const path: number[] = [];
    let node = root;
    for (const expectedMove of moves) {
        const childIndex = node.children.findIndex(
            (child) => child.move && uciNormalize(position, child.move) === expectedMove,
        );
        if (childIndex < 0) return null;
        const child = node.children[childIndex];
        path.push(childIndex);
        position.play(child.move!);
        node = child;
    }
    return path;
}
