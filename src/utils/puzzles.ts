import { resolve } from "@tauri-apps/api/path";
import { readDir } from "@tauri-apps/plugin-fs";
import { warn } from "@tauri-apps/plugin-log";
import { commands, type PuzzleDatabaseInfo } from "@/bindings";
import { getPuzzlesDir } from "@/utils/directories";

export type Completion = "correct" | "incorrect" | "incomplete";

export interface Puzzle {
    id: number;
    fen: string;
    moves: string[];
    rating: number;
    rating_deviation: number;
    popularity: number;
    nb_plays: number;
    completion: Completion;
    timeSpent?: number;
    themes?: string[];
}

async function getPuzzleDatabase(name: string): Promise<PuzzleDatabaseInfo | null> {
    const puzzlesDir = await getPuzzlesDir();
    const path = await resolve(puzzlesDir, name);
    const result = await commands.getPuzzleDbInfo(path);
    if (result.status === "ok") return result.data;
    // The puzzles folder can be any folder the user picks, so other .db3 files (game databases,
    // empty files) are expected there. They are left out quietly instead of raising a toast on
    // every screen that lists the puzzle databases.
    warn(`Skipping ${name} in the puzzles folder: ${result.error}`);
    return null;
}

export async function getPuzzleDatabases(): Promise<PuzzleDatabaseInfo[]> {
    const puzzlesDir = await getPuzzlesDir();
    const files = await readDir(puzzlesDir);
    const dbs = files.filter((file) => file.name?.toLowerCase().endsWith(".db3"));
    return (await Promise.allSettled(dbs.map((db) => getPuzzleDatabase(db.name))))
        .map((r) => (r.status === "fulfilled" ? r.value : null))
        .filter((db): db is PuzzleDatabaseInfo => db !== null);
}

function fileName(path: string) {
    return path.split(/[\\/]/).pop() ?? path;
}

/**
 * The selected puzzle database is stored as a full path, which goes stale when the puzzles folder
 * changes or the file is deleted. Keeps it when it is still listed, follows it to a file of the
 * same name in the current folder, falls back to the only database when there is one, and
 * otherwise clears it so nothing keeps opening a missing file.
 */
export function reconcileSelectedPuzzleDb(
    selected: string | null,
    databases: readonly PuzzleDatabaseInfo[],
): string | null {
    if (selected && databases.some((db) => db.path === selected)) return selected;
    if (selected) {
        const sameName = databases.find((db) => fileName(db.path) === fileName(selected));
        if (sameName) return sameName.path;
    }
    return databases.length === 1 ? databases[0].path : null;
}
