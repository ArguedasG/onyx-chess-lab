import { z } from "zod";

/** Rhythms of a game, as Lichess estimates them: base + 40 × increment. */
export type Rhythm = "bullet" | "blitz" | "rapid" | "classical";
/** Rhythms with a rating against the bots; bullet games are always friendly. */
export type RatedRhythm = Exclude<Rhythm, "bullet">;
export const RATED_RHYTHMS: readonly RatedRhythm[] = ["blitz", "rapid", "classical"];

export function rhythmOf(baseSeconds: number, incrementSeconds: number): Rhythm {
    const estimated = baseSeconds + 40 * incrementSeconds;
    if (estimated < 180) return "bullet";
    if (estimated < 480) return "blitz";
    if (estimated < 1500) return "rapid";
    return "classical";
}

/**
 * Correction of the displayed bot ratings, applied before the rhythm formula. It never changes how
 * a bot plays (its engine Elo); if the evaluation shows the bots are weaker than their numbers,
 * all of them are lowered here at once (for example, -200).
 */
export const BOT_RATING_DISPLAY_OFFSET = 0;

/**
 * The rating of a bot at a rhythm. A bot plays the same at any rhythm, and its Elo is a Lichess
 * blitz level; a human has more time to use in slower games, so the same play is worth less there.
 * Rapid and classical: the rating a human would need at that rhythm to score 50 % against the bot
 * (see docs/bots-phase-9-1.es.md).
 */
export function botRatingAt(elo: number, rhythm: Rhythm): number {
    const shown = elo + BOT_RATING_DISPLAY_OFFSET;
    const above = shown - 1000;
    switch (rhythm) {
        case "rapid":
            return Math.round(shown - (100 + 0.07 * above));
        case "classical":
            return Math.round(shown - (175 + 0.15 * above));
        default:
            return shown;
    }
}

// Glicko-2 (Glickman, 2012), one rating period per game, as Lichess does.
const SCALE = 173.7178;
const TAU = 0.5;
const INITIAL_RATING = 1500;
const INITIAL_DEVIATION = 350;
const INITIAL_VOLATILITY = 0.06;
const MIN_DEVIATION = 45;
/** The bots' ratings are fixed references, known with this deviation. */
const BOT_DEVIATION = 60;
/** Above this deviation a rating is shown as provisional, as on Lichess. */
export const PROVISIONAL_DEVIATION = 110;

export const playerRatingSchema = z.object({
    rating: z.number(),
    deviation: z.number(),
    volatility: z.number(),
    games: z.number().int().nonnegative(),
    updatedAt: z.string().nullable(),
});
export type PlayerRating = z.infer<typeof playerRatingSchema>;

export const ratingEventSchema = z.object({
    gameId: z.string(),
    recordedAt: z.string(),
    rhythm: z.enum(["blitz", "rapid", "classical"]),
    profileId: z.string(),
    botRating: z.number(),
    score: z.number(),
    before: z.number(),
    after: z.number(),
});
export type RatingEvent = z.infer<typeof ratingEventSchema>;

export const botRatingsStateSchema = z.object({
    schemaVersion: z.literal(1),
    ratings: z.object({
        blitz: playerRatingSchema,
        rapid: playerRatingSchema,
        classical: playerRatingSchema,
    }),
    events: z.array(ratingEventSchema),
});
export type BotRatingsState = z.infer<typeof botRatingsStateSchema>;

export const INITIAL_PLAYER_RATING: PlayerRating = {
    rating: INITIAL_RATING,
    deviation: INITIAL_DEVIATION,
    volatility: INITIAL_VOLATILITY,
    games: 0,
    updatedAt: null,
};

export const EMPTY_BOT_RATINGS: BotRatingsState = {
    schemaVersion: 1,
    ratings: {
        blitz: INITIAL_PLAYER_RATING,
        rapid: INITIAL_PLAYER_RATING,
        classical: INITIAL_PLAYER_RATING,
    },
    events: [],
};

export function isProvisional(rating: PlayerRating): boolean {
    return rating.deviation > PROVISIONAL_DEVIATION;
}

/** New rating after one game with `score` (1, 0.5 or 0) against an opponent of fixed rating. */
export function updateRating(
    player: PlayerRating,
    opponentRating: number,
    score: number,
    at: string,
): PlayerRating {
    const mu = (player.rating - INITIAL_RATING) / SCALE;
    const phi = player.deviation / SCALE;
    const sigma = player.volatility;
    const muJ = (opponentRating - INITIAL_RATING) / SCALE;
    const phiJ = BOT_DEVIATION / SCALE;

    const g = 1 / Math.sqrt(1 + (3 * phiJ * phiJ) / (Math.PI * Math.PI));
    const expected = 1 / (1 + Math.exp(-g * (mu - muJ)));
    const variance = 1 / (g * g * expected * (1 - expected));
    const delta = variance * g * (score - expected);

    // New volatility (Illinois algorithm).
    const a = Math.log(sigma * sigma);
    const f = (x: number) => {
        const ex = Math.exp(x);
        const denominator = phi * phi + variance + ex;
        return (
            (ex * (delta * delta - phi * phi - variance - ex)) / (2 * denominator * denominator) -
            (x - a) / (TAU * TAU)
        );
    };
    let lower = a;
    let upper: number;
    if (delta * delta > phi * phi + variance) {
        upper = Math.log(delta * delta - phi * phi - variance);
    } else {
        let k = 1;
        while (f(a - k * TAU) < 0) k += 1;
        upper = a - k * TAU;
    }
    let fLower = f(lower);
    let fUpper = f(upper);
    for (let i = 0; i < 100 && Math.abs(upper - lower) > 1e-6; i++) {
        const c = lower + ((lower - upper) * fLower) / (fUpper - fLower);
        const fC = f(c);
        if (fC * fUpper <= 0) {
            lower = upper;
            fLower = fUpper;
        } else {
            fLower /= 2;
        }
        upper = c;
        fUpper = fC;
    }
    const newSigma = Math.exp(lower / 2);

    const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
    const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / variance);
    const newMu = mu + newPhi * newPhi * g * (score - expected);

    return {
        rating: newMu * SCALE + INITIAL_RATING,
        deviation: Math.max(MIN_DEVIATION, newPhi * SCALE),
        volatility: newSigma,
        games: player.games + 1,
        updatedAt: at,
    };
}

/** Records a rated game; a game already recorded is ignored. */
export function applyRatedGame(
    state: BotRatingsState,
    game: {
        gameId: string;
        recordedAt: string;
        rhythm: RatedRhythm;
        profileId: string;
        botRating: number;
        score: number;
    },
): { state: BotRatingsState; event: RatingEvent | null } {
    if (state.events.some((event) => event.gameId === game.gameId)) {
        return { state, event: null };
    }
    const before = state.ratings[game.rhythm];
    const after = updateRating(before, game.botRating, game.score, game.recordedAt);
    const event: RatingEvent = {
        ...game,
        before: Math.round(before.rating),
        after: Math.round(after.rating),
    };
    return {
        state: {
            ...state,
            ratings: { ...state.ratings, [game.rhythm]: after },
            events: [event, ...state.events],
        },
        event,
    };
}

/** Why a game against a bot cannot be rated, or `null` when it can. */
export type RatedGameBlocker =
    | "notAgainstBot"
    | "guided"
    | "customPosition"
    | "noClock"
    | "differentClocks"
    | "bullet"
    | "openingBook"
    | "noVerifier";

export type ClockSetting = { seconds: number; increment?: number } | undefined;

/** Rhythm of a clock whose times are in milliseconds, as the game setup stores them. */
export function rhythmOfClock(clock: NonNullable<ClockSetting>): Rhythm {
    return rhythmOf(clock.seconds / 1000, (clock.increment ?? 0) / 1000);
}

export function ratedGameBlocker(setup: {
    againstCatalogBot: boolean;
    /** Guided play (I-52) is a help, so the game cannot be rated. */
    guided?: boolean;
    fromStartPosition: boolean;
    playerClock: ClockSetting;
    botClock: ClockSetting;
    openingBook: boolean;
    verifier: boolean;
}): RatedGameBlocker | null {
    if (!setup.againstCatalogBot) return "notAgainstBot";
    if (setup.guided) return "guided";
    if (!setup.fromStartPosition) return "customPosition";
    if (!setup.playerClock || !setup.botClock) return "noClock";
    if (
        setup.playerClock.seconds !== setup.botClock.seconds ||
        (setup.playerClock.increment ?? 0) !== (setup.botClock.increment ?? 0)
    )
        return "differentClocks";
    if (rhythmOfClock(setup.playerClock) === "bullet") return "bullet";
    // A shared opening book would replace the bot's own repertoire.
    if (setup.openingBook) return "openingBook";
    // Without Stockfish the bot plays without its style and strength filter.
    if (!setup.verifier) return "noVerifier";
    return null;
}
