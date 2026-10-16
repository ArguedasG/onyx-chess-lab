import type { PlayerGameRow } from "@/bindings";
import {
    type PlayerAnalysisSource,
    type PlayerAnalysisTimeControl,
    timeControlCategory,
} from "@/utils/playerAnalysis";

export type PlayerOutcome = "win" | "draw" | "loss" | "unknown";

/** A game of the player card: the database row plus what every statistic needs. */
export type ProfileGame = PlayerGameRow & {
    /** `databasePath:gameId`, the same key Player Analysis uses. */
    key: string;
    source: PlayerAnalysisSource;
    outcome: PlayerOutcome;
    /** 1, 0.5 or 0; `null` for an unknown result. */
    points: number | null;
    timeControlCategory: PlayerAnalysisTimeControl;
    /** "2024-05-01", "2024-05" or "2024" from a PGN date with unknown parts; `null` if unknown. */
    day: string | null;
    year: number | null;
};

export function outcomeOf(result: string, isWhite: boolean): PlayerOutcome {
    if (result === "1/2-1/2") return "draw";
    if (result === "1-0") return isWhite ? "win" : "loss";
    if (result === "0-1") return isWhite ? "loss" : "win";
    return "unknown";
}

/** PGN dates use dots and question marks ("2024.05.??"); this keeps the known prefix. */
export function normalizeGameDate(date: string | null | undefined): string | null {
    if (!date) return null;
    const parts = date.replaceAll("-", ".").split(".");
    const known: string[] = [];
    for (const part of parts) {
        if (!/^\d+$/.test(part)) break;
        known.push(part);
    }
    if (known.length === 0 || known[0].length !== 4) return null;
    return known.slice(0, 3).join("-");
}

export function toProfileGame(row: PlayerGameRow, source: PlayerAnalysisSource): ProfileGame {
    const outcome = outcomeOf(row.result, row.isWhite);
    const day = normalizeGameDate(row.date);
    return {
        ...row,
        key: `${source.databasePath}:${row.id}`,
        source,
        outcome,
        points: outcome === "win" ? 1 : outcome === "draw" ? 0.5 : outcome === "loss" ? 0 : null,
        timeControlCategory: timeControlCategory(row.timeControl, row.site),
        day,
        year: day ? Number(day.slice(0, 4)) : null,
    };
}

/** Sort key that keeps games in the order they were played (date, time, then id). */
export function chronologicalKey(game: ProfileGame): string {
    return `${game.day ?? "0000"}|${game.time ?? ""}|${String(game.id).padStart(10, "0")}`;
}

export function chronological(games: readonly ProfileGame[]): ProfileGame[] {
    return [...games].sort((a, b) => chronologicalKey(a).localeCompare(chronologicalKey(b)));
}

/**
 * Merges the games of several sources (a player and their manual aliases). A game between two
 * records of the same person counts once.
 */
export function mergeProfileGames(groups: ReadonlyArray<readonly ProfileGame[]>): ProfileGame[] {
    const games = new Map<string, ProfileGame>();
    for (const group of groups) for (const game of group) games.set(game.key, game);
    return [...games.values()].sort((a, b) =>
        chronologicalKey(b).localeCompare(chronologicalKey(a)),
    );
}

export type ProfilePeriod = "all" | "12m" | "3m";

export type ProfileFilters = {
    timeControl: "all" | PlayerAnalysisTimeControl;
    period: ProfilePeriod;
    color: "any" | "white" | "black";
};

export const DEFAULT_PROFILE_FILTERS: ProfileFilters = {
    timeControl: "all",
    period: "all",
    color: "any",
};

function periodStart(period: ProfilePeriod, today: Date): string | null {
    if (period === "all") return null;
    const start = new Date(today);
    start.setMonth(start.getMonth() - (period === "12m" ? 12 : 3));
    return start.toISOString().slice(0, 10);
}

export function filterProfileGames(
    games: readonly ProfileGame[],
    filters: ProfileFilters,
    today = new Date(),
): ProfileGame[] {
    const start = periodStart(filters.period, today);
    return games.filter(
        (game) =>
            (filters.timeControl === "all" || game.timeControlCategory === filters.timeControl) &&
            (filters.color === "any" || game.isWhite === (filters.color === "white")) &&
            (start === null || (game.day !== null && game.day >= start)),
    );
}

/** Time-control categories present in the games, most played first. */
export function timeControlsOf(
    games: readonly ProfileGame[],
): Array<{ value: PlayerAnalysisTimeControl; count: number }> {
    const counts = new Map<PlayerAnalysisTimeControl, number>();
    for (const game of games)
        counts.set(game.timeControlCategory, (counts.get(game.timeControlCategory) ?? 0) + 1);
    return [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);
}
