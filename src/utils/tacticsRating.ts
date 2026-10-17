/**
 * Local tactical rating (I-06): Glicko-2 against the rating of each Lichess puzzle, as Lichess
 * rates its own puzzles. One puzzle is one rating period. Only the first try of a puzzle counts,
 * and only in the trainer's free and countdown modes: storm and streak rise on purpose and would
 * distort it.
 */

export type TacticsRating = {
    rating: number;
    deviation: number;
    volatility: number;
    games: number;
    /** Recent ratings, oldest first, for the trend. */
    history: Array<{ at: string; rating: number }>;
};

export const INITIAL_TACTICS_RATING: TacticsRating = {
    rating: 1500,
    deviation: 350,
    volatility: 0.06,
    games: 0,
    history: [],
};

const SCALE = 173.7178;
const TAU = 0.5;
/** Lichess keeps puzzle deviations from shrinking below this, so the rating keeps moving. */
const MIN_DEVIATION = 50;
const MAX_DEVIATION = 350;
const HISTORY = 300;
/** A rating is shown as provisional until its deviation drops below this. */
export const PROVISIONAL_DEVIATION = 110;

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const expected = (mu: number, muJ: number, phiJ: number) =>
    1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/** New volatility (step 5 of Glickman's paper, Illinois algorithm). */
function newVolatility(phi: number, sigma: number, delta: number, v: number) {
    const a = Math.log(sigma * sigma);
    const f = (x: number) => {
        const ex = Math.exp(x);
        return (
            (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) -
            (x - a) / (TAU * TAU)
        );
    };
    let lower = a;
    let upper: number;
    if (delta * delta > phi * phi + v) {
        upper = Math.log(delta * delta - phi * phi - v);
    } else {
        let k = 1;
        while (f(a - k * TAU) < 0) k += 1;
        upper = a - k * TAU;
    }
    let fLower = f(lower);
    let fUpper = f(upper);
    for (let iteration = 0; iteration < 100 && Math.abs(upper - lower) > 1e-6; iteration++) {
        const candidate = lower + ((lower - upper) * fLower) / (fUpper - fLower);
        const fCandidate = f(candidate);
        if (fCandidate * fUpper <= 0) {
            lower = upper;
            fLower = fUpper;
        } else {
            fLower /= 2;
        }
        upper = candidate;
        fUpper = fCandidate;
    }
    return Math.exp(lower / 2);
}

export function updateTacticsRating(
    current: TacticsRating,
    puzzle: { rating: number; deviation: number },
    solved: boolean,
    at = new Date(),
): TacticsRating {
    const mu = (current.rating - 1500) / SCALE;
    const phi = current.deviation / SCALE;
    const muJ = (puzzle.rating - 1500) / SCALE;
    const phiJ = Math.max(puzzle.deviation, 1) / SCALE;
    const score = solved ? 1 : 0;
    const e = expected(mu, muJ, phiJ);
    const v = 1 / (g(phiJ) ** 2 * e * (1 - e));
    const delta = v * g(phiJ) * (score - e);
    const sigma = newVolatility(phi, current.volatility, delta, v);
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
    const muNew = mu + phiNew * phiNew * g(phiJ) * (score - e);
    const rating = Math.round(muNew * SCALE + 1500);
    return {
        rating,
        deviation: Math.min(MAX_DEVIATION, Math.max(MIN_DEVIATION, phiNew * SCALE)),
        volatility: sigma,
        games: current.games + 1,
        history: [...current.history, { at: at.toISOString(), rating }].slice(-HISTORY),
    };
}

/** Rating band around the student's level, for the trainer's "my level" button. */
export function ratingBandFor(rating: TacticsRating, width = 150): [number, number] {
    const center = Math.round(rating.rating / 50) * 50;
    return [Math.max(400, center - width), Math.min(3200, center + width)];
}
