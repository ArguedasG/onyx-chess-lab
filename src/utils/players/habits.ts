/**
 * Psychology, clock and error ranges of a player (I-44). Everything here describes the games; none
 * of it is a psychological diagnosis, and every figure keeps its sample.
 */
import {
    PLAYER_MOVE_RANGES,
    type PlayerClockBand,
    type PlayerEngineAnalysis,
    type PlayerMoveErrors,
} from "@/utils/playerAnalysis";
import { getWinChance } from "@/utils/score";
import { chronological, type ProfileGame } from "./profileGames";
import { resultBucket, type ResultBucket } from "./results";

/** Statements about a group need at least this many games. */
export const MIN_HABIT_GAMES = 10;

/**
 * A loss with the loser to move, no mate on the board and this many seconds or less on the
 * loser's last recorded clock reads as a probable time loss. The database does not store how a
 * game ended, so resignations and time losses can only be told apart this way.
 */
export const PROBABLE_TIME_LOSS_SECONDS = 15;

/** The engine's final evaluation of a "not lost" position: −1.5 or better for the player. */
export const NOT_LOST_WIN_CHANCE = getWinChance(-150);

export type AfterResultStats = {
    overall: ResultBucket;
    /** Next game played the same day after a loss, a win or a draw. */
    afterLoss: ResultBucket;
    afterWin: ResultBucket;
    afterDraw: ResultBucket;
};

/** Results of the next game of the same day, by the result of the previous one. */
export function resultsAfterResult(games: readonly ProfileGame[]): AfterResultStats {
    const ordered = chronological(games);
    const after = {
        loss: [] as ProfileGame[],
        win: [] as ProfileGame[],
        draw: [] as ProfileGame[],
    };
    for (let index = 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1];
        const game = ordered[index];
        if (!game.day || game.day.length < 10 || game.day !== previous.day) continue;
        if (previous.outcome === "unknown") continue;
        after[previous.outcome].push(game);
    }
    return {
        overall: resultBucket("overall", games),
        afterLoss: resultBucket("afterLoss", after.loss),
        afterWin: resultBucket("afterWin", after.win),
        afterDraw: resultBucket("afterDraw", after.draw),
    };
}

export type EndingCounts = {
    /** Decisive games of this kind (losses or wins). */
    total: number;
    checkmate: number;
    /** See `PROBABLE_TIME_LOSS_SECONDS`. */
    probableTime: number;
    /** Resignation, abandonment or anything the board does not show. */
    other: number;
    /** Games with clock data, so a time loss could have been seen. */
    withClock: number;
};

const correspondence = (game: ProfileGame) =>
    game.timeControlCategory === "correspondence" || game.timeControlCategory === "daily";

export function isProbableTimeLoss(game: ProfileGame, side: "player" | "opponent"): boolean {
    if (game.ending !== "open" || correspondence(game)) return false;
    const loserToMove = side === "player" ? game.playerToMoveAtEnd : !game.playerToMoveAtEnd;
    const clock = side === "player" ? game.playerLastClock : game.opponentLastClock;
    return loserToMove && clock != null && clock <= PROBABLE_TIME_LOSS_SECONDS;
}

/** How the player's losses (or wins) ended. */
export function endings(games: readonly ProfileGame[], outcome: "loss" | "win"): EndingCounts {
    const side = outcome === "loss" ? "player" : "opponent";
    const counts: EndingCounts = {
        total: 0,
        checkmate: 0,
        probableTime: 0,
        other: 0,
        withClock: 0,
    };
    for (const game of games) {
        if (game.outcome !== outcome) continue;
        counts.total += 1;
        const clock = side === "player" ? game.playerLastClock : game.opponentLastClock;
        if (clock != null) counts.withClock += 1;
        if (game.ending === "checkmate") counts.checkmate += 1;
        else if (isProbableTimeLoss(game, side)) counts.probableTime += 1;
        else counts.other += 1;
    }
    return counts;
}

/** Aggregates of the engine-only habits, over the analyzed games inside the card filters. */
export type EngineHabits = {
    analyzedGames: number;
    clockBands: { games: number; bands: Record<PlayerClockBand, PlayerMoveErrors> } | null;
    fastMoves: { games: number; fast: PlayerMoveErrors; other: PlayerMoveErrors } | null;
    moveRanges: { games: number; ranges: PlayerMoveErrors[] } | null;
    /**
     * Losses without mate or probable time loss whose final position the engine did not consider
     * lost (`NOT_LOST_WIN_CHANCE`): resignations, abandonment or losses on time without a clock.
     */
    notLostLosses: { losses: number; notLost: ProfileGame[] } | null;
};

const addErrors = (target: PlayerMoveErrors, value: PlayerMoveErrors) => {
    target.moves += value.moves;
    target.errors += value.errors;
};

export function engineHabits(
    engine: PlayerEngineAnalysis | null | undefined,
    games: readonly ProfileGame[],
): EngineHabits | null {
    if (!engine) return null;
    const byKey = new Map(games.map((game) => [game.key, game]));
    const analyzed = engine.games.filter((metrics) => byKey.has(metrics.key));
    if (analyzed.length === 0) return null;
    const empty = (): PlayerMoveErrors => ({ moves: 0, errors: 0 });
    const bands: Record<PlayerClockBand, PlayerMoveErrors> = {
        low: empty(),
        middle: empty(),
        high: empty(),
    };
    const fast = { fast: empty(), other: empty() };
    const ranges = PLAYER_MOVE_RANGES.map(empty);
    let bandGames = 0;
    let fastGames = 0;
    let rangeGames = 0;
    let losses = 0;
    const notLost: ProfileGame[] = [];
    for (const metrics of analyzed) {
        const game = byKey.get(metrics.key)!;
        if (metrics.clockBands) {
            bandGames += 1;
            for (const band of ["low", "middle", "high"] as const)
                addErrors(bands[band], metrics.clockBands[band]);
        }
        if (metrics.fastMoves) {
            fastGames += 1;
            addErrors(fast.fast, metrics.fastMoves.fast);
            addErrors(fast.other, metrics.fastMoves.other);
        }
        if (metrics.moveRanges) {
            rangeGames += 1;
            metrics.moveRanges.forEach(
                (value, index) => ranges[index] && addErrors(ranges[index], value),
            );
        }
        if (
            game.outcome === "loss" &&
            game.ending === "open" &&
            !isProbableTimeLoss(game, "player") &&
            metrics.finalWinChance !== undefined
        ) {
            losses += 1;
            if (metrics.finalWinChance >= NOT_LOST_WIN_CHANCE) notLost.push(game);
        }
    }
    return {
        analyzedGames: analyzed.length,
        clockBands: bandGames ? { games: bandGames, bands } : null,
        fastMoves: fastGames ? { games: fastGames, ...fast } : null,
        moveRanges: rangeGames ? { games: rangeGames, ranges } : null,
        notLostLosses: losses ? { losses, notLost } : null,
    };
}

/** Mistakes and blunders per 100 moves. */
export function errorRate(value: PlayerMoveErrors): number | null {
    return value.moves ? (value.errors / value.moves) * 100 : null;
}

/** Below this many moves a range or band is shown but not compared. */
export const MIN_RATE_MOVES = 60;

/**
 * Range with the highest error rate when it clearly stands out (half again the overall rate and
 * enough moves), for a one-line conclusion. `null` when nothing stands out.
 */
export function standoutRange(
    ranges: readonly PlayerMoveErrors[],
): { index: number; rate: number; overall: number } | null {
    const total = ranges.reduce(
        (sum, value) => ({ moves: sum.moves + value.moves, errors: sum.errors + value.errors }),
        { moves: 0, errors: 0 },
    );
    const overall = errorRate(total);
    if (overall === null || overall === 0) return null;
    let best: { index: number; rate: number } | null = null;
    ranges.forEach((value, index) => {
        const rate = errorRate(value);
        if (rate === null || value.moves < MIN_RATE_MOVES) return;
        if (!best || rate > best.rate) best = { index, rate };
    });
    const found = best as { index: number; rate: number } | null;
    return found && found.rate >= overall * 1.5 ? { ...found, overall } : null;
}
