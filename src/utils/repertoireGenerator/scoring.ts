/**
 * Pure choices of the repertoire generator: prudent scores, opponent replies and the practical
 * difficulty of a position. No I/O, so every rule is tested.
 */
import { getWinChance } from "@/utils/score";
import type {
    Difficulty,
    EngineView,
    GeneratorColor,
    GeneratorFocus,
    MoveStats,
    OpponentConfig,
    SourceMove,
    SourcePosition,
} from "./types";

/** z for a one-sided 90 % bound: prudent without discarding every move with few games. */
const Z = 1.2816;

/** Lower bound of the Wilson interval of a proportion (0–1). */
export function wilsonLower(successes: number, total: number, z = Z): number {
    if (total <= 0) return 0;
    const p = successes / total;
    const z2 = z * z;
    const centre = p + z2 / (2 * total);
    const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
    return Math.max(0, (centre - margin) / (1 + z2 / total));
}

export function wilsonUpper(successes: number, total: number, z = Z): number {
    if (total <= 0) return 1;
    return 1 - wilsonLower(total - successes, total, z);
}

/** Points of the side that plays the move. */
export function pointsFor(stats: MoveStats, color: GeneratorColor) {
    const wins = color === "white" ? stats.white : stats.black;
    const losses = color === "white" ? stats.black : stats.white;
    const known = stats.white + stats.draws + stats.black;
    return { wins, losses, draws: stats.draws, known, points: wins + stats.draws / 2 };
}

/** Score in percent of the side that plays the move. */
export function scorePercent(stats: MoveStats, color: GeneratorColor): number | null {
    const { known, points } = pointsFor(stats, color);
    return known ? (points / known) * 100 : null;
}

/** Rating par (I-30) of a move in percentage points, when its games are rated. */
export function ratingPar(stats: MoveStats): number | null {
    if (!stats.ratedGames || stats.ratedPoints == null || stats.expectedPoints == null) return null;
    return ((stats.ratedPoints - stats.expectedPoints) / stats.ratedGames) * 100;
}

/**
 * Value of a move for a statistical focus, higher is better. Draws count as half a success; the
 * prudent bound makes 30 games at 65 % lose to 3000 games at 58 %.
 */
export function focusValue(focus: GeneratorFocus, stats: MoveStats, color: GeneratorColor): number {
    const { wins, losses, draws, known } = pointsFor(stats, color);
    const halfPoints = wins * 2 + draws;
    switch (focus) {
        case "practical": {
            // With ratings, the score minus the expected one, shrunk by the sample.
            if (stats.ratedGames && stats.ratedGames >= 10) {
                const par = ratingPar(stats) ?? 0;
                return par - (100 * Z * 0.5) / Math.sqrt(stats.ratedGames);
            }
            return wilsonLower(halfPoints, known * 2) * 100 - 50;
        }
        case "score":
            return wilsonLower(halfPoints, known * 2) * 100;
        case "solid":
            return -wilsonUpper(losses, known) * 100;
        default:
            return 0;
    }
}

/**
 * Opponent replies that cover `coverage` of the games: how much theory a position needs. A
 * position where 90 % play one move needs one reply; one with five equal moves needs five.
 */
export function repliesToCover(position: SourcePosition, coverage = 0.8): number {
    const total = position.moves.reduce((sum, move) => sum + move.games, 0);
    if (total === 0) return 0;
    let covered = 0;
    let count = 0;
    for (const move of [...position.moves].sort((a, b) => b.games - a.games)) {
        covered += move.games;
        count += 1;
        if (covered / total >= coverage) break;
    }
    return count;
}

/** Opponent replies to prepare: the most played ones above the share, at most `maxReplies`. */
export function popularReplies(
    position: SourcePosition,
    opponent: OpponentConfig,
    minGames: number,
): Array<SourceMove & { share: number }> {
    const total = position.moves.reduce((sum, move) => sum + move.games, 0);
    if (total === 0) return [];
    return [...position.moves]
        .sort((a, b) => b.games - a.games)
        .map((move) => ({ ...move, share: (move.games / total) * 100 }))
        .filter(
            (move) => move.share >= opponent.minShare && move.games >= Math.min(minGames, total),
        )
        .slice(0, Math.max(1, opponent.maxReplies));
}

/** Engine loss of each move from the side to move, in centipawns (0 for the best). */
export function engineLoss(view: EngineView, uci: string): number | null {
    const line = view.lines.find((candidate) => candidate.uci === uci);
    return line ? Math.max(0, view.bestCp - line.cp) : null;
}

/** A move keeps the evaluation when it loses at most this many points of winning chances. */
export const KEEP_MARGIN = 5;

/** Moves among the engine's lines that keep the evaluation (`KEEP_MARGIN`). */
export function goodMoves(view: EngineView): string[] {
    const best = getWinChance(view.bestCp);
    return view.lines
        .filter((line) => best - getWinChance(line.cp) <= KEEP_MARGIN)
        .map((line) => line.uci);
}

/**
 * Practical difficulty (I-33): the chance that a human of the chosen level plays one of the moves
 * that keep the evaluation, from move frequencies (games or Maia samples). Moves outside the
 * engine's lines count as not keeping it, so the estimate is on the cautious side for the user.
 */
export function difficulty(
    view: EngineView,
    frequencies: Array<{ uci: string; count: number }>,
    basis: Difficulty["basis"],
): Difficulty | null {
    const sample = frequencies.reduce((sum, item) => sum + item.count, 0);
    if (sample === 0 || view.lines.length === 0) return null;
    const good = new Set(goodMoves(view));
    const kept = frequencies
        .filter((item) => good.has(item.uci))
        .reduce((sum, item) => sum + item.count, 0);
    return { keepProbability: kept / sample, goodMoves: [...good], basis, sample };
}

/** Wording of the difficulty scale: easy, demanding or a trap for the opponent. */
export function difficultyLevel(value: Difficulty): "easy" | "demanding" | "trap" {
    if (value.keepProbability >= 0.75) return "easy";
    if (value.keepProbability >= 0.45) return "demanding";
    return "trap";
}

/** Evaluation symbol of a line's end, from White's side in centipawns. */
export function evaluationSymbol(whiteCp: number): string {
    const abs = Math.abs(whiteCp);
    if (abs < 35) return "=";
    if (abs < 90) return whiteCp > 0 ? "⩲" : "⩱";
    if (abs < 200) return whiteCp > 0 ? "±" : "∓";
    return whiteCp > 0 ? "+−" : "−+";
}

/** Glyph for the user's move by its engine loss (the generator rarely keeps a loss above 50). */
export function lossGlyph(loss: number): string {
    if (loss >= 100) return "?";
    if (loss >= 50) return "?!";
    return "";
}
