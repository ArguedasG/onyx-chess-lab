/** Frequent rivals, nemesis and favourite opponent, and head-to-head records (I-45). */
import type { PlayerAnalysisSource } from "@/utils/playerAnalysis";
import { MIN_RATING_PAR_GAMES } from "@/utils/ratingPar";
import type { ProfileGame } from "./profileGames";
import { resultBucket, type ResultBucket } from "./results";

/** Nemesis and favourite opponent need at least this many games against the player. */
export const MIN_RIVAL_GAMES = 5;

export type RivalSummary = ResultBucket & {
    /** `databasePath:opponentId`. */
    key: string;
    name: string;
    databasePath: string;
    opponentId: number;
    lastDay: string | null;
};

export function rivalKey(game: ProfileGame): string {
    return `${game.source.databasePath}:${game.opponentId}`;
}

export function rivals(games: readonly ProfileGame[]): RivalSummary[] {
    const groups = new Map<string, ProfileGame[]>();
    for (const game of games) {
        // Player id 0 is "Unknown" in every database.
        if (game.opponentId === 0) continue;
        const key = rivalKey(game);
        const values = groups.get(key);
        if (values) values.push(game);
        else groups.set(key, [game]);
    }
    return [...groups.entries()]
        .map(([key, values]) => ({
            ...resultBucket(key, values),
            key,
            name: values[0].opponent || "?",
            databasePath: values[0].source.databasePath,
            opponentId: values[0].opponentId,
            lastDay: values.reduce<string | null>(
                (latest, game) => (game.day && (!latest || game.day > latest) ? game.day : latest),
                null,
            ),
        }))
        .sort((a, b) => b.games - a.games || (b.lastDay ?? "").localeCompare(a.lastDay ?? ""));
}

/**
 * How the player does against a rival relative to what is expected: the rating par when enough
 * games are rated (so a strong rival is not a nemesis just for being strong), otherwise the score
 * against an even 50 %.
 */
export function rivalBalance(rival: ResultBucket): number | null {
    if (rival.parDelta != null && rival.ratedGames >= Math.min(MIN_RATING_PAR_GAMES, rival.games))
        return rival.parDelta;
    return rival.scorePercent == null ? null : rival.scorePercent - 50;
}

/** The rival the player does worst against, and the one they do best against. */
export function nemesisAndFavourite(list: readonly RivalSummary[]): {
    nemesis: RivalSummary | null;
    favourite: RivalSummary | null;
} {
    const eligible = list
        .filter((rival) => rival.games >= MIN_RIVAL_GAMES && rivalBalance(rival) !== null)
        .sort((a, b) => rivalBalance(a)! - rivalBalance(b)! || b.games - a.games);
    const nemesis = eligible[0] && rivalBalance(eligible[0])! < 0 ? eligible[0] : null;
    const last = eligible.at(-1);
    const favourite = last && last !== nemesis && rivalBalance(last)! > 0 ? last : null;
    return { nemesis, favourite };
}

/**
 * Games of `games` against any of the `opponents` records: from a rival's card, the games against
 * the user's own records in the same databases.
 */
export function gamesAgainst(
    games: readonly ProfileGame[],
    opponents: readonly PlayerAnalysisSource[],
): ProfileGame[] {
    const keys = new Set(opponents.map((source) => `${source.databasePath}:${source.playerId}`));
    return games.filter((game) => keys.has(rivalKey(game)));
}
