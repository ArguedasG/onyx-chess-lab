/**
 * The game filters several screens share (the board's database panel, a database's games and the
 * player analysis): color, an Elo range, a date range and the result. Each screen keeps its own
 * stored type and converts it with the adapters below, so nothing saved changes shape.
 */

export type GameFilterColor = "any" | "white" | "black";
export type GameFilterResult = "any" | "whitewon" | "draw" | "blackwon";

export type GameFilterValue = {
    color: GameFilterColor;
    eloMin: number | null;
    eloMax: number | null;
    /** PGN dates, "YYYY.MM.DD". */
    startDate: string | null;
    endDate: string | null;
    result: GameFilterResult;
};

export type GameFilterField = "color" | "elo" | "dates" | "result";

export const EMPTY_GAME_FILTERS: GameFilterValue = {
    color: "any",
    eloMin: null,
    eloMax: null,
    startDate: null,
    endDate: null,
    result: "any",
};

/**
 * A date as PGN writes it ("YYYY.MM.DD"). Accepts the "YYYY-MM-DD" of date inputs, so filters
 * saved in either form compare correctly with the games' dates.
 */
export function toPgnDate(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed.replace(/-/g, ".") : null;
}

/** How many of the given fields are set, for a "Filters (2)" button. */
export function countActiveGameFilters(
    value: GameFilterValue,
    fields: readonly GameFilterField[],
): number {
    let count = 0;
    for (const field of fields) {
        if (field === "color" && value.color !== "any") count += 1;
        if (field === "elo" && (value.eloMin !== null || value.eloMax !== null)) count += 1;
        if (field === "dates" && (value.startDate !== null || value.endDate !== null)) count += 1;
        if (field === "result" && value.result !== "any") count += 1;
    }
    return count;
}

/** Clears the given fields only, so a screen's other filters stay. */
export function clearGameFilters(
    value: GameFilterValue,
    fields: readonly GameFilterField[],
): GameFilterValue {
    const next = { ...value };
    for (const field of fields) {
        if (field === "color") next.color = "any";
        if (field === "elo") {
            next.eloMin = null;
            next.eloMax = null;
        }
        if (field === "dates") {
            next.startDate = null;
            next.endDate = null;
        }
        if (field === "result") next.result = "any";
    }
    return next;
}

const OUTCOME_BY_RESULT = {
    whitewon: "1-0",
    blackwon: "0-1",
    draw: "1/2-1/2",
} as const;

/** A database's games use PGN outcomes ("1-0"); missing means any result. */
export function resultToOutcome(result: GameFilterResult): "1-0" | "0-1" | "1/2-1/2" | undefined {
    return result === "any" ? undefined : OUTCOME_BY_RESULT[result];
}

export function outcomeToResult(outcome: string | null | undefined): GameFilterResult {
    if (outcome === "1-0") return "whitewon";
    if (outcome === "0-1") return "blackwon";
    if (outcome === "1/2-1/2") return "draw";
    return "any";
}

/** Upper end of a database's Elo slider range: [0, 3000] means "no filter" there. */
export const ELO_RANGE_MAX = 3000;

/** Elo bounds from a database query's [min, max] range (the full range means unrestricted). */
export function eloFromRange(range: [number, number] | null | undefined): {
    eloMin: number | null;
    eloMax: number | null;
} {
    if (!range) return { eloMin: null, eloMax: null };
    return {
        eloMin: range[0] > 0 ? range[0] : null,
        eloMax: range[1] < ELO_RANGE_MAX ? range[1] : null,
    };
}

export function eloToRange(eloMin: number | null, eloMax: number | null): [number, number] {
    return [eloMin ?? 0, eloMax ?? ELO_RANGE_MAX];
}
