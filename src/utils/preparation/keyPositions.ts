/**
 * Key positions of a player's book and their practical difficulty for them (I-33): the
 * positions their most played lines reach with the player to move, and the chance that a player
 * of their level keeps the evaluation there. For the user's own card the same list shows where
 * they themselves tend to go wrong.
 */
import type { EngineEvaluator, MaiaSampler } from "@/utils/repertoireGenerator/engines";
import { playUci, positionKey, sideToMove } from "@/utils/repertoireGenerator/positions";
import { difficulty } from "@/utils/repertoireGenerator/scoring";
import type { Difficulty } from "@/utils/repertoireGenerator/types";
import { type BookMove, type BookPosition, type PlayerBook, START_FEN } from "./book";

/** From this many games in the position the player's own moves give the frequencies. */
export const MIN_OWN_GAMES = 8;
export const MAX_KEY_POSITIONS = 12;

export type KeyPosition = {
    fen: string;
    /** Moves from the start (UCI). */
    path: string[];
    games: number;
    /** Share of the player's games in that color that reach it, in percent. */
    reach: number;
    moves: BookMove[];
};

export type RatedKeyPosition = KeyPosition & {
    difficulty: Difficulty | null;
    /** The engine's best move (SAN) and how often the player chose it. */
    bestSan: string | null;
    bestShare: number | null;
};

/**
 * The positions to look at: the player to move, reached by at least `minGames` games and 4 % of
 * their games in the color, from move 3 on. Deeper positions come first among equally common
 * ones, since the earliest ones are reached by nearly every game.
 */
export function keyPositionCandidates(
    book: PlayerBook,
    limit = MAX_KEY_POSITIONS,
    minGames = 3,
): KeyPosition[] {
    const threshold = Math.max(minGames, Math.ceil(book.games * 0.04));
    const found: KeyPosition[] = [];
    const visited = new Set<string>();
    const queue: Array<{ fen: string; path: string[] }> = [{ fen: START_FEN, path: [] }];
    while (queue.length > 0) {
        const { fen, path } = queue.shift()!;
        const key = positionKey(fen);
        if (visited.has(key)) continue;
        visited.add(key);
        const position: BookPosition | undefined = book.positions.get(key);
        if (!position || position.games < threshold) continue;
        if (sideToMove(fen) === book.color && path.length >= 4) {
            found.push({
                fen,
                path,
                games: position.games,
                reach: book.games ? (position.games / book.games) * 100 : 0,
                moves: position.moves,
            });
        }
        for (const move of position.moves) {
            if (move.games < threshold) continue;
            const next = playUci(fen, move.uci);
            if (next) queue.push({ fen: next.fen, path: [...path, next.uci] });
        }
    }
    // Common first, with a bonus for depth: the first positions are reached by nearly every game.
    return found
        .sort((a, b) => b.games * (1 + b.path.length / 8) - a.games * (1 + a.path.length / 8))
        .slice(0, limit);
}

/** Difficulty of each position for a player of `elo`: own moves when enough, else Maia. */
export async function rateKeyPositions(
    positions: KeyPosition[],
    deps: { evaluator: EngineEvaluator; maia?: MaiaSampler; signal?: AbortSignal },
    onProgress?: (done: number, total: number) => void,
): Promise<RatedKeyPosition[]> {
    const views = await deps.evaluator.evaluate(positions.map((position) => position.fen));
    onProgress?.(positions.length / 2, positions.length);
    const needMaia = positions.filter((position) => position.games < MIN_OWN_GAMES);
    const sampled =
        deps.maia && needMaia.length
            ? await deps.maia.frequencies(needMaia.map((position) => position.fen))
            : [];
    if (deps.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    onProgress?.(positions.length, positions.length);
    return positions
        .map((position, index) => {
            const view = views[index];
            if (!view) return { ...position, difficulty: null, bestSan: null, bestShare: null };
            const own = position.games >= MIN_OWN_GAMES;
            const frequencies = own
                ? position.moves.map((move) => ({ uci: move.uci, count: move.games }))
                : (sampled[needMaia.indexOf(position)] ?? []);
            const found = frequencies.length
                ? difficulty(view, frequencies, own ? "games" : "maia")
                : null;
            const best = view.lines[0];
            const bestMove = position.moves.find((move) => move.uci === best?.uci);
            return {
                ...position,
                difficulty: found,
                bestSan: best ? (playUci(position.fen, best.uci)?.san ?? null) : null,
                bestShare: best ? ((bestMove?.games ?? 0) / position.games) * 100 : null,
            };
        })
        .sort(
            (a, b) =>
                (a.difficulty?.keepProbability ?? 2) - (b.difficulty?.keepProbability ?? 2) ||
                b.games - a.games,
        );
}
