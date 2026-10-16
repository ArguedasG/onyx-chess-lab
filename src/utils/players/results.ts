import { openingLevelKey, openingNameLevels } from "@/utils/openingFamilies";
import {
    addRatingParGame,
    emptyRatingPar,
    finishRatingPar,
    type RatingPar,
} from "@/utils/ratingPar";
import type { PlayerAnalysisTimeControl } from "@/utils/playerAnalysis";
import type { ProfileGame } from "./profileGames";

/** Results of a group of games, with the score the Elo differences predict (I-30). */
export type ResultBucket = RatingPar & {
    key: string;
    games: number;
    wins: number;
    draws: number;
    losses: number;
    unknown: number;
    scorePercent: number | null;
    averageOpponentElo: number | null;
    averagePlayerElo: number | null;
};

export function resultBucket(key: string, games: readonly ProfileGame[]): ResultBucket {
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let unknown = 0;
    let opponentElo = 0;
    let opponentRated = 0;
    let playerElo = 0;
    let playerRated = 0;
    const par = emptyRatingPar();
    for (const game of games) {
        if (game.outcome === "win") wins += 1;
        else if (game.outcome === "draw") draws += 1;
        else if (game.outcome === "loss") losses += 1;
        else unknown += 1;
        if (game.opponentElo) {
            opponentElo += game.opponentElo;
            opponentRated += 1;
        }
        if (game.playerElo) {
            playerElo += game.playerElo;
            playerRated += 1;
        }
        addRatingParGame(par, game.playerElo, game.opponentElo, game.points);
    }
    const known = wins + draws + losses;
    return {
        key,
        games: games.length,
        wins,
        draws,
        losses,
        unknown,
        scorePercent: known ? ((wins + draws / 2) / known) * 100 : null,
        averageOpponentElo: opponentRated ? opponentElo / opponentRated : null,
        averagePlayerElo: playerRated ? playerElo / playerRated : null,
        ...finishRatingPar(par),
    };
}

export function groupResults(
    games: readonly ProfileGame[],
    keyOf: (game: ProfileGame) => string | null,
): ResultBucket[] {
    const groups = new Map<string, ProfileGame[]>();
    for (const game of games) {
        const key = keyOf(game);
        if (key === null) continue;
        const values = groups.get(key);
        if (values) values.push(game);
        else groups.set(key, [game]);
    }
    return [...groups.entries()]
        .map(([key, values]) => resultBucket(key, values))
        .sort((a, b) => b.games - a.games || a.key.localeCompare(b.key));
}

/** Opening name of a game, from its moves; the ECO code when the moves name nothing. */
export function openingOf(game: ProfileGame): string {
    return game.opening || game.eco || "";
}

/**
 * Leaves (full names) and groups (family and family + variation) of one color, for
 * `buildOpeningTree`: every level gets the exact results of its own games.
 */
export function openingBuckets(games: readonly ProfileGame[], color: "white" | "black") {
    const own = games.filter((game) => game.isWhite === (color === "white"));
    const leaves = groupResults(own, (game) => openingOf(game) || null);
    const groups = [1, 2].flatMap((depth) =>
        groupResults(own, (game) => {
            const levels = openingNameLevels(openingOf(game));
            return levels.length >= depth ? openingLevelKey(levels.slice(0, depth)) : null;
        }),
    );
    return { games: own.length, leaves, groups };
}

/** Games per month ("2024-05"), oldest first, including the empty months in between. */
export function activityByMonth(
    games: readonly ProfileGame[],
): Array<{ month: string; games: number }> {
    const counts = new Map<string, number>();
    for (const game of games) {
        if (!game.day || game.day.length < 7) continue;
        const month = game.day.slice(0, 7);
        counts.set(month, (counts.get(month) ?? 0) + 1);
    }
    if (counts.size === 0) return [];
    const months = [...counts.keys()].sort();
    const [firstYear, firstMonth] = months[0].split("-").map(Number);
    const [lastYear, lastMonth] = months.at(-1)!.split("-").map(Number);
    const result: Array<{ month: string; games: number }> = [];
    for (
        let year = firstYear, month = firstMonth;
        year < lastYear || (year === lastYear && month <= lastMonth);
    ) {
        const key = `${year}-${String(month).padStart(2, "0")}`;
        result.push({ month: key, games: counts.get(key) ?? 0 });
        month += 1;
        if (month > 12) {
            month = 1;
            year += 1;
        }
    }
    return result;
}

/** Last known rating of each month, per time-control category. */
export function ratingHistory(
    games: readonly ProfileGame[],
): Array<{ month: string } & Partial<Record<PlayerAnalysisTimeControl, number>>> {
    const byMonth = new Map<
        string,
        Map<PlayerAnalysisTimeControl, { order: string; elo: number }>
    >();
    for (const game of games) {
        if (!game.playerElo || !game.day || game.day.length < 7) continue;
        const month = game.day.slice(0, 7);
        const order = `${game.day}|${game.time ?? ""}|${String(game.id).padStart(10, "0")}`;
        const ratings = byMonth.get(month) ?? new Map();
        const previous = ratings.get(game.timeControlCategory);
        if (!previous || previous.order < order)
            ratings.set(game.timeControlCategory, { order, elo: game.playerElo });
        byMonth.set(month, ratings);
    }
    return [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, ratings]) => ({
            month,
            ...Object.fromEntries([...ratings.entries()].map(([key, value]) => [key, value.elo])),
        }));
}

export type RatingSummary = {
    timeControl: PlayerAnalysisTimeControl;
    current: number;
    peak: number;
    peakDay: string | null;
    games: number;
};

/** Latest and highest rating per time-control category, most played first. */
export function ratingSummaries(games: readonly ProfileGame[]): RatingSummary[] {
    const result = new Map<PlayerAnalysisTimeControl, RatingSummary & { order: string }>();
    for (const game of games) {
        if (!game.playerElo) continue;
        const order = `${game.day ?? "0000"}|${game.time ?? ""}|${String(game.id).padStart(10, "0")}`;
        const entry = result.get(game.timeControlCategory);
        if (!entry) {
            result.set(game.timeControlCategory, {
                timeControl: game.timeControlCategory,
                current: game.playerElo,
                peak: game.playerElo,
                peakDay: game.day,
                games: 1,
                order,
            });
            continue;
        }
        entry.games += 1;
        if (order > entry.order) {
            entry.order = order;
            entry.current = game.playerElo;
        }
        if (game.playerElo > entry.peak) {
            entry.peak = game.playerElo;
            entry.peakDay = game.day;
        }
    }
    return [...result.values()]
        .map(({ order: _, ...summary }) => summary)
        .sort((a, b) => b.games - a.games);
}
