import { afterEach, describe, expect, it } from "vitest";
import { playerAnalysisProfileId } from "@/state/playerAnalysis";
import {
    DATA_FOLDER_MOVES_KEY,
    joinDataPath,
    recordDataFolderMove,
    resetDataFolderMovesCache,
    rewriteStorageForMove,
    toOriginalDataPath,
} from "./dataFolderMove";
import { setMigratedDataDirs } from "./identifierMigration";

function memoryStorage(initial: Record<string, string>) {
    const data = new Map(Object.entries(initial));
    return {
        get length() {
            return data.size;
        },
        key(index: number) {
            return [...data.keys()][index] ?? null;
        },
        getItem(key: string) {
            return data.get(key) ?? null;
        },
        setItem(key: string, value: string) {
            data.set(key, value);
        },
    };
}

describe("dataFolderMove", () => {
    const oldDb = "/Users/me/Library/Application Support/io.github.arguedasg.onyxchesslab/db";
    const newDb = "/Volumes/Chess/Onyx/db";

    afterEach(() => {
        resetDataFolderMovesCache();
        setMigratedDataDirs(null);
    });

    it("joins with the folder's own separator", () => {
        expect(joinDataPath("D:\\Chess\\", "games.db3")).toBe("D:\\Chess\\games.db3");
        expect(joinDataPath("/a/b/", "c")).toBe("/a/b/c");
    });

    it("rewrites only the moved entries and never the move history", () => {
        const history = JSON.stringify([{ from: oldDb, to: "/x", entries: ["games.db3"] }]);
        const storage = memoryStorage({
            "reference-database": JSON.stringify(`${oldDb}/games.db3`),
            "puzzle-db": JSON.stringify(`${oldDb}/kept.db3`),
            "databases-dir": JSON.stringify(oldDb),
            [DATA_FOLDER_MOVES_KEY]: history,
        });

        rewriteStorageForMove([storage], oldDb, newDb, ["games.db3"]);

        expect(JSON.parse(storage.getItem("reference-database")!)).toBe(`${newDb}/games.db3`);
        expect(JSON.parse(storage.getItem("puzzle-db")!)).toBe(`${oldDb}/kept.db3`);
        expect(JSON.parse(storage.getItem("databases-dir")!)).toBe(oldDb);
        expect(storage.getItem(DATA_FOLDER_MOVES_KEY)).toBe(history);
    });

    it("maps moved paths back through every move, newest first", () => {
        const storage = memoryStorage({});
        recordDataFolderMove({ from: oldDb, to: newDb, entries: ["games.db3"] }, storage);
        recordDataFolderMove(
            { from: newDb, to: String.raw`E:\Onyx\db`, entries: ["games.db3", "new.db3"] },
            storage,
        );

        expect(toOriginalDataPath(String.raw`E:\Onyx\db\games.db3`)).toBe(`${oldDb}/games.db3`);
        // Created after the first move: its original place is the second folder.
        expect(toOriginalDataPath(String.raw`E:\Onyx\db\new.db3`)).toBe(`${newDb}/new.db3`);
        expect(toOriginalDataPath(`${newDb}/other.db3`)).toBe(`${newDb}/other.db3`);
    });

    it("keeps Player Analysis profile ids after a move", () => {
        const before = playerAnalysisProfileId("Magnus", [
            { databasePath: `${oldDb}/games.db3`, playerId: 7 },
        ]);
        recordDataFolderMove({ from: oldDb, to: newDb, entries: ["games.db3"] }, memoryStorage({}));
        const after = playerAnalysisProfileId("Magnus", [
            { databasePath: `${newDb}/games.db3`, playerId: 7 },
        ]);
        expect(after).toBe(before);
    });
});
