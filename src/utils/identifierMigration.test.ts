import { describe, expect, it } from "vitest";
import { rewriteMigratedStorage, rewritePathPrefix } from "./identifierMigration";

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

describe("identifierMigration", () => {
    const oldWin = String.raw`C:\Users\Gabriel\AppData\Roaming\org.encroissant.app`;
    const newWin = String.raw`C:\Users\Gabriel\AppData\Roaming\io.github.arguedasg.onyxchesslab`;

    it("rewrites Windows prefixes across case and separators without matching siblings", () => {
        expect(rewritePathPrefix(oldWin, oldWin, newWin)).toBe(newWin);
        expect(
            rewritePathPrefix(
                String.raw`c:\users\gabriel\appdata\roaming\org.encroissant.app\db\gigabase.db3`,
                oldWin,
                newWin,
            ),
        ).toBe(
            String.raw`C:\Users\Gabriel\AppData\Roaming\io.github.arguedasg.onyxchesslab\db\gigabase.db3`,
        );
        expect(
            rewritePathPrefix(
                "C:/Users/Gabriel/AppData/Roaming/org.encroissant.app/puzzles/lichess.db3",
                oldWin,
                newWin,
            ),
        ).toBe(
            "C:/Users/Gabriel/AppData/Roaming/io.github.arguedasg.onyxchesslab/puzzles/lichess.db3",
        );
        expect(
            rewritePathPrefix(
                String.raw`C:\Users\Gabriel\AppData\Roaming\org.encroissant.app2\db`,
                oldWin,
                newWin,
            ),
        ).toBeNull();
    });

    it("rewrites JSON and plain-string localStorage values while leaving unrelated keys alone", () => {
        const storage = memoryStorage({
            "databases-dir": JSON.stringify(`${oldWin}\\db`),
            "engines-dir": JSON.stringify(`${oldWin}\\engines`),
            "puzzles-dir": JSON.stringify(`${oldWin}\\puzzles`),
            "reference-database": JSON.stringify(`${oldWin}\\db\\LumbrasGigaBase.db3`),
            "document-dir": JSON.stringify(String.raw`C:\Users\Gabriel\Documents\Onyx Chess Lab`),
            "recent-files": JSON.stringify([
                { name: "study.pgn", path: `${oldWin}\\studies\\study.pgn` },
                { name: "external.pgn", path: String.raw`D:\Chess\external.pgn` },
            ]),
            "plain-path": `${oldWin}\\puzzles\\lichess.db3`,
            "mantine-primary-color": JSON.stringify("blue"),
        });

        const changed = rewriteMigratedStorage(storage, oldWin, newWin);
        expect(changed).toBe(6);
        expect(JSON.parse(storage.getItem("databases-dir")!)).toBe(`${newWin}\\db`);
        expect(JSON.parse(storage.getItem("engines-dir")!)).toBe(`${newWin}\\engines`);
        expect(JSON.parse(storage.getItem("puzzles-dir")!)).toBe(`${newWin}\\puzzles`);
        expect(JSON.parse(storage.getItem("reference-database")!)).toBe(
            `${newWin}\\db\\LumbrasGigaBase.db3`,
        );
        expect(JSON.parse(storage.getItem("document-dir")!)).toBe(
            String.raw`C:\Users\Gabriel\Documents\Onyx Chess Lab`,
        );
        expect(JSON.parse(storage.getItem("recent-files")!)).toEqual([
            { name: "study.pgn", path: `${newWin}\\studies\\study.pgn` },
            { name: "external.pgn", path: String.raw`D:\Chess\external.pgn` },
        ]);
        expect(storage.getItem("plain-path")).toBe(`${newWin}\\puzzles\\lichess.db3`);
        expect(JSON.parse(storage.getItem("mantine-primary-color")!)).toBe("blue");
    });

    it("handles Unix case-sensitive paths cleanly", () => {
        const oldUnix = "/Users/gabriel/Library/Application Support/org.encroissant.app";
        const newUnix =
            "/Users/gabriel/Library/Application Support/io.github.arguedasg.onyxchesslab";
        expect(rewritePathPrefix(`${oldUnix}/db/games.db3`, oldUnix, newUnix)).toBe(
            `${newUnix}/db/games.db3`,
        );
        expect(
            rewritePathPrefix(`${oldUnix.toUpperCase()}/db/games.db3`, oldUnix, newUnix),
        ).toBeNull();
    });
});
