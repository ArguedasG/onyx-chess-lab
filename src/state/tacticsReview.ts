import { BaseDirectory, exists, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { warn } from "@tauri-apps/plugin-log";
import { atom, useAtom } from "jotai";
import { useCallback, useEffect } from "react";
import {
    emptyTacticsReview,
    type TacticsReviewState,
    tacticsReviewSchema,
} from "@/utils/tacticsReview";

/**
 * The tactics review and the tactical rating (8.8) live in their own file, read the first time a
 * tactics screen needs them, like the "My mistakes" queue: they never weigh on startup. Writes
 * are atomic (temporary file and rename) and debounced.
 */
export const TACTICS_REVIEW_FILE = "tactics-review-v1.json";
const appData = { baseDir: BaseDirectory.AppData };

export const tacticsReviewAtom = atom<TacticsReviewState | null>(null);

let loading: Promise<TacticsReviewState> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function readState(): Promise<TacticsReviewState> {
    if (!(await exists(TACTICS_REVIEW_FILE, appData))) return emptyTacticsReview();
    const raw = await readTextFile(TACTICS_REVIEW_FILE, appData);
    const parsed = tacticsReviewSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    // Kept aside, never overwritten: the data can still be recovered by hand.
    const aside = `${TACTICS_REVIEW_FILE}.invalid-${Date.now()}`;
    await rename(TACTICS_REVIEW_FILE, aside, {
        oldPathBaseDir: BaseDirectory.AppData,
        newPathBaseDir: BaseDirectory.AppData,
    });
    warn(`Tactics review file was invalid and was moved to ${aside}`);
    return emptyTacticsReview();
}

export function loadTacticsReview(): Promise<TacticsReviewState> {
    loading ??= readState().catch((error) => {
        loading = null;
        throw error;
    });
    return loading;
}

function scheduleSave(state: TacticsReviewState) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        const temporary = `${TACTICS_REVIEW_FILE}.tmp`;
        void writeTextFile(temporary, JSON.stringify(state), appData)
            .then(() =>
                rename(temporary, TACTICS_REVIEW_FILE, {
                    oldPathBaseDir: BaseDirectory.AppData,
                    newPathBaseDir: BaseDirectory.AppData,
                }),
            )
            .catch((error) => warn(`Tactics review could not be saved: ${String(error)}`));
    }, 400);
}

/** The review and rating, loaded on first use, and an updater that saves them. */
export function useTacticsReview() {
    const [state, setState] = useAtom(tacticsReviewAtom);
    useEffect(() => {
        if (state) return;
        void loadTacticsReview()
            .then((loaded) => setState((current) => current ?? loaded))
            .catch((error) => warn(`Tactics review could not be read: ${String(error)}`));
    }, [state, setState]);
    // A change made before the file is read waits for it, so it never replaces saved items.
    const update = useCallback(
        (change: (current: TacticsReviewState) => TacticsReviewState) =>
            void loadTacticsReview()
                .then((loaded) =>
                    setState((current) => {
                        const next = change(current ?? loaded);
                        scheduleSave(next);
                        return next;
                    }),
                )
                .catch((error) => warn(`Tactics review could not be read: ${String(error)}`)),
        [setState],
    );
    return { state, update };
}
