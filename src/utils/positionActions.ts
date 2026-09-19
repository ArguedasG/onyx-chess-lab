import { makeUci, parseUci } from "chessops";
import { makeFen } from "chessops/fen";
import { makeSan } from "chessops/san";
import { getMainLine, getPGN, uciNormalize } from "./chess";
import { positionFromFen } from "./chessops";
import type {
    EndgameStudentColor,
    OpeningsState,
    ParsedTrainingRecord,
    TrainingObjective,
} from "./trainingAreas";
import { getNodeAtPath, type TreeNode, type TreeState } from "./treeReducer";

export type RepertoirePositionMatch = {
    kind: "exact" | "transposition";
    repertoireId: string;
    repertoireName: string;
    variantId: string;
    variantName: string;
    lineId: string;
    lineName: string;
    ply: number;
    routeSan: string[];
    continuationSan: string[];
};

export type PositionSolutionBranch = {
    childIndex: number;
    san: string;
    continuationSan: string[];
    continuationPlies: number;
};

export function positionFenKey(fen: string): string {
    return fen.trim().split(/\s+/).slice(0, 4).join(" ");
}

function currentPathMoves(tree: TreeState): string[] {
    const moves: string[] = [];
    let node = tree.root;
    for (const childIndex of tree.position) {
        const child = node.children[childIndex];
        if (!child?.move) break;
        const [position] = positionFromFen(node.fen);
        if (!position) break;
        moves.push(uciNormalize(position.clone(), child.move));
        node = child;
    }
    return moves;
}

function sameMoves(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((move, index) => move === right[index]);
}

export function findRepertoirePositionMatches(
    openings: OpeningsState,
    tree: TreeState,
): RepertoirePositionMatch[] {
    const currentNode = getNodeAtPath(tree.root, tree.position);
    const targetKey = positionFenKey(currentNode.fen);
    const boardMoves = currentPathMoves(tree);
    const boardRootKey = positionFenKey(tree.root.fen);
    const matches: RepertoirePositionMatch[] = [];

    for (const line of Object.values(openings.lines)) {
        if (!line.trainable) continue;
        const variant = openings.variants[line.variantId];
        const repertoire = variant ? openings.repertoires[variant.repertoireId] : undefined;
        if (!variant || !repertoire) continue;
        const [position] = positionFromFen(line.fen);
        if (!position) continue;
        const routeSan: string[] = [];

        for (let ply = 0; ply <= line.moves.length; ply += 1) {
            if (positionFenKey(makeFen(position.toSetup())) === targetKey) {
                const exact =
                    boardRootKey === positionFenKey(line.fen) &&
                    sameMoves(boardMoves, line.moves.slice(0, ply));
                const continuationSan: string[] = [];
                const continuationPosition = position.clone();
                for (const uci of line.moves.slice(ply, ply + 4)) {
                    const move = parseUci(uci);
                    if (!move || !continuationPosition.isLegal(move)) break;
                    continuationSan.push(makeSan(continuationPosition, move));
                    continuationPosition.play(move);
                }
                matches.push({
                    kind: exact ? "exact" : "transposition",
                    repertoireId: repertoire.id,
                    repertoireName: repertoire.name,
                    variantId: variant.id,
                    variantName: variant.name,
                    lineId: line.id,
                    lineName: line.name,
                    ply,
                    routeSan: [...routeSan],
                    continuationSan,
                });
            }
            const uci = line.moves[ply];
            if (!uci) break;
            const move = parseUci(uci);
            if (!move || !position.isLegal(move)) break;
            routeSan.push(makeSan(position, move));
            position.play(move);
        }
    }

    return matches.sort(
        (left, right) =>
            Number(left.kind === "transposition") - Number(right.kind === "transposition") ||
            left.repertoireName.localeCompare(right.repertoireName) ||
            left.variantName.localeCompare(right.variantName) ||
            left.ply - right.ply,
    );
}

function clonePositionSubtree(tree: TreeState, preferredChildIndex?: number): TreeNode {
    const current = getNodeAtPath(tree.root, tree.position);
    const root = structuredClone(current);
    root.move = null;
    root.san = null;
    if (
        preferredChildIndex !== undefined &&
        preferredChildIndex > 0 &&
        preferredChildIndex < root.children.length
    ) {
        const [preferred] = root.children.splice(preferredChildIndex, 1);
        root.children.unshift(preferred);
    }
    return root;
}

function positionSourcePgn(tree: TreeState, root: TreeNode, title: string, sourceLabel: string) {
    return getPGN(root, {
        headers: {
            ...tree.headers,
            event: title,
            fen: root.fen,
            result: "*",
            other: {
                ...tree.headers.other,
                OnyxPositionSource: sourceLabel,
            },
        },
        comments: true,
        extraMarkups: true,
        glyphs: true,
        variations: true,
    });
}

export function getPositionSolutionBranches(tree: TreeState): PositionSolutionBranch[] {
    const node = getNodeAtPath(tree.root, tree.position);
    return node.children.map((child, childIndex) => {
        const continuation = getMainLine(child);
        const continuationSan = [child.san, ...mainLineSan(child)].filter((san): san is string =>
            Boolean(san),
        );
        return {
            childIndex,
            san: child.san ?? makeUci(child.move!),
            continuationSan,
            continuationPlies: 1 + continuation.length,
        };
    });
}

function mainLineSan(node: TreeNode): string[] {
    const result: string[] = [];
    let current = node;
    while (current.children[0]) {
        current = current.children[0];
        if (current.san) result.push(current.san);
    }
    return result;
}

export function createPositionTacticsRecord(
    tree: TreeState,
    preferredChildIndex: number,
    title: string,
    sourceLabel: string,
): ParsedTrainingRecord {
    const root = clonePositionSubtree(tree, preferredChildIndex);
    const moves = getMainLine(root);
    if (moves.length === 0) throw new Error("The selected position has no prepared solution.");
    return {
        fen: root.fen,
        moves,
        title,
        sourcePgn: positionSourcePgn(tree, root, title, sourceLabel),
        hasExplicitFen: true,
    };
}

export function createPositionEndgameRecord(
    tree: TreeState,
    title: string,
    sourceLabel: string,
    objective: Exclude<TrainingObjective, "unknown">,
    studentColor: EndgameStudentColor,
): ParsedTrainingRecord {
    const root = clonePositionSubtree(tree);
    return {
        fen: root.fen,
        moves: getMainLine(root),
        title,
        sourcePgn: positionSourcePgn(tree, root, title, sourceLabel),
        endgameObjective: objective,
        endgameStudentColor: studentColor,
        hasExplicitFen: true,
    };
}
