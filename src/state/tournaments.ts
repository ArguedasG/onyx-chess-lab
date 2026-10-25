import { BaseDirectory, exists, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { warn } from "@tauri-apps/plugin-log";
import { atom, getDefaultStore, useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useCallback, useEffect } from "react";
import {
    emptyTournamentsState,
    type TournamentGame,
    type TournamentsState,
    tournamentsStateSchema,
} from "@/utils/tournaments/types";

/**
 * Tournaments (9.2) live in their own file in the app data folder, read the first time the
 * Tournaments section or a tournament game needs them: they never weigh on startup. Writes are
 * atomic (temporary file and rename), as for the mistake queue.
 */
export const TOURNAMENTS_FILE = "tournaments-v1.json";
const appData = { baseDir: BaseDirectory.AppData };

export const tournamentsAtom = atom<TournamentsState | null>(null);

/** Whether the rotating calendar is shown in the Tournaments section. */
export const tournamentCalendarVisibleAtom = atomWithStorage<boolean>(
    "tournament-calendar-visible",
    true,
);

let loading: Promise<TournamentsState> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function readTournaments(): Promise<TournamentsState> {
    if (!(await exists(TOURNAMENTS_FILE, appData))) return emptyTournamentsState();
    const raw = await readTextFile(TOURNAMENTS_FILE, appData);
    const parsed = tournamentsStateSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    // Kept aside, never overwritten: the data can still be recovered by hand.
    const aside = `${TOURNAMENTS_FILE}.invalid-${Date.now()}`;
    await rename(TOURNAMENTS_FILE, aside, {
        oldPathBaseDir: BaseDirectory.AppData,
        newPathBaseDir: BaseDirectory.AppData,
    });
    warn(`Tournaments file was invalid and was moved to ${aside}`);
    return emptyTournamentsState();
}

function loadTournaments(): Promise<TournamentsState> {
    loading ??= readTournaments().catch((error) => {
        loading = null;
        throw error;
    });
    return loading;
}

function scheduleSave(state: TournamentsState) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        const temporary = `${TOURNAMENTS_FILE}.tmp`;
        void writeTextFile(temporary, JSON.stringify(state), appData)
            .then(() =>
                rename(temporary, TOURNAMENTS_FILE, {
                    oldPathBaseDir: BaseDirectory.AppData,
                    newPathBaseDir: BaseDirectory.AppData,
                }),
            )
            .catch((error) => warn(`Tournaments could not be saved: ${String(error)}`));
    }, 300);
}

/**
 * Applies a change once the file is read, so a change made early never replaces saved
 * tournaments. Usable outside React (the game board calls it when a tournament game ends).
 */
export async function updateTournaments(
    change: (current: TournamentsState) => TournamentsState,
): Promise<TournamentsState> {
    const loaded = await loadTournaments();
    const store = getDefaultStore();
    const next = change(store.get(tournamentsAtom) ?? loaded);
    store.set(tournamentsAtom, next);
    scheduleSave(next);
    return next;
}

/** A game of a tournament, read from the file if needed. */
export async function findTournamentGame(
    tournamentId: string,
    gameId: string,
): Promise<TournamentGame | null> {
    const state = getDefaultStore().get(tournamentsAtom) ?? (await loadTournaments());
    return (
        state.tournaments
            .find((tournament) => tournament.id === tournamentId)
            ?.games.find((game) => game.id === gameId) ?? null
    );
}

/** The tournament shown when the Tournaments section opens, for the links from a game. */
export const selectedTournamentIdAtom = atom<string | null>(null);

/** The tournaments, loaded on first use, and an updater that saves them. */
export function useTournaments() {
    const [state, setState] = useAtom(tournamentsAtom);
    useEffect(() => {
        if (state) return;
        void loadTournaments()
            .then((loaded) => setState((current) => current ?? loaded))
            .catch((error) => warn(`Tournaments could not be read: ${String(error)}`));
    }, [state, setState]);
    const update = useCallback(
        (change: (current: TournamentsState) => TournamentsState) =>
            updateTournaments(change).catch((error) => {
                warn(`Tournaments could not be updated: ${String(error)}`);
                return null;
            }),
        [],
    );
    return { state, update };
}
