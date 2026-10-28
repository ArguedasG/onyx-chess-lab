/**
 * Twin bot, version 1 (I-43): the player's own opening sequences as the book (chosen with their
 * real frequency) and, out of it, Maia at the player's level. The honest description is "plays
 * X's repertoire and, out of it, like a player of their rating".
 *
 * Fidelity is measured on the player's most recent games, left out of the book: in each position
 * of theirs inside the book, how often the twin would play their actual move compared with plain
 * Maia at the same level. Out of the book the twin *is* Maia, so only the book can make it better.
 */
import type { BookLine } from "@/bindings";
import type { Rhythm } from "@/utils/botRating";
import type { HumanBotOpeningRepertoireConfig } from "@/utils/humanBots";
import type { MaiaSampler } from "@/utils/repertoireGenerator/engines";
import type { GeneratorColor } from "@/utils/repertoireGenerator/types";
import { BOOK_PLIES, lineFens } from "./book";

/** Highest twin rating: above Maia's range the strength filter plays the rest (I-48). */
export const TWIN_ELO_MAX = 2800;

/** The Rust book keeps weights as 16-bit numbers. */
const MAX_WEIGHT = 65_535;
/** Lines sent to the game: the most played ones. */
const MAX_LINES = 4_000;

export function twinRepertoire(
    lines: readonly BookLine[],
    color: GeneratorColor,
    id: string,
    maxPly = BOOK_PLIES,
): HumanBotOpeningRepertoireConfig {
    return {
        id: `twin-${id}`,
        version: 1,
        mode: lines.length ? "weighted" : "none",
        maxPly,
        lines: lines.slice(0, MAX_LINES).map((line) => ({
            moves: line.moves.slice(0, maxPly),
            weight: Math.max(1, Math.min(MAX_WEIGHT, line.games)),
            side: color,
        })),
    };
}

/** Book moves after a prefix with their counts, as the game picks them (`select_repertoire_move`). */
export function bookChoices(
    lines: readonly BookLine[],
    prefix: readonly string[],
): Map<string, number> {
    const choices = new Map<string, number>();
    for (const line of lines) {
        if (line.moves.length <= prefix.length) continue;
        let matches = true;
        for (let index = 0; index < prefix.length; index += 1) {
            if (line.moves[index] !== prefix[index]) {
                matches = false;
                break;
            }
        }
        if (!matches) continue;
        const move = line.moves[prefix.length];
        choices.set(move, (choices.get(move) ?? 0) + line.games);
    }
    return choices;
}

export type FidelityPosition = {
    fen: string;
    actual: string;
    /** Chance the twin's book plays the actual move, and whether it is the book's first choice. */
    bookProbability: number;
    bookTop: boolean;
    weight: number;
};

export type FidelityPlan = {
    inBook: FidelityPosition[];
    /** Moves of the player after the book ran out (the twin plays Maia there). */
    outOfBook: number;
    testGames: number;
    trainGames: number;
};

/**
 * Walks the test games along the training book. A game leaves the book at the first position of
 * the player that the book does not know; from there every move is out of the book.
 */
export function fidelityPlan(
    train: readonly BookLine[],
    test: readonly BookLine[],
    color: GeneratorColor,
): FidelityPlan {
    const inBook: FidelityPosition[] = [];
    let outOfBook = 0;
    const playerParity = color === "white" ? 0 : 1;
    for (const line of test) {
        const fens = lineFens(line.moves);
        let inside = true;
        for (let ply = 0; ply < line.moves.length && ply < fens.length - 1; ply += 1) {
            const prefix = line.moves.slice(0, ply);
            const choices = inside ? bookChoices(train, prefix) : new Map<string, number>();
            if (choices.size === 0) inside = false;
            if (ply % 2 !== playerParity) continue;
            if (!inside) {
                outOfBook += line.games;
                continue;
            }
            const total = [...choices.values()].reduce((sum, count) => sum + count, 0);
            const actual = line.moves[ply];
            const best = [...choices.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
            inBook.push({
                fen: fens[ply],
                actual,
                bookProbability: (choices.get(actual) ?? 0) / total,
                bookTop: best === actual,
                weight: line.games,
            });
        }
    }
    return {
        inBook,
        outOfBook,
        testGames: test.reduce((sum, line) => sum + line.games, 0),
        trainGames: train.reduce((sum, line) => sum + line.games, 0),
    };
}

export type FidelityResult = {
    positions: number;
    /** Weighted by games: chance of reproducing the actual move, and first-choice accuracy. */
    twin: { probability: number; top: number };
    maia: { probability: number; top: number };
    outOfBook: number;
    testGames: number;
    trainGames: number;
    /** Positions measured with Maia (at most `MAX_MEASURED`). */
    sampled: number;
};

export const MAX_MEASURED = 120;

/** Splits games into the training book and the most recent ones for the test (20 %, at least 5). */
export function splitForFidelity<T>(newestFirst: readonly T[]): { train: T[]; test: T[] } {
    const testSize = Math.max(5, Math.round(newestFirst.length * 0.2));
    return {
        test: newestFirst.slice(0, testSize),
        train: newestFirst.slice(testSize),
    };
}

/** Compares the twin's book with Maia in the book positions of the test games. */
export async function measureFidelity(
    plan: FidelityPlan,
    maia: MaiaSampler,
    onProgress?: (done: number, total: number) => void,
): Promise<FidelityResult> {
    // The heaviest positions first, so a cap keeps the most played ones.
    const measured = [...plan.inBook].sort((a, b) => b.weight - a.weight).slice(0, MAX_MEASURED);
    const chunk = 20;
    const samples: Array<Array<{ uci: string; count: number }>> = [];
    for (let start = 0; start < measured.length; start += chunk) {
        onProgress?.(start, measured.length);
        samples.push(
            ...(await maia.frequencies(
                measured.slice(start, start + chunk).map((position) => position.fen),
            )),
        );
    }
    onProgress?.(measured.length, measured.length);
    let weight = 0;
    const twin = { probability: 0, top: 0 };
    const generic = { probability: 0, top: 0 };
    measured.forEach((position, index) => {
        const frequencies = samples[index] ?? [];
        const total = frequencies.reduce((sum, move) => sum + move.count, 0);
        if (total === 0) return;
        const actual = frequencies.find((move) => move.uci === position.actual)?.count ?? 0;
        const top = [...frequencies].sort((a, b) => b.count - a.count)[0]?.uci;
        weight += position.weight;
        twin.probability += position.bookProbability * position.weight;
        twin.top += (position.bookTop ? 1 : 0) * position.weight;
        generic.probability += (actual / total) * position.weight;
        generic.top += (top === position.actual ? 1 : 0) * position.weight;
    });
    const share = (value: number) => (weight ? (value / weight) * 100 : 0);
    return {
        positions: plan.inBook.length,
        twin: { probability: share(twin.probability), top: share(twin.top) },
        maia: { probability: share(generic.probability), top: share(generic.top) },
        outOfBook: plan.outOfBook,
        testGames: plan.testGames,
        trainGames: plan.trainGames,
        sampled: measured.length,
    };
}

/** Rhythms of the twin's think time, as Lichess groups them (ultrabullet counts as bullet). */
export const TWIN_RHYTHMS: readonly Rhythm[] = ["bullet", "blitz", "rapid", "classical"];
export type TwinRhythm = Rhythm;

/** How much longer than blitz a rhythm thinks (`game.rs`, `rhythm_factor`). */
const RHYTHM_FACTOR: Record<TwinRhythm, number> = {
    bullet: 0.6,
    blitz: 1,
    rapid: 1.6,
    classical: 2.5,
};

/** Upper bounds of the think-time bins in seconds (`THINK_BINS` in Rust), and the last bin's. */
const BIN_BOUNDS = [1, 2, 4, 8, 16, 32, 64, 128];

export type TwinThinkStats = {
    games: number;
    /** Moves after the first ten and the seconds spent on them. */
    moves: number;
    seconds: number;
    openingMoves: number;
    openingSeconds: number;
    bins: number[];
};

export type TwinThinking = Partial<Record<TwinRhythm, TwinThinkStats>>;

/** Moves needed at a rhythm to trust its average. */
export const MIN_THINK_MOVES = 60;

function rhythmOfCategory(category: string): TwinRhythm | null {
    if (category === "ultra_bullet" || category === "bullet") return "bullet";
    if (category === "blitz" || category === "rapid" || category === "classical") return category;
    return null;
}

/** The player's think time by rhythm, from the clocks of their games (I-43). */
export function twinThinking(
    games: readonly {
        timeControlCategory: string;
        playerThink?: {
            moves: number;
            seconds: number;
            openingMoves: number;
            openingSeconds: number;
            bins: readonly number[];
        } | null;
    }[],
): TwinThinking {
    const result: TwinThinking = {};
    for (const game of games) {
        const rhythm = rhythmOfCategory(game.timeControlCategory);
        const think = game.playerThink;
        if (!rhythm || !think) continue;
        const stats = (result[rhythm] ??= {
            games: 0,
            moves: 0,
            seconds: 0,
            openingMoves: 0,
            openingSeconds: 0,
            bins: Array(BIN_BOUNDS.length).fill(0),
        });
        stats.games += 1;
        stats.moves += think.moves;
        stats.seconds += think.seconds;
        stats.openingMoves += think.openingMoves;
        stats.openingSeconds += think.openingSeconds;
        think.bins.forEach((count, index) => {
            stats.bins[index] += count;
        });
    }
    return result;
}

/** A percentile from the bins, interpolating inside the bin (the first starts at 0 s). */
export function binPercentile(bins: readonly number[], share: number): number {
    const total = bins.reduce((sum, count) => sum + count, 0);
    if (total === 0) return 0;
    const target = total * share;
    let seen = 0;
    for (let index = 0; index < bins.length; index += 1) {
        const lower = index === 0 ? 0 : BIN_BOUNDS[index - 1];
        const upper = BIN_BOUNDS[index];
        if (seen + bins[index] >= target && bins[index] > 0) {
            return lower + ((target - seen) / bins[index]) * (upper - lower);
        }
        seen += bins[index];
    }
    return BIN_BOUNDS[BIN_BOUNDS.length - 1];
}

export type TwinTiming = {
    config: {
        minThinkTimeMs: number;
        averageThinkTimeMs: number;
        maxThinkTimeMs: number;
        repertoireTimePercent: number;
        fixedRhythm: boolean;
    };
    /** Measured at this rhythm, estimated from another one of the player, or none. */
    source: { kind: "measured" | "estimated"; rhythm: TwinRhythm; moves: number } | null;
};

function timingFrom(stats: TwinThinkStats) {
    const average = stats.seconds / stats.moves;
    const opening =
        stats.openingMoves > 0 ? stats.openingSeconds / stats.openingMoves : average / 3;
    return {
        minThinkTimeMs: Math.round(Math.max(0.3, binPercentile(stats.bins, 0.1)) * 1000),
        averageThinkTimeMs: Math.round(average * 1000),
        maxThinkTimeMs: Math.round(Math.max(average * 2, binPercentile(stats.bins, 0.95)) * 1000),
        repertoireTimePercent: Math.round(Math.min(100, Math.max(15, (opening / average) * 100))),
    };
}

/**
 * How the twin thinks at the rhythm of the game: the player's own times at that rhythm when
 * there are enough moves; otherwise their times at the nearest rhythm, rescaled as the bots do;
 * otherwise `fallback` (the catalogue's times for the rating), rescaled.
 */
export function twinTiming(
    thinking: TwinThinking | undefined,
    rhythm: TwinRhythm,
    fallback: Omit<TwinTiming["config"], "fixedRhythm">,
): TwinTiming {
    const own = thinking?.[rhythm];
    if (own && own.moves >= MIN_THINK_MOVES) {
        return {
            config: { ...timingFrom(own), fixedRhythm: true },
            source: { kind: "measured", rhythm, moves: own.moves },
        };
    }
    const order = [...TWIN_RHYTHMS].sort(
        (a, b) =>
            Math.abs(Math.log(RHYTHM_FACTOR[a] / RHYTHM_FACTOR[rhythm])) -
            Math.abs(Math.log(RHYTHM_FACTOR[b] / RHYTHM_FACTOR[rhythm])),
    );
    for (const other of order) {
        const stats = thinking?.[other];
        if (!stats || stats.moves < MIN_THINK_MOVES) continue;
        // To blitz times; the game rescales them to its rhythm.
        const factor = RHYTHM_FACTOR[other];
        const timing = timingFrom(stats);
        return {
            config: {
                minThinkTimeMs: Math.round(timing.minThinkTimeMs / factor),
                averageThinkTimeMs: Math.round(timing.averageThinkTimeMs / factor),
                maxThinkTimeMs: Math.round(timing.maxThinkTimeMs / factor),
                repertoireTimePercent: timing.repertoireTimePercent,
                fixedRhythm: false,
            },
            source: { kind: "estimated", rhythm: other, moves: stats.moves },
        };
    }
    return { config: { ...fallback, fixedRhythm: false }, source: null };
}
