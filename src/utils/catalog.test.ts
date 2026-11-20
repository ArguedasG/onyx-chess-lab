import { describe, expect, it, vi } from "vitest";

const liveCatalog = vi.hoisted(() => ({ data: null as unknown }));

vi.mock("./http", () => ({
    fetchCatalog: async () => {
        if (liveCatalog.data === null) throw new Error("offline");
        return liveCatalog.data;
    },
}));

import bundledDatabases from "@/data/catalog/databases.json";
import bundledPuzzleDatabases from "@/data/catalog/puzzle_databases.json";
import {
    isReadableDatabase,
    loadDatabaseCatalog,
    loadPuzzleDatabaseCatalog,
    mergeCatalogs,
} from "./catalog";

describe("download catalog", () => {
    it("keeps live entries first and adds bundled ones the live catalog lacks", () => {
        const live = [{ downloadLink: "https://a", title: "A (live)" }];
        const bundled = [
            { downloadLink: "https://b", title: "B" },
            { downloadLink: "https://a", title: "A (bundled)" },
        ];
        expect(mergeCatalogs(live, bundled).map((entry) => entry.title)).toEqual(["A (live)", "B"]);
    });

    it("tells engine builds of the same archive apart by their path", () => {
        const bundled = [
            { downloadLink: "https://sf.zip", path: "sf-avx2.exe" },
            { downloadLink: "https://sf.zip", path: "sf.exe" },
        ];
        expect(mergeCatalogs([bundled[0]], bundled)).toHaveLength(2);
    });

    it("still lists every En Croissant base when its server cannot be reached", async () => {
        liveCatalog.data = null;
        const catalog = await loadDatabaseCatalog();
        expect(catalog.map((entry) => entry.downloadLink)).toEqual(
            bundledDatabases.map((entry) => entry.downloadLink),
        );
        expect(catalog.length).toBeGreaterThanOrEqual(5);
    });

    it("only offers databases Onyx can open (SQLite .db3)", () => {
        expect(isReadableDatabase({ downloadLink: "https://x/Lichess Puzzles 2026.db3" })).toBe(
            true,
        );
        expect(isReadableDatabase({ downloadLink: "https://x/a.DB3?v=2" })).toBe(true);
        expect(isReadableDatabase({ downloadLink: "https://x/Lichess Puzzles 2026.duckdb" })).toBe(
            false,
        );
    });

    it("leaves out the DuckDB copies the live catalog now lists", async () => {
        liveCatalog.data = [
            {
                title: "Lichess Puzzles 2026",
                downloadLink: "https://db.encroissant.org/Lichess Puzzles 2026.duckdb",
            },
        ];
        const puzzles = await loadPuzzleDatabaseCatalog();
        expect(puzzles.map((entry) => entry.downloadLink)).toEqual(
            bundledPuzzleDatabases.map((entry) => entry.downloadLink),
        );

        liveCatalog.data = [
            { title: "MillionBase", downloadLink: "https://db.encroissant.org/MillionBase.duckdb" },
        ];
        const games = await loadDatabaseCatalog();
        expect(games.map((entry) => entry.downloadLink)).toEqual(
            bundledDatabases.map((entry) => entry.downloadLink),
        );
    });
});
