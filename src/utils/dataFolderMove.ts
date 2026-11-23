import { commands, type DataFolderKind, type DataFolderMoveResult } from "@/bindings";
import { flushPendingSessionWrites } from "@/state/store/debouncedStorage";
import { rewriteMigratedStorage, rewritePathPrefix, toLegacyDataPath } from "./identifierMigration";
import { unwrap } from "./unwrap";

type StorageLike = Pick<Storage, "length" | "key" | "getItem" | "setItem">;

/** A folder change that carried its contents: the entries moved from one folder to the other. */
export type DataFolderMove = { from: string; to: string; entries: string[] };

/** History of moves, oldest first. It is itself never rewritten by a move. */
export const DATA_FOLDER_MOVES_KEY = "data-folder-moves";
/** What to tell the user once Onyx reloads after a move. */
const MOVE_NOTICE_KEY = "data-folder-move-notice";

export type DataFolderMoveNotice = DataFolderMoveResult & { to: string };

export function joinDataPath(dir: string, name: string): string {
    const separator = dir.includes("\\") ? "\\" : "/";
    return `${dir.replace(/[\\/]+$/, "")}${separator}${name}`;
}

function isMove(value: unknown): value is DataFolderMove {
    if (!value || typeof value !== "object") return false;
    const move = value as Record<string, unknown>;
    return (
        typeof move.from === "string" &&
        typeof move.to === "string" &&
        Array.isArray(move.entries) &&
        move.entries.every((entry) => typeof entry === "string")
    );
}

let cachedMoves: DataFolderMove[] | null = null;

export function readDataFolderMoves(storage: StorageLike | undefined = globalThis.localStorage) {
    if (cachedMoves) return cachedMoves;
    let moves: DataFolderMove[] = [];
    try {
        const parsed: unknown = JSON.parse(storage?.getItem(DATA_FOLDER_MOVES_KEY) ?? "[]");
        if (Array.isArray(parsed)) moves = parsed.filter(isMove);
    } catch {
        // A damaged history only affects ids of profiles analysed before a move.
    }
    cachedMoves = moves;
    return moves;
}

export function recordDataFolderMove(
    move: DataFolderMove,
    storage: StorageLike | undefined = globalThis.localStorage,
) {
    const moves = [...readDataFolderMoves(storage), move];
    storage?.setItem(DATA_FOLDER_MOVES_KEY, JSON.stringify(moves));
    cachedMoves = moves;
}

/** Exported for tests. */
export function resetDataFolderMovesCache() {
    cachedMoves = null;
}

/**
 * The path a file had before every folder move and the identifier migration. Ids hashed from
 * database paths (Player Analysis profiles) use this form, so they survive a move.
 */
export function toOriginalDataPath(path: string, moves = readDataFolderMoves()): string {
    let current = path;
    for (const move of [...moves].reverse()) {
        for (const entry of move.entries) {
            const before = rewritePathPrefix(
                current,
                joinDataPath(move.to, entry),
                joinDataPath(move.from, entry),
            );
            if (before !== null) {
                current = before;
                break;
            }
        }
    }
    return toLegacyDataPath(current);
}

/** Points every path saved in browser storage at the moved entries. */
export function rewriteStorageForMove(
    storages: Array<StorageLike | undefined>,
    from: string,
    to: string,
    moved: string[],
) {
    for (const entry of moved) {
        const oldPath = joinDataPath(from, entry);
        const newPath = joinDataPath(to, entry);
        for (const storage of storages) {
            rewriteMigratedStorage(storage, oldPath, newPath, [DATA_FOLDER_MOVES_KEY]);
        }
    }
}

export async function previewDataFolderMove(from: string, to: string) {
    return unwrap(await commands.previewDataFolderMove(from, to));
}

/**
 * Moves the contents of a data folder and rewrites the saved paths. Onyx must reload afterwards:
 * the state already in memory still holds the old paths.
 */
export async function moveDataFolder(
    kind: DataFolderKind,
    from: string,
    to: string,
): Promise<DataFolderMoveResult> {
    flushPendingSessionWrites();
    const result = unwrap(await commands.moveDataFolder(kind, from, to));
    rewriteStorageForMove([localStorage, sessionStorage], from, to, result.moved);
    if (result.moved.length > 0) {
        recordDataFolderMove({ from, to, entries: result.moved });
    }
    sessionStorage.setItem(MOVE_NOTICE_KEY, JSON.stringify({ ...result, to }));
    return result;
}

export function takeDataFolderMoveNotice(): DataFolderMoveNotice | null {
    try {
        const raw = sessionStorage.getItem(MOVE_NOTICE_KEY);
        if (!raw) return null;
        sessionStorage.removeItem(MOVE_NOTICE_KEY);
        return JSON.parse(raw) as DataFolderMoveNotice;
    } catch {
        return null;
    }
}
