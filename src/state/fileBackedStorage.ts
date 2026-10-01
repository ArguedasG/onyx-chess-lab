import type { SyncStringStorage } from "jotai/vanilla/utils/atomWithStorage";

/** Minimal file access so the storage logic can be tested without Tauri. */
export interface TextFileSystem {
    exists(name: string): Promise<boolean>;
    read(name: string): Promise<string>;
    /** Must replace the file atomically: a crash leaves either the old or the new content. */
    write(name: string, contents: string): Promise<void>;
    rename(from: string, to: string): Promise<void>;
}

export interface FileBackedStorageOptions {
    fs: TextFileSystem;
    /** Where the value lived before; migrated once and then removed. */
    legacy?: Pick<Storage, "getItem" | "removeItem">;
    debounceMs?: number;
    onError?: (key: string, error: unknown) => void;
}

export interface FileBackedStorage extends SyncStringStorage {
    /** Loads a key before the app renders; `getItem` only serves preloaded keys. */
    preload(key: string): Promise<void>;
    /** Writes every pending value; await it before the window closes or the app is replaced. */
    flush(): Promise<void>;
    /** Moves the file aside instead of deleting it, so a reset stays recoverable. */
    archive(key: string, suffix: string): Promise<void>;
}

export function fileNameForKey(key: string): string {
    return `${key}.json`;
}

export function createFileBackedStorage({
    fs,
    legacy,
    debounceMs = 300,
    onError = () => {},
}: FileBackedStorageOptions): FileBackedStorage {
    const cache = new Map<string, string | null>();
    // Keys whose file exists but could not be read: writing would replace real data with defaults.
    const readOnly = new Set<string>();
    const pending = new Map<string, string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let writeChain: Promise<void> = Promise.resolve();

    function enqueue(task: () => Promise<void>): Promise<void> {
        writeChain = writeChain.then(task, task);
        return writeChain;
    }

    function writePending(): Promise<void> {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        const batch = [...pending.entries()];
        pending.clear();
        for (const [key, value] of batch) {
            void enqueue(async () => {
                try {
                    await fs.write(fileNameForKey(key), value);
                } catch (error) {
                    // Retry with the next change or flush unless a newer value is already queued.
                    if (!pending.has(key)) pending.set(key, value);
                    onError(key, error);
                }
            });
        }
        return writeChain;
    }

    async function archive(key: string, suffix: string) {
        pending.delete(key);
        cache.set(key, null);
        await enqueue(async () => {
            const file = fileNameForKey(key);
            if (await fs.exists(file)) {
                await fs.rename(file, fileNameForKey(`${key}.${suffix}`));
            }
        });
    }

    async function migrateLegacy(key: string, value: string) {
        const file = fileNameForKey(key);
        await fs.write(file, value);
        if ((await fs.read(file)) !== value) throw new Error(`Migrated ${file} does not match`);
        await fs.write(fileNameForKey(`${key}.localstorage-backup`), value);
        legacy?.removeItem(key);
    }

    return {
        async preload(key) {
            if (cache.has(key)) return;
            const file = fileNameForKey(key);
            try {
                if (await fs.exists(file)) {
                    cache.set(key, await fs.read(file));
                    return;
                }
            } catch (error) {
                readOnly.add(key);
                cache.set(key, legacy?.getItem(key) ?? null);
                onError(key, error);
                return;
            }

            const legacyValue = legacy?.getItem(key) ?? null;
            cache.set(key, legacyValue);
            if (legacyValue === null) return;
            try {
                await migrateLegacy(key, legacyValue);
            } catch (error) {
                // The legacy copy stays in place; the next write retries the file.
                onError(key, error);
            }
        },
        getItem(key) {
            if (!cache.has(key)) throw new Error(`Storage key ${key} was not preloaded`);
            return cache.get(key) ?? null;
        },
        setItem(key, value) {
            // Writing a key that was never preloaded is fine (e.g. an `.invalid-*` backup); reading
            // one is not, because the app would start from defaults and overwrite the real file.
            if (readOnly.has(key)) {
                throw new Error(
                    `Storage for ${key} is read-only because its file could not be read`,
                );
            }
            cache.set(key, value);
            pending.set(key, value);
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => void writePending(), debounceMs);
        },
        removeItem(key) {
            // Only reached when a value is reset; keep the file recoverable.
            void archive(key, `removed-${Date.now()}`);
        },
        flush() {
            return writePending();
        },
        archive,
    };
}
