import { z } from "zod";

/**
 * Tournaments with the user (Phase 9.2, I-51). The user is the protagonist: only their games are
 * played on the board; the boards between bots are resolved by a statistical model (Elo and
 * style), so even an open of a hundred players costs nothing.
 */
export const USER_PARTICIPANT_ID = "user";

export const tournamentFormatSchema = z.enum([
    "roundRobin",
    "swiss",
    "knockout",
    "doubleElimination",
]);
export type TournamentFormat = z.infer<typeof tournamentFormatSchema>;

export const tournamentTemplateSchema = z.enum([
    "favorite",
    "myLevel",
    "allStronger",
    "mixed",
    "specialists",
    "sameStyle",
    "bigFavorite",
    "custom",
]);
export type TournamentTemplate = z.infer<typeof tournamentTemplateSchema>;

export const gameResultSchema = z.enum(["1-0", "0-1", "1/2-1/2"]);
export type TournamentResult = z.infer<typeof gameResultSchema>;

export const participantSchema = z.object({
    /** `user`, a catalog bot id or a generated player id (`gen-<seed>-<elo>`). */
    id: z.string(),
    name: z.string(),
    /** Rating at the tournament rhythm, fixed when the tournament is created. */
    rating: z.number(),
    /** Starting rank, 1 = highest rating. */
    seed: z.number().int().positive(),
    kind: z.enum(["user", "catalog", "generated"]),
});
export type TournamentParticipant = z.infer<typeof participantSchema>;

export const bracketSchema = z.enum(["main", "winners", "losers", "final", "reset"]);
export type TournamentBracket = z.infer<typeof bracketSchema>;

export const tournamentGameSchema = z.object({
    id: z.string(),
    round: z.number().int().positive(),
    board: z.number().int().positive(),
    white: z.string(),
    /** `null` for a bye. */
    black: z.string().nullable(),
    result: gameResultSchema.nullable(),
    /** How the result was decided: on the board, by the model, a bye or a forfeit. */
    mode: z.enum(["pending", "played", "simulated", "bye", "forfeit"]),
    /** Knockout formats: the match the game belongs to. */
    matchId: z.string().nullable().default(null),
    /** Knockout tiebreak: on a draw, Black goes through. */
    armageddon: z.boolean().default(false),
    pgn: z.string().nullable().default(null),
    playedAt: z.string().nullable().default(null),
});
export type TournamentGame = z.infer<typeof tournamentGameSchema>;

export const tournamentMatchSchema = z.object({
    id: z.string(),
    round: z.number().int().positive(),
    bracket: bracketSchema,
    /** Higher seed first; `b` is `null` for a bye. */
    a: z.string(),
    b: z.string().nullable(),
    winner: z.string().nullable(),
});
export type TournamentMatch = z.infer<typeof tournamentMatchSchema>;

export const clockSchema = z.object({
    /** Milliseconds, as the game setup stores them. */
    seconds: z.number().positive(),
    increment: z.number().nonnegative(),
});

export const tournamentSchema = z.object({
    schemaVersion: z.literal(1),
    id: z.string(),
    name: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    format: tournamentFormatSchema,
    template: tournamentTemplateSchema,
    /** Round robin: everyone plays everyone twice, with both colors. */
    doubleRoundRobin: z.boolean().default(false),
    /** Swiss: planned rounds. Other formats: computed. */
    plannedRounds: z.number().int().positive(),
    /** Knockout formats: games per match before a tiebreak. */
    gamesPerMatch: z.number().int().min(1).max(2).default(1),
    clock: clockSchema,
    /** Whether the user's games count for their rating against the bots. */
    rated: z.boolean(),
    seed: z.number().int().nonnegative(),
    /** Calendar tournaments: their slot (for example `daily-2026-10-18`). */
    calendarSlot: z.string().nullable().default(null),
    participants: z.array(participantSchema),
    games: z.array(tournamentGameSchema),
    matches: z.array(tournamentMatchSchema).default([]),
    currentRound: z.number().int().nonnegative(),
    status: z.enum(["active", "finished"]),
    userWithdrawn: z.boolean().default(false),
});
export type Tournament = z.infer<typeof tournamentSchema>;

export const tournamentsStateSchema = z.object({
    schemaVersion: z.literal(1),
    tournaments: z.array(tournamentSchema),
});
export type TournamentsState = z.infer<typeof tournamentsStateSchema>;

export function emptyTournamentsState(): TournamentsState {
    return { schemaVersion: 1, tournaments: [] };
}

/** Points of a result for White and for Black. */
export function resultPoints(result: TournamentResult): [number, number] {
    return result === "1-0" ? [1, 0] : result === "0-1" ? [0, 1] : [0.5, 0.5];
}
