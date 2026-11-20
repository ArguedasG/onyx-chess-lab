import { describe, expect, it, vi } from "vitest";

vi.mock("@/bindings", () => ({ commands: {} }));
vi.mock("@/utils/directories", () => ({ getPuzzlesDir: async () => "" }));

import type { PuzzleDatabaseInfo } from "@/bindings";
import { reconcileSelectedPuzzleDb } from "./puzzles";

function db(path: string): PuzzleDatabaseInfo {
    return { title: path, description: "", puzzleCount: 1, storageSize: BigInt(1), path };
}

describe("selected puzzle database", () => {
    const lichess = db("D:\\Puzzles\\Lichess Puzzles 2026.db3");
    const mine = db("D:\\Puzzles\\Mine.db3");

    it("keeps a selection that is still listed", () => {
        expect(reconcileSelectedPuzzleDb(mine.path, [lichess, mine])).toBe(mine.path);
    });

    it("follows the same file to the new puzzles folder", () => {
        const old = "C:\\Users\\me\\AppData\\Roaming\\onyx\\puzzles\\Lichess Puzzles 2026.db3";
        expect(reconcileSelectedPuzzleDb(old, [mine, lichess])).toBe(lichess.path);
        expect(reconcileSelectedPuzzleDb("/old/puzzles/Mine.db3", [lichess, mine])).toBe(mine.path);
    });

    it("clears a missing selection unless only one database is left", () => {
        const gone = "C:\\gone\\Other.db3";
        expect(reconcileSelectedPuzzleDb(gone, [lichess, mine])).toBeNull();
        expect(reconcileSelectedPuzzleDb(gone, [lichess])).toBe(lichess.path);
        expect(reconcileSelectedPuzzleDb(gone, [])).toBeNull();
        expect(reconcileSelectedPuzzleDb(null, [lichess, mine])).toBeNull();
    });
});
