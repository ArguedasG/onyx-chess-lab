/**
 * Surprise finder, after Matthew Sadler's "Novelty Grinder": along a line, the moves the engine
 * keeps close to its best that the database rarely or never plays. Onyx ranks them by how likely
 * an opponent of the chosen level is to go wrong afterwards (I-33) instead of Leela's contempt.
 */
import type { EngineEvaluator, MaiaSampler } from "./engines";
import { MIN_GAMES_FOR_FREQUENCIES } from "./generate";
import { playUci, sideToMove } from "./positions";
import { difficulty } from "./scoring";
import type { LoadedSource } from "./sources";
import type { Difficulty, GeneratorColor, SourcePosition } from "./types";

export type SurpriseConfig = {
    /** Positions of the line: FEN before each move, and the move played there (if any). */
    line: Array<{ fen: string; played?: { uci: string; san: string } }>;
    /** Side whose moves are searched; both when null. */
    color: GeneratorColor | null;
    /** Start at this move number (Sadler: 4). */
    firstMove: number;
    /** Stop when the position has fewer games than this (Sadler: 40). */
    stopGames: number;
    /** A surprise is played in at most this share of the games, in percent (Sadler: 5). */
    maxShare: number;
    /** Largest loss against the engine's best move, in centipawns. */
    maxLoss: number;
};

export type Surprise = {
    /** Index in `line`: the position where the surprise is played. */
    index: number;
    fen: string;
    moveNumber: number;
    color: GeneratorColor;
    uci: string;
    san: string;
    /** The move of the line in that position, for comparison. */
    played?: { uci: string; san: string };
    /** Never played in the source ("novelty") or played in at most `maxShare` % ("rare"). */
    kind: "novelty" | "rare";
    share: number;
    games: number;
    positionGames: number;
    loss: number;
    /** From the side that plays the surprise. */
    evalCp: number;
    difficulty: Difficulty | null;
};

export type SurpriseResult = {
    surprises: Surprise[];
    /** Positions looked at, and where the search stopped and why. */
    examined: number;
    stoppedAt: number | null;
    stopReason: "book" | "end" | null;
};

function moveNumberOf(fen: string): number {
    return Number(fen.split(" ")[5] ?? 1) || 1;
}

function total(position: SourcePosition | null) {
    return position?.moves.reduce((sum, move) => sum + move.games, 0) ?? 0;
}

export async function findSurprises(
    config: SurpriseConfig,
    deps: {
        source: LoadedSource;
        evaluator: EngineEvaluator;
        maia?: MaiaSampler;
        signal?: AbortSignal;
        onProgress?: (done: number, total: number) => void;
    },
): Promise<SurpriseResult> {
    const surprises: Surprise[] = [];
    let examined = 0;
    let stoppedAt: number | null = null;
    let stopReason: SurpriseResult["stopReason"] = "end";
    const steps = config.line;
    for (const [index, step] of steps.entries()) {
        if (deps.signal?.aborted) throw new DOMException("Search cancelled", "AbortError");
        deps.onProgress?.(index, steps.length);
        const color = sideToMove(step.fen);
        if (moveNumberOf(step.fen) < config.firstMove) continue;
        const position = await deps.source.position(step.fen, deps.signal);
        const games = total(position);
        if (games < config.stopGames) {
            stoppedAt = index;
            stopReason = "book";
            break;
        }
        if (config.color && color !== config.color) continue;
        examined += 1;
        const [view] = await deps.evaluator.evaluate([step.fen]);
        if (!view) continue;
        const candidates = view.lines.flatMap((line) => {
            const loss = Math.max(0, view.bestCp - line.cp);
            if (loss > config.maxLoss || line.uci === step.played?.uci) return [];
            const move = position?.moves.find((candidate) => candidate.uci === line.uci);
            const share = move ? (move.games / games) * 100 : 0;
            if (share > config.maxShare) return [];
            const next = playUci(step.fen, line.uci);
            return next ? [{ line, loss, share, games: move?.games ?? 0, next }] : [];
        });
        if (candidates.length === 0) continue;
        // Difficulty for the opponent in the position after each surprise.
        const afterFens = candidates.map((candidate) => candidate.next.fen);
        const afterViews = await deps.evaluator.evaluate(afterFens);
        const afterPositions = await Promise.all(
            afterFens.map((fen) => deps.source.position(fen, deps.signal)),
        );
        const needMaia = afterFens.filter(
            (_, i) => (afterPositions[i]?.games ?? 0) < MIN_GAMES_FOR_FREQUENCIES,
        );
        const sampled = deps.maia && needMaia.length ? await deps.maia.frequencies(needMaia) : [];
        candidates.forEach((candidate, i) => {
            const view = afterViews[i];
            const after = afterPositions[i];
            let found: Difficulty | null = null;
            if (view && after && after.games >= MIN_GAMES_FOR_FREQUENCIES)
                found = difficulty(
                    view,
                    after.moves.map((move) => ({ uci: move.uci, count: move.games })),
                    "games",
                );
            else if (view) {
                const frequencies = sampled[needMaia.indexOf(afterFens[i])];
                if (frequencies?.length) found = difficulty(view, frequencies, "maia");
            }
            surprises.push({
                index,
                fen: step.fen,
                moveNumber: moveNumberOf(step.fen),
                color,
                uci: candidate.next.uci,
                san: candidate.next.san,
                played: step.played,
                kind: candidate.games === 0 ? "novelty" : "rare",
                share: candidate.share,
                games: candidate.games,
                positionGames: games,
                loss: candidate.loss,
                evalCp: candidate.line.cp,
                difficulty: found,
            });
        });
    }
    if (stopReason === "end") stoppedAt = null;
    deps.onProgress?.(steps.length, steps.length);
    surprises.sort(
        (a, b) =>
            (a.difficulty?.keepProbability ?? 1) - (b.difficulty?.keepProbability ?? 1) ||
            a.loss - b.loss ||
            a.index - b.index,
    );
    return { surprises, examined, stoppedAt, stopReason };
}
