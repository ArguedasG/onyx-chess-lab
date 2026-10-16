/**
 * Practical difficulty of the user's own repertoire (I-33, third use): the positions of a
 * repertoire where it is the user's turn, and the chance that a player of their level keeps the
 * evaluation there. The lowest ones are the first to train.
 */
import type { EngineEvaluator, MaiaSampler } from "@/utils/repertoireGenerator/engines";
import { playUci, positionKey, sideToMove } from "@/utils/repertoireGenerator/positions";
import { difficulty, engineLoss, goodMoves } from "@/utils/repertoireGenerator/scoring";
import type { Difficulty, GeneratorColor } from "@/utils/repertoireGenerator/types";
import type { OpeningsState } from "@/utils/trainingAreas";
import { START_FEN } from "./book";

export const MAX_REPERTOIRE_POSITIONS = 40;

export type RepertoirePosition = {
    fen: string;
    path: string[];
    /** The prepared move(s) of the user in the position. */
    prepared: Array<{ uci: string; san: string }>;
    /** Lines of the repertoire through the position, and one of them to practise. */
    lines: number;
    lineId: string;
    variantId: string;
};

export type RatedRepertoirePosition = RepertoirePosition & {
    difficulty: Difficulty | null;
    /** Engine loss of the prepared move, when the engine listed it; null if unknown. */
    preparedLoss: number | null;
    /** The prepared move is not among those that keep the evaluation. */
    preparedIsDubious: boolean;
};

/** The user's turns in the theory lines of a repertoire, the most shared first. */
export function repertoirePositions(
    openings: OpeningsState,
    repertoireId: string,
    color: GeneratorColor,
    limit = MAX_REPERTOIRE_POSITIONS,
): RepertoirePosition[] {
    const repertoire = openings.repertoires[repertoireId];
    if (!repertoire) return [];
    const byKey = new Map<string, RepertoirePosition>();
    for (const variantId of repertoire.variantIds) {
        const variant = openings.variants[variantId];
        if (!variant || variant.contentType !== "theory") continue;
        for (const lineId of variant.lineIds) {
            const line = openings.lines[lineId];
            if (!line) continue;
            let fen = line.fen === "start" ? START_FEN : line.fen;
            const path: string[] = [];
            for (const uci of line.moves) {
                const next = playUci(fen, uci);
                if (!next) break;
                if (sideToMove(fen) === color) {
                    const key = positionKey(fen);
                    const entry = byKey.get(key);
                    if (entry) {
                        entry.lines += 1;
                        if (!entry.prepared.some((move) => move.uci === next.uci))
                            entry.prepared.push({ uci: next.uci, san: next.san });
                    } else {
                        byKey.set(key, {
                            fen,
                            path: [...path],
                            prepared: [{ uci: next.uci, san: next.san }],
                            lines: 1,
                            lineId,
                            variantId,
                        });
                    }
                }
                path.push(next.uci);
                fen = next.fen;
            }
        }
    }
    return [...byKey.values()]
        .sort((a, b) => b.lines - a.lines || a.path.length - b.path.length)
        .slice(0, limit);
}

export async function rateRepertoirePositions(
    positions: RepertoirePosition[],
    deps: { evaluator: EngineEvaluator; maia: MaiaSampler; signal?: AbortSignal },
    onProgress?: (done: number, total: number) => void,
): Promise<RatedRepertoirePosition[]> {
    const fens = positions.map((position) => position.fen);
    const views = await deps.evaluator.evaluate(fens);
    onProgress?.(1, 3);
    const sampled: Array<Array<{ uci: string; count: number }>> = [];
    const chunk = 10;
    for (let start = 0; start < fens.length; start += chunk) {
        if (deps.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
        sampled.push(...(await deps.maia.frequencies(fens.slice(start, start + chunk))));
        onProgress?.(1 + (start + chunk) / fens.length, 3);
    }
    onProgress?.(3, 3);
    return positions
        .map((position, index) => {
            const view = views[index];
            const found =
                view && sampled[index]?.length ? difficulty(view, sampled[index], "maia") : null;
            const good = view ? new Set(goodMoves(view)) : null;
            const losses = view
                ? position.prepared
                      .map((move) => engineLoss(view, move.uci))
                      .filter((loss): loss is number => loss !== null)
                : [];
            return {
                ...position,
                difficulty: found,
                preparedLoss: losses.length ? Math.min(...losses) : null,
                // Only when the engine listed the prepared move: an unlisted one is unknown, not bad.
                preparedIsDubious: Boolean(
                    good &&
                    losses.length > 0 &&
                    !position.prepared.some((move) => good.has(move.uci)),
                ),
            };
        })
        .sort(
            (a, b) =>
                (a.difficulty?.keepProbability ?? 2) - (b.difficulty?.keepProbability ?? 2) ||
                b.lines - a.lines,
        );
}
