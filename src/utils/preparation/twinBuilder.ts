/**
 * Builds a twin (I-43) from the games of a player card: one profile per rhythm with enough games
 * and a general one, each with its own book. Rebuilding an existing twin keeps the user's
 * decisions (see `refreshProfile`).
 */
import { chronological, type ProfileGame } from "@/utils/players/profileGames";
import { BOOK_PLIES, loadPlayerBooks } from "./book";
import {
    buildProfile,
    gamesOfProfile,
    latestRating,
    newTwinId,
    profileKeysOf,
    refreshProfile,
    type SavedTwin,
    type TwinProfile,
    type TwinProfileKey,
} from "./savedTwins";
import { twinThinking } from "./twin";

/** The games of the book: all of them, or the most recent N with each color. */
export function bookGames(games: readonly ProfileGame[], recent: number | null): ProfileGame[] {
    if (!recent) return [...games];
    const newestFirst = chronological(games.filter((game) => !game.customStart)).reverse();
    return [
        ...newestFirst.filter((game) => game.isWhite).slice(0, recent),
        ...newestFirst.filter((game) => !game.isWhite).slice(0, recent),
    ];
}

export async function buildTwin(options: {
    games: readonly ProfileGame[];
    cardId: string;
    playerName: string;
    /** The twin being updated, whose settings and decisions are kept. */
    previous?: SavedTwin;
    bookRecent?: number | null;
}): Promise<SavedTwin> {
    const { games, cardId, playerName, previous } = options;
    // `null` asks for every game again, so only a missing value keeps the previous choice.
    const bookRecent =
        options.bookRecent !== undefined ? options.bookRecent : (previous?.bookRecent ?? null);
    const fallbackRating = latestRating(games) ?? 1500;
    const profiles: Partial<Record<TwinProfileKey, TwinProfile>> = {};
    for (const key of profileKeysOf(games)) {
        const own = gamesOfProfile(games, key);
        const books = await loadPlayerBooks(bookGames(own, bookRecent));
        profiles[key] = refreshProfile(
            previous?.profiles[key],
            buildProfile(key, own, books, fallbackRating),
        );
    }
    const now = new Date().toISOString();
    const days = games.map((game) => game.day).filter((day): day is string => Boolean(day));
    return {
        id: previous?.id ?? newTwinId(),
        cardId,
        playerName,
        name: previous?.name ?? playerName,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        gamesUsed: games.length,
        lastDay: days.length ? days.reduce((a, b) => (a > b ? a : b)) : null,
        bookPlies: previous?.bookPlies ?? BOOK_PLIES,
        bookRecent,
        timing: previous?.timing ?? "player",
        thinking: twinThinking(games),
        profiles,
    };
}
