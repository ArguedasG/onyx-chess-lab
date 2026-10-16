import { BaseDirectory, exists, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { warn } from "@tauri-apps/plugin-log";
import { atom, useAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { emptyQueues, type MistakeQueues, mistakeQueuesSchema } from "@/utils/mistakes/queue";

/**
 * The "My mistakes" queues (8.7) live in their own file in the app data folder, read the first
 * time the Training tab needs them: they never weigh on startup, unlike the training-areas file.
 * Writes are atomic (temporary file and rename) and debounced.
 */
export const MISTAKE_QUEUE_FILE = "mistake-queue-v1.json";
const appData = { baseDir: BaseDirectory.AppData };

export const mistakeQueuesAtom = atom<MistakeQueues | null>(null);

let loading: Promise<MistakeQueues> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function readQueues(): Promise<MistakeQueues> {
    if (!(await exists(MISTAKE_QUEUE_FILE, appData))) return emptyQueues();
    const raw = await readTextFile(MISTAKE_QUEUE_FILE, appData);
    const parsed = mistakeQueuesSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    // Kept aside, never overwritten: the data can still be recovered by hand.
    const aside = `${MISTAKE_QUEUE_FILE}.invalid-${Date.now()}`;
    await rename(MISTAKE_QUEUE_FILE, aside, {
        oldPathBaseDir: BaseDirectory.AppData,
        newPathBaseDir: BaseDirectory.AppData,
    });
    warn(`Mistake queue file was invalid and was moved to ${aside}`);
    return emptyQueues();
}

export function loadMistakeQueues(): Promise<MistakeQueues> {
    loading ??= readQueues().catch((error) => {
        loading = null;
        throw error;
    });
    return loading;
}

function scheduleSave(queues: MistakeQueues) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        const temporary = `${MISTAKE_QUEUE_FILE}.tmp`;
        void writeTextFile(temporary, JSON.stringify(queues), appData)
            .then(() =>
                rename(temporary, MISTAKE_QUEUE_FILE, {
                    oldPathBaseDir: BaseDirectory.AppData,
                    newPathBaseDir: BaseDirectory.AppData,
                }),
            )
            .catch((error) => warn(`Mistake queue could not be saved: ${String(error)}`));
    }, 400);
}

/** The queues, loaded on first use, and an updater that saves them. */
export function useMistakeQueues() {
    const [queues, setQueues] = useAtom(mistakeQueuesAtom);
    useEffect(() => {
        if (queues) return;
        void loadMistakeQueues()
            .then((loaded) => setQueues((current) => current ?? loaded))
            .catch((error) => warn(`Mistake queue could not be read: ${String(error)}`));
    }, [queues, setQueues]);
    // A change made before the file is read waits for it, so it never replaces saved items.
    const update = useCallback(
        (change: (current: MistakeQueues) => MistakeQueues) =>
            void loadMistakeQueues()
                .then((loaded) =>
                    setQueues((current) => {
                        const next = change(current ?? loaded);
                        scheduleSave(next);
                        return next;
                    }),
                )
                .catch((error) => warn(`Mistake queue could not be read: ${String(error)}`)),
        [setQueues],
    );
    return { queues, update };
}
