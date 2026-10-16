/**
 * "Rating par" (I-30): a score next to the one the Elo difference predicts, so "38 % with this
 * line" can be read. Only games with both ratings and a known result count, on both sides of the
 * comparison.
 */

/** Below this many rated games the difference is shown as a number but not interpreted. */
export const MIN_RATING_PAR_GAMES = 10;

/** Expected score (0–1) of a player against an opponent, by the Elo formula. */
export function expectedScore(playerElo: number, opponentElo: number): number {
    return 1 / (1 + 10 ** ((opponentElo - playerElo) / 400));
}

export type RatingPar = {
    /** Games with both ratings and a known result. */
    ratedGames: number;
    /** Score of those games, in percent. */
    ratedScorePercent: number | null;
    /** Score the Elo differences of those games predict, in percent. */
    expectedPercent: number | null;
    /** `ratedScorePercent - expectedPercent`, in percentage points. */
    parDelta: number | null;
};

export type RatingParAccumulator = { ratedGames: number; points: number; expected: number };

export function emptyRatingPar(): RatingParAccumulator {
    return { ratedGames: 0, points: 0, expected: 0 };
}

/** Adds one game; `points` is 1, 0.5 or 0, `null` when the result is unknown. */
export function addRatingParGame(
    accumulator: RatingParAccumulator,
    playerElo: number | null | undefined,
    opponentElo: number | null | undefined,
    points: number | null,
) {
    if (playerElo == null || opponentElo == null || points == null) return;
    if (playerElo <= 0 || opponentElo <= 0) return;
    accumulator.ratedGames += 1;
    accumulator.points += points;
    accumulator.expected += expectedScore(playerElo, opponentElo);
}

export function finishRatingPar(accumulator: RatingParAccumulator): RatingPar {
    if (accumulator.ratedGames === 0) {
        return { ratedGames: 0, ratedScorePercent: null, expectedPercent: null, parDelta: null };
    }
    const ratedScorePercent = (accumulator.points / accumulator.ratedGames) * 100;
    const expectedPercent = (accumulator.expected / accumulator.ratedGames) * 100;
    return {
        ratedGames: accumulator.ratedGames,
        ratedScorePercent,
        expectedPercent,
        parDelta: ratedScorePercent - expectedPercent,
    };
}

/** "+4.2" / "−3.0" / "0.0" in percentage points. */
export function formatParDelta(delta: number | null | undefined): string {
    if (delta == null) return "—";
    const rounded = Math.round(delta * 10) / 10;
    if (rounded === 0) return "0.0";
    return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}`;
}
