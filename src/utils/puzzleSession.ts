import type { PuzzleFilter } from "@/bindings";

/**
 * Filters and session modes of the Lichess puzzle trainer (I-05).
 *
 * Quality uses the two signals of the Lichess database: popularity (the players' votes, from
 * -100 to 100) and the number of plays (few plays mean a rating that is still settling).
 */

export type PuzzleQuality = "all" | "good" | "excellent";
export type PuzzleLength = "any" | "short" | "medium" | "long";
export type PuzzleThemeMode = "any" | "all";

export const QUALITY_FILTERS: Record<PuzzleQuality, { minPopularity?: number; minPlays?: number }> =
    {
        all: {},
        good: { minPopularity: 70, minPlays: 50 },
        excellent: { minPopularity: 90, minPlays: 300 },
    };

/** Moves of the solver (the opponent's first move does not count). */
export const LENGTH_FILTERS: Record<PuzzleLength, { min?: number; max?: number }> = {
    any: {},
    short: { max: 2 },
    medium: { min: 3, max: 3 },
    long: { min: 4 },
};

export function buildPuzzleFilter(input: {
    range: [number, number];
    themes: string[];
    themeMode: PuzzleThemeMode;
    /** Themes to leave out; they win over the included ones. */
    excludeThemes?: string[];
    quality: PuzzleQuality;
    length: PuzzleLength;
    maxPieces?: number | null;
}): PuzzleFilter {
    const quality = QUALITY_FILTERS[input.quality];
    const length = LENGTH_FILTERS[input.length];
    return {
        minRating: Math.max(0, Math.round(input.range[0])),
        maxRating: Math.max(0, Math.round(input.range[1])),
        themes: input.themes,
        matchAllThemes: input.themeMode === "all" && input.themes.length > 1,
        excludeThemes: input.excludeThemes ?? [],
        minPopularity: quality.minPopularity ?? null,
        minPlays: quality.minPlays ?? null,
        minSolutionMoves: length.min ?? null,
        maxSolutionMoves: length.max ?? null,
        maxPieces: input.maxPieces ?? null,
    };
}

export type PuzzleMode = "free" | "storm" | "streak" | "countdown";

export type RushSettings = {
    /** Storm length, in seconds. */
    stormSeconds: number;
    streakLives: number;
    /** Time for each puzzle in countdown mode, in seconds. */
    countdownSeconds: number;
};

export const DEFAULT_RUSH_SETTINGS: RushSettings = {
    stormSeconds: 180,
    streakLives: 1,
    countdownSeconds: 30,
};

/** Storm: a mistake costs this much time. */
export const STORM_PENALTY_MS = 10_000;
const STORM_START_BELOW = 300;
const STORM_STEP = 40;
const STREAK_START_BELOW = 200;
const STREAK_STEP = 60;
const BAND = 50;
const MIN_LEVEL = 600;

export type RushState = {
    mode: "storm" | "streak";
    status: "running" | "over";
    startedAt: number;
    /** Storm only: when the clock runs out. */
    endsAt: number | null;
    lives: number;
    solved: number;
    failed: number;
    combo: number;
    bestCombo: number;
    /** Rating the next puzzle is drawn around. */
    level: number;
    highestSolved: number | null;
};

export function startRush(
    mode: "storm" | "streak",
    settings: RushSettings,
    baseRating: number,
    now = Date.now(),
): RushState {
    const below = mode === "storm" ? STORM_START_BELOW : STREAK_START_BELOW;
    return {
        mode,
        status: "running",
        startedAt: now,
        endsAt: mode === "storm" ? now + settings.stormSeconds * 1000 : null,
        lives: mode === "streak" ? Math.max(1, settings.streakLives) : 0,
        solved: 0,
        failed: 0,
        combo: 0,
        bestCombo: 0,
        level: Math.max(MIN_LEVEL, Math.round(baseRating - below)),
        highestSolved: null,
    };
}

/** Rating band of the next puzzle: difficulty rises with every solved one. */
export function rushRange(state: RushState): [number, number] {
    return [state.level - BAND, state.level + BAND];
}

export function applyRushResult(
    state: RushState,
    solved: boolean,
    puzzleRating: number,
    now = Date.now(),
): RushState {
    if (state.status === "over") return state;
    if (solved) {
        const combo = state.combo + 1;
        return {
            ...state,
            solved: state.solved + 1,
            combo,
            bestCombo: Math.max(state.bestCombo, combo),
            level: state.level + (state.mode === "storm" ? STORM_STEP : STREAK_STEP),
            highestSolved: Math.max(state.highestSolved ?? 0, puzzleRating),
        };
    }
    const lives = state.mode === "streak" ? state.lives - 1 : state.lives;
    const endsAt = state.endsAt !== null ? state.endsAt - STORM_PENALTY_MS : null;
    const over = (state.mode === "streak" && lives <= 0) || (endsAt !== null && endsAt <= now);
    return {
        ...state,
        failed: state.failed + 1,
        combo: 0,
        lives,
        endsAt,
        status: over ? "over" : "running",
    };
}

export function rushTimeLeft(state: RushState, now = Date.now()): number | null {
    return state.endsAt === null ? null : Math.max(0, state.endsAt - now);
}

export function finishRushIfTimeUp(state: RushState, now = Date.now()): RushState {
    return state.status === "running" && state.endsAt !== null && state.endsAt <= now
        ? { ...state, status: "over" }
        : state;
}

/** Score kept as the best result: puzzles solved (storm) or the streak length. */
export function rushScore(state: RushState): number {
    return state.mode === "storm" ? state.solved : state.bestCombo;
}
