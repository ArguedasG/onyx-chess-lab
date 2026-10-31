import { BaseDirectory, exists, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { warn } from "@tauri-apps/plugin-log";
import { atom, useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import {
    emptyTwinsFile,
    type SavedTwin,
    type SavedTwinsFile,
    savedTwinsFileSchema,
} from "@/utils/preparation/savedTwins";

/**
 * Saved twins live in their own file in the app data folder, read the first time something needs
 * them (a player card, the opponent form, a tournament): their books can weigh hundreds of KB, so
 * they never load at startup. Writes are atomic (temporary file and rename) and debounced, as for
 * the "My mistakes" queue.
 */
export const SAVED_TWINS_FILE = "twins-v1.json";
const appData = { baseDir: BaseDirectory.AppData };

export const savedTwinsAtom = atom<SavedTwinsFile | null>(null);

/**
 * Twins built this session and not saved: they can be played but go away when Onyx closes. The
 * board finds a twin by id here or among the saved ones.
 */
export const twinDraftsAtom = atom<Record<string, SavedTwin>>({});

let loading: Promise<SavedTwinsFile> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function readTwins(): Promise<SavedTwinsFile> {
    if (!(await exists(SAVED_TWINS_FILE, appData))) return emptyTwinsFile();
    const raw = await readTextFile(SAVED_TWINS_FILE, appData);
    const parsed = savedTwinsFileSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data as SavedTwinsFile;
    // Kept aside, never overwritten: the data can still be recovered by hand.
    const aside = `${SAVED_TWINS_FILE}.invalid-${Date.now()}`;
    await rename(SAVED_TWINS_FILE, aside, {
        oldPathBaseDir: BaseDirectory.AppData,
        newPathBaseDir: BaseDirectory.AppData,
    });
    warn(`Saved twins file was invalid and was moved to ${aside}`);
    return emptyTwinsFile();
}

export function loadSavedTwins(): Promise<SavedTwinsFile> {
    loading ??= readTwins().catch((error) => {
        loading = null;
        throw error;
    });
    return loading;
}

function scheduleSave(file: SavedTwinsFile) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        const temporary = `${SAVED_TWINS_FILE}.tmp`;
        void writeTextFile(temporary, JSON.stringify(file), appData)
            .then(() =>
                rename(temporary, SAVED_TWINS_FILE, {
                    oldPathBaseDir: BaseDirectory.AppData,
                    newPathBaseDir: BaseDirectory.AppData,
                }),
            )
            .catch((error) => warn(`Saved twins could not be saved: ${String(error)}`));
    }, 400);
}

/** The saved twins, loaded on first use, and an updater that saves them. */
export function useSavedTwins() {
    const [file, setFile] = useAtom(savedTwinsAtom);
    useEffect(() => {
        if (file) return;
        void loadSavedTwins()
            .then((loaded) => setFile((current) => current ?? loaded))
            .catch((error) => warn(`Saved twins could not be read: ${String(error)}`));
    }, [file, setFile]);
    // A change made before the file is read waits for it, so it never replaces saved twins.
    const update = useCallback(
        (change: (twins: SavedTwin[]) => SavedTwin[]) =>
            void loadSavedTwins()
                .then((loaded) =>
                    setFile((current) => {
                        const base = current ?? loaded;
                        const next = { ...base, twins: change(base.twins) };
                        scheduleSave(next);
                        return next;
                    }),
                )
                .catch((error) => warn(`Saved twins could not be read: ${String(error)}`)),
        [setFile],
    );
    const save = useCallback(
        (twin: SavedTwin) =>
            update((twins) =>
                twins.some((other) => other.id === twin.id)
                    ? twins.map((other) => (other.id === twin.id ? twin : other))
                    : [...twins, twin],
            ),
        [update],
    );
    const remove = useCallback(
        (id: string) => update((twins) => twins.filter((twin) => twin.id !== id)),
        [update],
    );
    return { twins: file?.twins ?? null, save, remove };
}

/** A twin by id, saved or built this session; loads the saved ones if needed. */
export function useTwinLookup() {
    const { twins } = useSavedTwins();
    const drafts = useAtomValue(twinDraftsAtom);
    return useMemo(() => {
        const byId = new Map<string, SavedTwin>();
        for (const twin of Object.values(drafts)) byId.set(twin.id, twin);
        for (const twin of twins ?? []) byId.set(twin.id, twin);
        return { loaded: twins !== null, get: (id: string) => byId.get(id) ?? null };
    }, [drafts, twins]);
}
