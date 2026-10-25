import type { BotPlayStyleId } from "@/utils/botCatalogSpecs";
import { getHumanBotProfile, humanBotPlayStyle } from "@/utils/humanBots";
import { hashText, seededRandom } from "./random";
import type { TournamentResult } from "./types";

/**
 * The model that resolves the boards without the user (I-51, rule 6 of the performance section):
 * expected score from the Elo difference, a draw rate that grows with the level and shrinks with
 * the gap, and the play personality, which makes aggressive bots draw less. It is the same idea as
 * the Elo formula, not a game: the results are labelled as simulated wherever they appear.
 */

/** White's advantage, in Elo points. */
const WHITE_ADVANTAGE = 20;

/** Draw rate by average rating, roughly what Lichess blitz shows between equal players. */
const DRAW_RATE_BY_LEVEL: readonly [number, number][] = [
    [1000, 0.05],
    [1500, 0.07],
    [2000, 0.12],
    [2400, 0.2],
    [2800, 0.32],
];

const STYLE_DRAW_FACTOR: Record<BotPlayStyleId, number> = {
    rematador: 0.8,
    salvaje: 0.75,
    guardian: 1.25,
    acechador: 1.1,
    equilibrista: 1,
};

export function expectedScore(rating: number, opponent: number): number {
    return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

function levelDrawRate(average: number): number {
    const points = DRAW_RATE_BY_LEVEL;
    if (average <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
        const [x1, y1] = points[i];
        if (average <= x1) {
            const [x0, y0] = points[i - 1];
            return y0 + ((y1 - y0) * (average - x0)) / (x1 - x0);
        }
    }
    return points[points.length - 1][1];
}

function styleDrawFactor(participantId: string): number {
    if (participantId === "user") return 1;
    return STYLE_DRAW_FACTOR[humanBotPlayStyle(getHumanBotProfile(participantId))];
}

export type ResultProbabilities = { white: number; draw: number; black: number };

export function resultProbabilities(
    white: { id: string; rating: number },
    black: { id: string; rating: number },
): ResultProbabilities {
    const expected = expectedScore(white.rating + WHITE_ADVANTAGE, black.rating);
    const style = (styleDrawFactor(white.id) + styleDrawFactor(black.id)) / 2;
    const gap = 1 - Math.min(0.8, Math.abs(expected - 0.5) * 1.6);
    const draw = Math.min(0.6, levelDrawRate((white.rating + black.rating) / 2) * style * gap);
    const whiteWins = Math.max(0, expected - draw / 2);
    const blackWins = Math.max(0, 1 - expected - draw / 2);
    const total = whiteWins + draw + blackWins;
    return { white: whiteWins / total, draw: draw / total, black: blackWins / total };
}

/** The result of a board, reproducible from the tournament seed and the game id. */
export function simulateResult(
    white: { id: string; rating: number },
    black: { id: string; rating: number },
    tournamentSeed: number,
    gameId: string,
): TournamentResult {
    const roll = seededRandom(hashText(`${tournamentSeed}:${gameId}`))();
    const probabilities = resultProbabilities(white, black);
    if (roll < probabilities.white) return "1-0";
    if (roll < probabilities.white + probabilities.draw) return "1/2-1/2";
    return "0-1";
}
