/**
 * Saved twins (I-43, 9.3 extension): a twin kept between sessions, editable and updatable. A
 * player plays very differently at bullet and at classical, so a twin keeps one **profile per
 * rhythm** with enough games (its own book, rating, style and variability) plus a general one
 * with every game. A game uses the profile of its clock's rhythm, the nearest rhythm with a
 * profile when there is none, and the general one without a clock.
 */
import { z } from "zod";
import type { BookLine } from "@/bindings";
import type { Rhythm } from "@/utils/botRating";
import { clampMaiaElo, MAIA_ELO_MAX, MAIA_ELO_MIN } from "@/utils/humanBots";
import type { ProfileGame } from "@/utils/players/profileGames";
import type { GeneratorColor } from "@/utils/repertoireGenerator/types";
import { BOOK_PLIES, type PlayerBooks } from "./book";
import { TWIN_ELO_MAX, TWIN_RHYTHMS, type TwinThinking } from "./twin";

export const SAVED_TWINS_VERSION = 1;
/** Games at a rhythm needed for a profile of its own. */
export const TWIN_PROFILE_MIN_GAMES = 20;
/** Evaluations kept per profile, newest first. */
const MAX_EVALUATIONS = 8;

export type TwinProfileKey = Rhythm | "general";
export const TWIN_PROFILE_KEYS: readonly TwinProfileKey[] = ["general", ...TWIN_RHYTHMS];

/** Where a profile's way of playing comes from. */
export type TwinOrigin = "default" | "measured" | "fitted" | "manual";

export type TwinTimingMode = "player" | "catalog" | "none";

const playSchema = z.object({
    elo: z.number(),
    aggression: z.number().min(-1).max(1),
    simplification: z.number().min(-1).max(1),
    temperature: z.number().min(0.3).max(3),
});
export type TwinPlay = z.infer<typeof playSchema>;

/** Maia alone at the player's rating out of the book: the twin of version 1. */
export function neutralPlay(elo: number): TwinPlay {
    return { elo, aggression: 0, simplification: 0, temperature: 1 };
}

const fitSchema = z.object({ logLikelihood: z.number(), top: z.number() });

const evaluationSchema = z.object({
    at: z.string(),
    /** `fit`: fitted on the older games and checked on the recent ones; `fixed`: a hand-made
     * configuration checked on every game. */
    kind: z.enum(["style", "autotune", "fixed"]),
    play: playSchema,
    positions: z.number(),
    maiaElo: z.number(),
    maia: fitSchema,
    twin: fitSchema,
    improves: z.boolean(),
    /** Trait deviations of the player against Maia (delta and standard error). */
    aggression: z.object({ delta: z.number(), stdError: z.number() }).optional(),
    simplification: z.object({ delta: z.number(), stdError: z.number() }).optional(),
    /** Maia alone at each rating tried. */
    eloFits: z.array(z.object({ elo: z.number(), fit: fitSchema })).default([]),
});
export type TwinEvaluation = z.infer<typeof evaluationSchema>;

/** Book lines kept compact on disk: UCI moves joined by spaces and their games. */
const lineSchema = z.object({ m: z.string(), g: z.number() });
type StoredLine = z.infer<typeof lineSchema>;

const profileSchema = z.object({
    key: z.enum(["general", "bullet", "blitz", "rapid", "classical"]),
    games: z.number(),
    white: z.number(),
    black: z.number(),
    /** The player's latest rating at this rhythm (any rhythm for the general profile). */
    rating: z.number().nullable(),
    books: z.object({ white: z.array(lineSchema), black: z.array(lineSchema) }),
    play: playSchema,
    origin: z.enum(["default", "measured", "fitted", "manual"]),
    evaluations: z.array(evaluationSchema).default([]),
});
export type TwinProfile = z.infer<typeof profileSchema>;

const thinkStatsSchema = z.object({
    games: z.number(),
    moves: z.number(),
    seconds: z.number(),
    openingMoves: z.number(),
    openingSeconds: z.number(),
    bins: z.array(z.number()),
});

const twinSchema = z.object({
    id: z.string(),
    cardId: z.string(),
    playerName: z.string(),
    name: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    /** Games the twin was built from and the date of the latest one. */
    gamesUsed: z.number(),
    lastDay: z.string().nullable(),
    /** Plies of the book used in play (at most `BOOK_PLIES`). */
    bookPlies: z.number().int().min(2).max(BOOK_PLIES),
    /** The book uses only the most recent N games of each profile and color; `null` for all. */
    bookRecent: z.number().int().positive().nullable(),
    timing: z.enum(["player", "catalog", "none"]),
    thinking: z.record(z.string(), thinkStatsSchema),
    profiles: z.record(z.string(), profileSchema),
});
export type SavedTwin = Omit<z.infer<typeof twinSchema>, "profiles" | "thinking"> & {
    thinking: TwinThinking;
    profiles: Partial<Record<TwinProfileKey, TwinProfile>>;
};

export const savedTwinsFileSchema = z.object({
    version: z.literal(SAVED_TWINS_VERSION),
    twins: z.array(twinSchema),
});
export type SavedTwinsFile = { version: typeof SAVED_TWINS_VERSION; twins: SavedTwin[] };

export function emptyTwinsFile(): SavedTwinsFile {
    return { version: SAVED_TWINS_VERSION, twins: [] };
}

export function toStoredLines(lines: readonly BookLine[]): StoredLine[] {
    return lines.map((line) => ({ m: line.moves.join(" "), g: line.games }));
}

export function fromStoredLines(lines: readonly StoredLine[]): BookLine[] {
    return lines.map((line) => ({ moves: line.m ? line.m.split(" ") : [], games: line.g }));
}

/** The rhythm of a card game, as Lichess groups them; `null` for correspondence or unknown. */
export function rhythmOfGame(game: Pick<ProfileGame, "timeControlCategory">): Rhythm | null {
    const category = game.timeControlCategory;
    if (category === "ultra_bullet" || category === "bullet") return "bullet";
    if (category === "blitz" || category === "rapid" || category === "classical") return category;
    return null;
}

/** The games of a profile: every game for the general one, those of its rhythm otherwise. */
export function gamesOfProfile<T extends Pick<ProfileGame, "timeControlCategory">>(
    games: readonly T[],
    key: TwinProfileKey,
): T[] {
    return key === "general" ? [...games] : games.filter((game) => rhythmOfGame(game) === key);
}

/** Profiles with enough games: the general one always, each rhythm from `TWIN_PROFILE_MIN_GAMES`. */
export function profileKeysOf(
    games: readonly Pick<ProfileGame, "timeControlCategory">[],
): TwinProfileKey[] {
    const counts = new Map<Rhythm, number>();
    for (const game of games) {
        const rhythm = rhythmOfGame(game);
        if (rhythm) counts.set(rhythm, (counts.get(rhythm) ?? 0) + 1);
    }
    return [
        "general",
        ...TWIN_RHYTHMS.filter((rhythm) => (counts.get(rhythm) ?? 0) >= TWIN_PROFILE_MIN_GAMES),
    ];
}

/** The latest rating of the games (by date), or `null` without ratings. */
export function latestRating(
    games: readonly Pick<ProfileGame, "playerElo" | "day" | "time" | "id">[],
): number | null {
    let best: { order: string; elo: number } | null = null;
    for (const game of games) {
        if (!game.playerElo) continue;
        const order = `${game.day ?? "0000"}|${game.time ?? ""}|${String(game.id).padStart(10, "0")}`;
        if (!best || order > best.order) best = { order, elo: game.playerElo };
    }
    return best?.elo ?? null;
}

export function clampTwinElo(value: number): number {
    return Math.max(MAIA_ELO_MIN, Math.min(TWIN_ELO_MAX, Math.round(value)));
}

/** A new profile from its games and books, playing as Maia at the player's rating. */
export function buildProfile(
    key: TwinProfileKey,
    games: readonly ProfileGame[],
    books: PlayerBooks,
    fallbackRating: number,
): TwinProfile {
    const rating = latestRating(games);
    return {
        key,
        games: games.length,
        white: games.filter((game) => game.isWhite).length,
        black: games.filter((game) => !game.isWhite).length,
        rating,
        books: {
            white: toStoredLines(books.white.lines),
            black: toStoredLines(books.black.lines),
        },
        play: neutralPlay(clampTwinElo(rating ?? fallbackRating)),
        origin: "default",
        evaluations: [],
    };
}

/**
 * A profile rebuilt from newer games keeps what the user decided: a hand-made, measured or
 * fitted way of playing stays; a default one follows the player's new rating.
 */
export function refreshProfile(previous: TwinProfile | undefined, next: TwinProfile): TwinProfile {
    if (!previous) return next;
    if (previous.origin === "default") return { ...next, evaluations: previous.evaluations };
    return {
        ...next,
        play: previous.play,
        origin: previous.origin,
        evaluations: previous.evaluations,
    };
}

/** How much longer than blitz a rhythm thinks, to find the nearest one. */
const RHYTHM_SCALE: Record<Rhythm, number> = { bullet: 0.6, blitz: 1, rapid: 1.6, classical: 2.5 };

export type ResolvedTwinProfile = {
    profile: TwinProfile;
    /** `exact`: the rhythm's own; `nearest`: another rhythm's; `general`: every game; `chosen`:
     * picked by the user. */
    kind: "exact" | "nearest" | "general" | "chosen";
};

/** The profile a game at `rhythm` uses (`null` without a clock). */
export function resolveTwinProfile(
    twin: Pick<SavedTwin, "profiles">,
    rhythm: Rhythm | null,
    choice: TwinProfileKey | "auto" = "auto",
): ResolvedTwinProfile | null {
    const general = twin.profiles.general;
    if (choice !== "auto") {
        const chosen = twin.profiles[choice];
        if (chosen) return { profile: chosen, kind: "chosen" };
    }
    if (rhythm) {
        const own = twin.profiles[rhythm];
        if (own) return { profile: own, kind: "exact" };
        const nearest = [...TWIN_RHYTHMS]
            .filter((other) => twin.profiles[other])
            .sort(
                (a, b) =>
                    Math.abs(Math.log(RHYTHM_SCALE[a] / RHYTHM_SCALE[rhythm])) -
                    Math.abs(Math.log(RHYTHM_SCALE[b] / RHYTHM_SCALE[rhythm])),
            )[0];
        if (nearest) return { profile: twin.profiles[nearest]!, kind: "nearest" };
    }
    return general ? { profile: general, kind: "general" } : null;
}

/** The book lines of a profile for the color the twin plays. */
export function profileBook(profile: TwinProfile, color: GeneratorColor): BookLine[] {
    return fromStoredLines(profile.books[color]);
}

/** Maia ratings tried by the autotune: the profile's and up to ±200, within Maia's range. */
export function autotuneElos(elo: number): { base: number; extra: number[] } {
    const base = clampMaiaElo(elo);
    if (elo > MAIA_ELO_MAX) return { base, extra: [] };
    const extra = [-200, -100, 100, 200]
        .map((offset) => clampMaiaElo(base + offset))
        .filter((value, index, all) => value !== base && all.indexOf(value) === index);
    return { base, extra };
}

/** Adds an evaluation to a profile, newest first, keeping the last few. */
export function withEvaluation(profile: TwinProfile, evaluation: TwinEvaluation): TwinProfile {
    return {
        ...profile,
        evaluations: [evaluation, ...profile.evaluations].slice(0, MAX_EVALUATIONS),
    };
}

/** The catalogue personalities as a starting point for a hand-made style, with the weights the
 * catalogue bots use (`humanBotStyleWeights`). */
export const PERSONALITY_WEIGHTS = {
    rematador: { aggression: 1, simplification: 1 },
    salvaje: { aggression: 1, simplification: -1 },
    guardian: { aggression: -1, simplification: 1 },
    acechador: { aggression: -1, simplification: -1 },
    equilibrista: { aggression: 0, simplification: 0 },
} as const;

export function newTwinId(): string {
    return `twin-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Tournament participant id of a saved twin. */
export const TWIN_PARTICIPANT_PREFIX = "twin:";
export function twinParticipantId(twinId: string): string {
    return `${TWIN_PARTICIPANT_PREFIX}${twinId}`;
}
export function twinIdOfParticipant(participantId: string): string | null {
    return participantId.startsWith(TWIN_PARTICIPANT_PREFIX)
        ? participantId.slice(TWIN_PARTICIPANT_PREFIX.length)
        : null;
}
