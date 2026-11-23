import { commands } from "@/bindings";

type StorageLike = Pick<Storage, "length" | "key" | "getItem" | "setItem">;

function isWindowsStylePath(path: string): boolean {
    return /^[a-zA-Z]:[\\/]/.test(path) || path.includes("\\");
}

function normalizePath(path: string, caseInsensitive: boolean): string {
    const normalized = path.replace(/[\\/]+$/, "").replaceAll("\\", "/");
    return caseInsensitive ? normalized.toLowerCase() : normalized;
}

export function rewritePathPrefix(
    value: string,
    oldPrefix: string,
    newPrefix: string,
    caseInsensitive = isWindowsStylePath(oldPrefix),
): string | null {
    const oldNorm = normalizePath(oldPrefix, caseInsensitive);
    if (!oldNorm) return null;

    const trimmedNew = newPrefix.replace(/[\\/]+$/, "");
    const valueNorm = normalizePath(value, caseInsensitive);

    if (valueNorm !== oldNorm && !valueNorm.startsWith(`${oldNorm}/`)) {
        return null;
    }

    // Locate the exact character boundary matching `oldNorm` in `value`.
    let matched = 0;
    let index = 0;
    while (index < value.length && matched < oldNorm.length) {
        const ch = value[index];
        const normalizedCh = ch === "\\" ? "/" : ch;
        const comparable = caseInsensitive ? normalizedCh.toLowerCase() : normalizedCh;
        if (comparable !== oldNorm[matched]) return null;
        matched += 1;
        index += 1;
    }
    if (matched !== oldNorm.length) return null;

    const suffix = value.slice(index);
    if (suffix.length > 0 && suffix[0] !== "/" && suffix[0] !== "\\") {
        return null;
    }

    const matchedSlice = value.slice(0, index);
    const replacementPrefix =
        matchedSlice.includes("/") && !matchedSlice.includes("\\")
            ? trimmedNew.replaceAll("\\", "/")
            : trimmedNew;

    return `${replacementPrefix}${suffix}`;
}

function rewriteJsonValue(
    value: unknown,
    oldPrefix: string,
    newPrefix: string,
    caseInsensitive: boolean,
): { value: unknown; changed: boolean } {
    if (typeof value === "string") {
        const rewritten = rewritePathPrefix(value, oldPrefix, newPrefix, caseInsensitive);
        return rewritten === null ? { value, changed: false } : { value: rewritten, changed: true };
    }
    if (Array.isArray(value)) {
        let changed = false;
        const next = value.map((item) => {
            const result = rewriteJsonValue(item, oldPrefix, newPrefix, caseInsensitive);
            if (result.changed) changed = true;
            return result.value;
        });
        return changed ? { value: next, changed: true } : { value, changed: false };
    }
    if (value !== null && typeof value === "object") {
        let changed = false;
        const record = value as Record<string, unknown>;
        const next: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(record)) {
            const result = rewriteJsonValue(v, oldPrefix, newPrefix, caseInsensitive);
            if (result.changed) changed = true;
            next[k] = result.value;
        }
        return changed ? { value: next, changed: true } : { value, changed: false };
    }
    return { value, changed: false };
}

/**
 * Rewrites persisted paths in localStorage after migrating the app identifier from
 * `org.encroissant.app` to `io.github.arguedasg.onyxchesslab`. Returns how many keys changed.
 */
export function rewriteMigratedStorage(
    storage: StorageLike | undefined,
    oldDataDir: string,
    newDataDir: string,
): number {
    if (!storage || !oldDataDir || !newDataDir) return 0;
    const caseInsensitive = isWindowsStylePath(oldDataDir);
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key !== null) keys.push(key);
    }

    let updated = 0;
    for (const key of keys) {
        const raw = storage.getItem(key);
        if (!raw) continue;

        let nextRaw: string | null = null;
        try {
            const parsed: unknown = JSON.parse(raw);
            const result = rewriteJsonValue(parsed, oldDataDir, newDataDir, caseInsensitive);
            if (result.changed) {
                nextRaw = JSON.stringify(result.value);
            }
        } catch {
            const rewritten = rewritePathPrefix(raw, oldDataDir, newDataDir, caseInsensitive);
            if (rewritten !== null) {
                nextRaw = rewritten;
            }
        }

        if (nextRaw !== null && nextRaw !== raw) {
            storage.setItem(key, nextRaw);
            updated += 1;
        }
    }
    return updated;
}

export type MigratedDataDirs = { oldDataDir: string; newDataDir: string };

let migratedDataDirs: MigratedDataDirs | null = null;
let enCroissantNoticePending = false;

/** Set at startup from the migration state; exported for tests. */
export function setMigratedDataDirs(dirs: MigratedDataDirs | null) {
    migratedDataDirs = dirs;
}

/**
 * The path as it was named before the identifier migration. Ids hashed from database paths
 * (Player Analysis profiles) were computed with the old folder; hashing this form keeps them
 * valid after the move, and new ids stay consistent with them. Unchanged without a migration.
 */
export function toLegacyDataPath(path: string): string {
    if (!migratedDataDirs) return path;
    return (
        rewritePathPrefix(path, migratedDataDirs.newDataDir, migratedDataDirs.oldDataDir) ?? path
    );
}

/** Whether to tell the user, once, that the folder shared with En Croissant moved to Onyx. */
export function takeEnCroissantNoticePending(): boolean {
    const pending = enCroissantNoticePending;
    enCroissantNoticePending = false;
    return pending;
}

export async function runPendingIdentifierMigration(): Promise<void> {
    try {
        const result = await commands.getIdentifierMigration();
        if (result.status !== "ok" || !result.data) return;

        const { oldDataDir, newDataDir, localStoragePending } = result.data;
        setMigratedDataDirs({ oldDataDir, newDataDir });
        enCroissantNoticePending = result.data.enCroissantNoticePending;
        if (!localStoragePending) return;
        if (typeof window !== "undefined") {
            rewriteMigratedStorage(window.localStorage, oldDataDir, newDataDir);
        }
        await commands.completeIdentifierMigration();
    } catch {
        // Migration check must never block app launch.
    }
}
