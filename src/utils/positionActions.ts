import i18n from "i18next";
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

export type PositionSolutionMove = {
    san: string;
    /** Plies played from the start of the game after this move, for move numbers. */
    halfMoves: number;
};

export type PositionSolutionBranch = {
    childIndex: number;
    san: string;
    continuationSan: string[];
    continuationPlies: number;
    /** The branch move and its continuation, one entry per ply. */
    moves: PositionSolutionMove[];
};

export type PositionStartOption = {
    /** Board path of the starting position. */
    path: number[];
    /** Move that led to the position; null for the start of the game. */
    san: string | null;
    halfMoves: number;
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

/** The rest of the board path after `startPath` when it continues through `childIndex`. */
function boardPathAfter(tree: TreeState, startPath: number[], childIndex: number): number[] {
    const onBoardPath =
        startPath.length < tree.position.length &&
        startPath.every((index, depth) => tree.position[depth] === index) &&
        tree.position[startPath.length] === childIndex;
    return onBoardPath ? tree.position.slice(startPath.length + 1) : [];
}

function promoteChild(node: TreeNode, childIndex: number) {
    if (childIndex > 0 && childIndex < node.children.length) {
        const [preferred] = node.children.splice(childIndex, 1);
        node.children.unshift(preferred);
    }
}

function truncateTree(node: TreeNode, depth: number) {
    if (depth <= 0) {
        node.children = [];
        return;
    }
    for (const child of node.children) truncateTree(child, depth - 1);
}

/**
 * Copy the subtree at `startPath` (the displayed position by default). The preferred branch, and
 * the board path through it, become the main line; `solutionPlies` cuts every line at that depth.
 */
function clonePositionSubtree(
    tree: TreeState,
    options: { preferredChildIndex?: number; startPath?: number[]; solutionPlies?: number } = {},
): TreeNode {
    const startPath = options.startPath ?? tree.position;
    const root = structuredClone(getNodeAtPath(tree.root, startPath));
    root.move = null;
    root.san = null;
    if (options.preferredChildIndex !== undefined) {
        const rest = boardPathAfter(tree, startPath, options.preferredChildIndex);
        promoteChild(root, options.preferredChildIndex);
        let node = root.children[0];
        for (const childIndex of rest) {
            if (!node) break;
            promoteChild(node, childIndex);
            node = node.children[0];
        }
    }
    if (options.solutionPlies !== undefined && options.solutionPlies > 0) {
        truncateTree(root, options.solutionPlies);
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

/** Positions on the board path, from the start of the game to the displayed one. */
export function getPositionStartOptions(tree: TreeState): PositionStartOption[] {
    const options: PositionStartOption[] = [];
    let node = tree.root;
    options.push({ path: [], san: null, halfMoves: node.halfMoves });
    for (let depth = 0; depth < tree.position.length; depth += 1) {
        const child = node.children[tree.position[depth]];
        if (!child) break;
        node = child;
        options.push({
            path: tree.position.slice(0, depth + 1),
            san: child.san ?? (child.move ? makeUci(child.move) : null),
            halfMoves: child.halfMoves,
        });
    }
    return options;
}

/**
 * Continuations from `startPath` (the displayed position by default). A branch that leads to the
 * displayed position follows the board path first, then the main line.
 */
export function getPositionSolutionBranches(
    tree: TreeState,
    startPath: number[] = tree.position,
): PositionSolutionBranch[] {
    const node = getNodeAtPath(tree.root, startPath);
    return node.children.map((child, childIndex) => {
        const rest = boardPathAfter(tree, startPath, childIndex);
        const moves: PositionSolutionMove[] = [];
        let current: TreeNode | undefined = child;
        let depth = 0;
        while (current) {
            moves.push({
                san: current.san ?? (current.move ? makeUci(current.move) : ""),
                halfMoves: current.halfMoves,
            });
            current = current.children[rest[depth] ?? 0];
            depth += 1;
        }
        return {
            childIndex,
            san: child.san ?? makeUci(child.move!),
            continuationSan: moves.map((move) => move.san).filter(Boolean),
            continuationPlies: moves.length,
            moves,
        };
    });
}

export function createPositionTacticsRecord(
    tree: TreeState,
    preferredChildIndex: number,
    title: string,
    sourceLabel: string,
    options: { startPath?: number[]; solutionPlies?: number } = {},
): ParsedTrainingRecord {
    const root = clonePositionSubtree(tree, { ...options, preferredChildIndex });
    const moves = getMainLine(root);
    if (moves.length === 0)
        throw new Error(
            i18n.t("Errors.PositionNoSolution", "The selected position has no prepared solution."),
        );
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
