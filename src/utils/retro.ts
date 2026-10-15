import type { DrawShape } from "@lichess-org/chessground/draw";
import { type Color, makeSquare, makeUci, parseUci } from "chessops";
import type { ScoreValue } from "@/bindings";
import { positionFromFen } from "./chessops";
import { type Engine, getBestMovesOnce, type LocalEngine } from "./engines";
import { isMaiaEngine } from "./humanBots";
import {
    type EngineLine,
    explainMistake,
    fenAfterMove,
    type MistakeFacts,
    mistakeShapes,
} from "./moveExplanation";
import { getWinChance, normalizeScore } from "./score";
import { getNodeAtPath, type TreeNode } from "./treeReducer";

/**
 * "Learn from your mistakes", as on Lichess: after a game report, the student revisits each
 * mistake (?) and blunder (??) of one side and must find a better move, judged by the engine.
 */

export type RetroBest = { uci: string; san: string; score: ScoreValue };

export type RetroItem = {
    /** Path of the mistaken move; the exercise is played from its parent. */
    path: number[];
    /** Position of the exercise, so other boards sharing the tab never pick it up. */
    fen: string;
    san: string;
    uci: string;
    annotation: "?" | "??";
    /** Engine's best move from the parent position, filled in on first use. */
    best?: RetroBest;
    /** Engine's best line after the mistake (how it is punished), filled in once revealed. */
    refutation?: EngineLine;
};

export type RetroPhase = "find" | "evaluating" | "correct" | "wrong" | "solution" | "done";

export type RetroFeedback = "same-move" | "worse" | "no-engine" | "engine-error";

export type RetroResult = "solved" | "failed" | "skipped";

export type RetroState = {
    color: Color;
    items: RetroItem[];
    index: number;
    phase: RetroPhase;
    attempt: { uci: string; san: string } | null;
    feedback: RetroFeedback | null;
    results: (RetroResult | null)[];
};

/** A move this close to the best one (in win-chance points, 0–100) is accepted. */
export const RETRO_TOLERANCE = 3;

/** Mainline mistakes and blunders made by `color`, in game order. */
export function collectRetroMistakes(root: TreeNode, color: Color): RetroItem[] {
    const items: RetroItem[] = [];
    let node = root;
    const path: number[] = [];
    while (node.children.length > 0) {
        const child = node.children[0];
        path.push(0);
        const mover: Color = node.fen.split(" ")[1] === "b" ? "black" : "white";
        const annotation = child.annotations.find((a) => a === "??" || a === "?");
        if (mover === color && annotation && child.move && child.san) {
            items.push({
                path: [...path],
                fen: node.fen,
                san: child.san,
                uci: makeUci(child.move),
                annotation: annotation as "?" | "??",
            });
        }
        node = child;
    }
    return items;
}

export function newRetroState(color: Color, items: RetroItem[]): RetroState {
    return {
        color,
        items,
        index: 0,
        phase: items.length > 0 ? "find" : "done",
        attempt: null,
        feedback: null,
        results: items.map(() => null),
    };
}

/** True when `candidate` keeps (almost) all the winning chances of `best` for `color`. */
export function retroAccepts(best: ScoreValue, candidate: ScoreValue, color: Color) {
    const loss =
        getWinChance(normalizeScore(best, color)) - getWinChance(normalizeScore(candidate, color));
    return loss <= RETRO_TOLERANCE;
}

/** Prefers Stockfish among the local, non-Maia engines. */
export function pickReferenceEngine(engines: Engine[]): LocalEngine | undefined {
    const local = engines.filter(
        (engine): engine is LocalEngine =>
            engine.type === "local" && Boolean(engine.path) && !isMaiaEngine(engine),
    );
    return local.find((engine) => /stockfish/i.test(engine.name)) ?? local[0];
}

export async function findRetroBest(engine: LocalEngine, fen: string): Promise<RetroBest> {
    const [line] = await getBestMovesOnce(
        engine,
        { t: "Depth", c: 18 },
        { fen, moves: [], extraOptions: [{ name: "MultiPV", value: "1" }] },
        15_000,
    );
    if (!line || line.uciMoves.length === 0) throw new Error("No best move");
    return { uci: line.uciMoves[0], san: line.sanMoves[0], score: line.score.value };
}

export async function judgeRetroMove(
    engine: LocalEngine,
    { fen, item, color, uci }: { fen: string; item: RetroItem; color: Color; uci: string },
): Promise<{ correct: boolean; feedback: RetroFeedback | null; best: RetroBest }> {
    const best = item.best ?? (await findRetroBest(engine, fen));
    if (uci === item.uci) return { correct: false, feedback: "same-move", best };
    if (uci === best.uci) return { correct: true, feedback: null, best };

    const [pos] = positionFromFen(fen);
    const move = parseUci(uci);
    if (!pos || !move) return { correct: false, feedback: "worse", best };
    pos.play(move);
    let score: ScoreValue;
    if (pos.isCheckmate()) {
        return { correct: true, feedback: null, best };
    } else if (pos.isEnd()) {
        score = { type: "cp", value: 0 };
    } else {
        const [line] = await getBestMovesOnce(
            engine,
            { t: "Depth", c: 16 },
            { fen, moves: [uci], extraOptions: [{ name: "MultiPV", value: "1" }] },
            15_000,
        );
        if (!line) throw new Error("No evaluation");
        score = line.score.value;
    }
    const correct = retroAccepts(best.score, score, color);
    return { correct, feedback: correct ? null : "worse", best };
}

/** The opponent's best line after the mistake, used to explain what it allowed. */
export async function findRetroRefutation(engine: LocalEngine, item: RetroItem) {
    const fen = fenAfterMove(item.fen, item.uci);
    if (!fen) return undefined;
    const [line] = await getBestMovesOnce(
        engine,
        { t: "Depth", c: 16 },
        { fen, moves: [], extraOptions: [{ name: "MultiPV", value: "1" }] },
        15_000,
    );
    if (!line || line.uciMoves.length === 0) return undefined;
    return {
        uci: line.uciMoves.slice(0, 8),
        san: line.sanMoves.slice(0, 8),
        score: line.score.value,
    } satisfies EngineLine;
}

/** The facts the explanation and the arrows are built from. */
export function retroFacts(item: RetroItem, color: Color): MistakeFacts {
    return {
        fen: item.fen,
        played: { uci: item.uci, san: item.san },
        color,
        best: item.best
            ? { uci: [item.best.uci], san: [item.best.san], score: item.best.score }
            : undefined,
        refutation: item.refutation,
    };
}

/** Sentences explaining the current mistake once the answer is known. */
export function retroExplanation(state: RetroState) {
    const item = state.items[state.index];
    if (!item || (state.phase !== "correct" && state.phase !== "solution")) return [];
    return explainMistake(retroFacts(item, state.color));
}

function arrow(uci: string, brush: string): DrawShape[] {
    const move = parseUci(uci);
    if (!move || !("from" in move)) return [];
    return [{ orig: makeSquare(move.from), dest: makeSquare(move.to), brush }];
}

/** Arrows for the exercise position: the attempt in its verdict's colour, or the solution. */
export function retroShapes(state: RetroState): DrawShape[] {
    const item = state.items[state.index];
    if (!item) return [];
    switch (state.phase) {
        case "evaluating":
            return state.attempt ? arrow(state.attempt.uci, "blue") : [];
        case "correct":
            // The answer, the mistake in red and what the mistake lost.
            return [
                ...(state.attempt ? arrow(state.attempt.uci, "green") : []),
                ...mistakeShapes({ ...retroFacts(item, state.color), best: undefined }),
            ];
        case "wrong":
            return state.attempt ? arrow(state.attempt.uci, "red") : [];
        case "solution":
            return mistakeShapes(retroFacts(item, state.color));
        default:
            return [];
    }
}

export function samePath(left: readonly number[], right: readonly number[]) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** True while a session is running on this very game (its current exercise is in `root`). */
export function retroRunsOn(state: RetroState | null, root: TreeNode) {
    const item = state && state.phase !== "done" ? state.items[state.index] : undefined;
    return !!item && getNodeAtPath(root, item.path.slice(0, -1)).fen === item.fen;
}
